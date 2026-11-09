package com.boatstation.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BoatStationCoreService extends Service {
    public static final String ACTION_START = "com.boatstation.app.action.START_CORE";
    public static final String ACTION_STOP = "com.boatstation.app.action.STOP_CORE";
    public static final String ACTION_CONFIGURE_REMOTE = "com.boatstation.app.action.CONFIGURE_REMOTE";
    public static final String ACTION_CONFIGURE_CLIENT = "com.boatstation.app.action.CONFIGURE_CLIENT";
    public static final String ACTION_CLEAR_REMOTE_SYNC = "com.boatstation.app.action.CLEAR_REMOTE_SYNC";
    public static final String EXTRA_STATION_ID = "stationId";
    public static final String EXTRA_TOKEN = "token";
    public static final String EXTRA_BACKEND = "backend";
    public static final String EXTRA_STATION_NAME = "stationName";
    public static final String EXTRA_CLIENT_ID = "clientId";

    private static final String CHANNEL_ID = "boat_station_core";
    private static final int NOTIFICATION_ID = 4101;
    private static final String PREFS = "boat_station_core";
    private static final String PREF_SYNC_MODE = "syncMode";
    private static final String MODE_SERVER = "server";
    private static final String MODE_CLIENT = "client";
    private static final String PREF_CLIENT_STATION_ID = "clientStationId";
    private static final String PREF_CLIENT_TOKEN = "clientToken";
    private static final String PREF_CLIENT_BACKEND = "clientBackend";
    private static final String PREF_CLIENT_NAME = "clientName";
    private static final String PREF_CLIENT_ID = "clientId";
    private static final long SYNC_INTERVAL_MS = 5000L;
    private static final long MAX_BACKOFF_MS = 60000L;
    private static final int HTTP_TIMEOUT_MS = 7000;
    private static final String TAG = "BoatStationCore";

    private static volatile BoatStationCoreService activeService;
    private static volatile String pendingStationSnapshot = "";

    private final LocalBinder binder = new LocalBinder();
    private long startedAtElapsedRealtime;
    private PowerManager.WakeLock wakeLock;
    private Handler syncHandler;
    private ExecutorService syncExecutor;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private volatile String latestStationSnapshot = "";
    private volatile String latestRemoteState = "";
    private boolean syncInFlight;
    private boolean syncPending;
    private int consecutiveSyncFailures;
    private final Runnable syncRunnable = this::runSyncCycle;

    public final class LocalBinder extends Binder {
        public BoatStationCoreService getService() { return BoatStationCoreService.this; }
    }

    @Override public void onCreate() {
        super.onCreate();
        activeService = this;
        startedAtElapsedRealtime = SystemClock.elapsedRealtime();
        latestStationSnapshot = pendingStationSnapshot;
        syncHandler = new Handler(getMainLooper());
        syncExecutor = Executors.newSingleThreadExecutor(r -> new Thread(r, "BoatStationSync"));
        createNotificationChannel();
        acquireWakeLock();
        registerNetworkCallback();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_CONFIGURE_REMOTE.equals(intent.getAction())) persistRemoteConfig(intent);
        else if (intent != null && ACTION_CONFIGURE_CLIENT.equals(intent.getAction())) persistRemoteClientConfig(intent);
        else if (intent != null && ACTION_CLEAR_REMOTE_SYNC.equals(intent.getAction())) clearRemoteSync();

        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        scheduleSync(0L);
        return START_STICKY;
    }

    @Override public IBinder onBind(Intent intent) { return binder; }

    public long getUptimeMs() {
        return Math.max(0L, SystemClock.elapsedRealtime() - startedAtElapsedRealtime);
    }

    public SharedPreferences getCorePreferences() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    public static void updateStationSnapshot(String snapshot) {
        if (snapshot == null || snapshot.trim().isEmpty()) return;
        try { new JSONObject(snapshot); } catch (Exception ignored) { return; }
        pendingStationSnapshot = snapshot;
        BoatStationCoreService service = activeService;
        if (service != null) service.latestStationSnapshot = snapshot;
    }

    public static String getLatestRemoteState() {
        BoatStationCoreService service = activeService;
        return service == null ? "" : service.latestRemoteState;
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BoatStation:Core");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Exception ignored) {}
    }

    private void persistRemoteConfig(Intent intent) {
        String stationId = intent.getStringExtra(EXTRA_STATION_ID);
        String token = intent.getStringExtra(EXTRA_TOKEN);
        String backend = intent.getStringExtra(EXTRA_BACKEND);
        String stationName = intent.getStringExtra(EXTRA_STATION_NAME);
        if (stationId == null || stationId.trim().isEmpty() || token == null || token.trim().isEmpty()
                || backend == null || backend.trim().isEmpty()) return;

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String sid = stationId.trim();
        if (!sid.equals(prefs.getString(EXTRA_STATION_ID, ""))) {
            pendingStationSnapshot = "";
            latestStationSnapshot = "";
        }
        String name = stationName == null ? "" : stationName.trim();
        prefs.edit()
                .putString(PREF_SYNC_MODE, MODE_SERVER)
                .putString(EXTRA_STATION_ID, sid)
                .putString(EXTRA_TOKEN, token.trim())
                .putString(EXTRA_BACKEND, backend.trim())
                .putString(EXTRA_STATION_NAME, name)
                .remove(PREF_CLIENT_STATION_ID)
                .remove(PREF_CLIENT_TOKEN)
                .remove(PREF_CLIENT_BACKEND)
                .remove(PREF_CLIENT_NAME)
                .remove(PREF_CLIENT_ID)
                .apply();
        latestRemoteState = "";
        consecutiveSyncFailures = 0;
    }

    private void persistRemoteClientConfig(Intent intent) {
        String stationId = intent.getStringExtra(EXTRA_STATION_ID);
        String token = intent.getStringExtra(EXTRA_TOKEN);
        String backend = intent.getStringExtra(EXTRA_BACKEND);
        String clientName = intent.getStringExtra(EXTRA_STATION_NAME);
        String clientId = intent.getStringExtra(EXTRA_CLIENT_ID);
        if (stationId == null || stationId.trim().isEmpty() || token == null || token.trim().isEmpty()
                || backend == null || backend.trim().isEmpty() || clientId == null || clientId.trim().isEmpty()) return;

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String sid = stationId.trim();
        String previousId = prefs.getString(PREF_CLIENT_STATION_ID, "");
        if (!sid.equals(previousId)) latestRemoteState = "";
        prefs.edit()
                .putString(PREF_SYNC_MODE, MODE_CLIENT)
                .putString(PREF_CLIENT_STATION_ID, sid)
                .putString(PREF_CLIENT_TOKEN, token.trim())
                .putString(PREF_CLIENT_BACKEND, backend.trim())
                .putString(PREF_CLIENT_NAME, clientName == null ? "Remote" : clientName.trim())
                .putString(PREF_CLIENT_ID, clientId.trim())
                .apply();
        consecutiveSyncFailures = 0;
    }

    private void clearRemoteSync() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .remove(PREF_SYNC_MODE)
                .remove(PREF_CLIENT_STATION_ID)
                .remove(PREF_CLIENT_TOKEN)
                .remove(PREF_CLIENT_BACKEND)
                .remove(PREF_CLIENT_NAME)
                .remove(PREF_CLIENT_ID)
                .apply();
        latestRemoteState = "";
        consecutiveSyncFailures = 0;
        syncHandler.removeCallbacks(syncRunnable);
    }

    private boolean hasSyncMode() {
        String mode = getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_SYNC_MODE, "");
        return MODE_SERVER.equals(mode) || MODE_CLIENT.equals(mode);
    }

    private void scheduleSync(long delayMs) {
        if (syncHandler == null || !hasSyncMode()) return;
        if (syncInFlight) {
            syncPending = true;
            return;
        }
        syncHandler.removeCallbacks(syncRunnable);
        syncHandler.postDelayed(syncRunnable, Math.max(0L, delayMs));
    }

    private void runSyncCycle() {
        if (syncInFlight || !hasSyncMode()) return;
        if (!networkAvailable()) {
            consecutiveSyncFailures = Math.min(consecutiveSyncFailures + 1, 8);
            scheduleSync(nextSyncDelay());
            return;
        }

        syncInFlight = true;
        try {
            syncExecutor.execute(() -> {
                Exception failure = null;
                try {
                    String mode = getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_SYNC_MODE, "");
                    if (MODE_SERVER.equals(mode)) publishStationState();
                    else if (MODE_CLIENT.equals(mode)) pollRemoteStation();
                } catch (Exception e) {
                    failure = e;
                }
                final Exception result = failure;
                Handler handler = syncHandler;
                if (handler != null) handler.post(() -> {
                    syncInFlight = false;
                    if (result == null) consecutiveSyncFailures = 0;
                    else {
                        consecutiveSyncFailures = Math.min(consecutiveSyncFailures + 1, 8);
                        Log.w(TAG, "Background sync failed; retry scheduled", result);
                    }
                    long delay = syncPending ? 0L : nextSyncDelay();
                    syncPending = false;
                    scheduleSync(delay);
                });
            });
        } catch (Exception e) {
            syncInFlight = false;
            consecutiveSyncFailures = Math.min(consecutiveSyncFailures + 1, 8);
            Log.w(TAG, "Could not queue background sync", e);
            scheduleSync(nextSyncDelay());
        }
    }

    private long nextSyncDelay() {
        if (!networkAvailable()) return 10000L;
        if (consecutiveSyncFailures > 0) {
            int exponent = Math.min(consecutiveSyncFailures - 1, 5);
            return Math.min(MAX_BACKOFF_MS, 2000L * (1L << exponent));
        }
        return SYNC_INTERVAL_MS;
    }

    private boolean networkAvailable() {
        try {
            ConnectivityManager manager = connectivityManager;
            if (manager == null) manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return false;
            Network active = manager.getActiveNetwork();
            NetworkCapabilities capabilities = active == null ? null : manager.getNetworkCapabilities(active);
            return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception ignored) {
            return false;
        }
    }

    private void registerNetworkCallback() {
        try {
            connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) {
                    Handler handler = syncHandler;
                    if (handler != null) handler.post(() -> {
                        consecutiveSyncFailures = 0;
                        scheduleSync(0L);
                    });
                }
                @Override public void onLost(Network network) {
                    Handler handler = syncHandler;
                    if (handler != null) handler.post(() -> scheduleSync(10000L));
                }
            };
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception e) {
            Log.w(TAG, "Network callback unavailable", e);
        }
    }

    private void publishStationState() throws Exception {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String stationId = prefs.getString(EXTRA_STATION_ID, "");
        String token = prefs.getString(EXTRA_TOKEN, "");
        String backend = prefs.getString(EXTRA_BACKEND, "");
        String stationName = prefs.getString(EXTRA_STATION_NAME, "Estación");
        String serialized = latestStationSnapshot;
        if (stationId.isEmpty() || token.isEmpty() || backend.isEmpty() || serialized.isEmpty()) return;

        JSONObject telemetry = new JSONObject(serialized);
        JSONObject remoteSnapshot = new JSONObject()
                .put("telemetry", telemetry)
                .put("boatName", stationName);
        JSONObject body = new JSONObject()
                .put("token", token)
                .put("boatName", stationName)
                .put("snapshot", remoteSnapshot);
        String url = trimSlash(backend) + "/api/station/" + Uri.encode(stationId) + "/state";
        request(url, "POST", null, body.toString());
    }

    private void pollRemoteStation() throws Exception {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String stationId = prefs.getString(PREF_CLIENT_STATION_ID, "");
        String token = prefs.getString(PREF_CLIENT_TOKEN, "");
        String backend = prefs.getString(PREF_CLIENT_BACKEND, "");
        String clientName = prefs.getString(PREF_CLIENT_NAME, "Remote");
        String clientId = prefs.getString(PREF_CLIENT_ID, "");
        if (stationId.isEmpty() || token.isEmpty() || backend.isEmpty() || clientId.isEmpty()) return;

        String url = trimSlash(backend) + "/api/station/" + Uri.encode(stationId)
                + "/state?clientId=" + Uri.encode(clientId)
                + "&clientName=" + Uri.encode(clientName);
        String response = request(url, "GET", token, null);
        new JSONObject(response);
        latestRemoteState = response;
    }

    private String request(String url, String method, String bearerToken, String body) throws IOException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(HTTP_TIMEOUT_MS);
            connection.setReadTimeout(HTTP_TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            if (bearerToken != null && !bearerToken.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + bearerToken);
            }
            if (body != null) {
                byte[] data = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setFixedLengthStreamingMode(data.length);
                try (OutputStream output = connection.getOutputStream()) { output.write(data); }
            }
            int status = connection.getResponseCode();
            InputStream input = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            String response = readAll(input);
            if (status < 200 || status >= 300) throw new IOException("HTTP " + status + " from Boat Station backend");
            return response;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String readAll(InputStream input) throws IOException {
        if (input == null) return "";
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private String trimSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Boat Station Core", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Mantiene activa la comunicación con la estación Boat Station");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, BoatStationActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 0, openIntent, pendingFlags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Boat Station")
                .setContentText("Conexión de estación activa")
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    @Override public void onDestroy() {
        if (syncHandler != null) syncHandler.removeCallbacksAndMessages(null);
        try {
            if (connectivityManager != null && networkCallback != null) connectivityManager.unregisterNetworkCallback(networkCallback);
        } catch (Exception ignored) {}
        if (syncExecutor != null) syncExecutor.shutdownNow();
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        if (activeService == this) activeService = null;
        wakeLock = null;
        super.onDestroy();
    }
}
