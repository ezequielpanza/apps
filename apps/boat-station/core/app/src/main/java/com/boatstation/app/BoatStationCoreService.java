package com.boatstation.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

public class BoatStationCoreService extends Service implements LocationListener {
    public static final String ACTION_START = "com.boatstation.app.action.START_CORE";
    public static final String ACTION_STOP = "com.boatstation.app.action.STOP_CORE";
    public static final String ACTION_CONFIGURE_REMOTE = "com.boatstation.app.action.CONFIGURE_REMOTE";
    public static final String ACTION_CONFIGURE_CLIENT = "com.boatstation.app.action.CONFIGURE_CLIENT";
    public static final String ACTION_CLEAR_REMOTE_SYNC = "com.boatstation.app.action.CLEAR_REMOTE_SYNC";
    public static final String ACTION_CONFIGURE_GPS_HISTORY = "com.boatstation.app.action.CONFIGURE_GPS_HISTORY";
    public static final String ACTION_CONFIGURE_NOTIFICATIONS = "com.boatstation.app.action.CONFIGURE_NOTIFICATIONS";
    public static final String ACTION_SPEAK_ALARM = "com.boatstation.app.action.SPEAK_ALARM";
    public static final String EXTRA_GPS_HISTORY_ENABLED = "gpsHistoryEnabled";
    public static final String EXTRA_GPS_HISTORY_HOURS = "gpsHistoryHours";
    public static final String EXTRA_GPS_HISTORY_FREQUENCY = "gpsHistoryFrequency";
    public static final String EXTRA_GPS_ANCHOR_ENABLED = "gpsAnchorEnabled";
    public static final String EXTRA_GPS_ANCHOR_LAT = "gpsAnchorLat";
    public static final String EXTRA_GPS_ANCHOR_LON = "gpsAnchorLon";
    public static final String EXTRA_GPS_ANCHOR_RADIUS = "gpsAnchorRadius";
    public static final String EXTRA_GPS_ANCHOR_RADIUS_METERS = "gpsAnchorRadiusMeters";
    public static final String EXTRA_GPS_ANCHOR_RADIUS_UNIT = "gpsAnchorRadiusUnit";
    public static final String EXTRA_STATION_ID = "stationId";
    public static final String EXTRA_TOKEN = "token";
    public static final String EXTRA_BACKEND = "backend";
    public static final String EXTRA_STATION_NAME = "stationName";
    public static final String EXTRA_CLIENT_ID = "clientId";
    public static final String EXTRA_NOTIFICATION_SETTINGS = "notificationSettings";
    public static final String EXTRA_ALARM_TEXT = "alarmText";

    private static final String CHANNEL_ID = "boat_station_core";
    private static final String ANCHOR_CHANNEL_ID = "boat_station_anchor_alarm";
    private static final String ALARM_CHANNEL_ID = "boat_station_background_alarm";
    private static final int NOTIFICATION_ID = 4101;
    private static final int ANCHOR_NOTIFICATION_ID = 4102;
    private static final int BACKGROUND_ALARM_NOTIFICATION_ID = 4103;
    private static final String PREFS = "boat_station_core";
    private static final String PREF_SYNC_MODE = "syncMode";
    private static final String MODE_SERVER = "server";
    private static final String MODE_CLIENT = "client";
    private static final String PREF_CLIENT_STATION_ID = "clientStationId";
    private static final String PREF_CLIENT_TOKEN = "clientToken";
    private static final String PREF_CLIENT_BACKEND = "clientBackend";
    private static final String PREF_CLIENT_NAME = "clientName";
    private static final String PREF_CLIENT_ID = "clientId";
    private static final String PREF_NOTIFICATION_SETTINGS = "notificationSettings";
    private static final String PREF_CONNECTION_INITIALIZED = "connectionAlarmInitialized";
    private static final String PREF_CONNECTION_CONNECTED = "connectionAlarmConnected";
    private static final String PREF_CONNECTION_STATION_ID = "connectionAlarmStationId";
    private static final String PREF_LAST_REMOTE_TELEMETRY_TIME = "lastRemoteTelemetryTime";
    private static final String PREF_GPS_HISTORY_ENABLED = "gpsHistoryEnabled";
    private static final String PREF_GPS_HISTORY_HOURS = "gpsHistoryHours";
    private static final String PREF_GPS_HISTORY_FREQUENCY = "gpsHistoryFrequency";
    private static final String PREF_GPS_ANCHOR_ENABLED = "gpsAnchorEnabled";
    private static final String PREF_GPS_ANCHOR_LAT = "gpsAnchorLat";
    private static final String PREF_GPS_ANCHOR_LON = "gpsAnchorLon";
    private static final String PREF_GPS_ANCHOR_RADIUS = "gpsAnchorRadius";
    private static final String PREF_GPS_ANCHOR_RADIUS_METERS = "gpsAnchorRadiusMeters";
    private static final String PREF_GPS_ANCHOR_RADIUS_UNIT = "gpsAnchorRadiusUnit";
    private static final String PREF_GPS_ANCHOR_TRIPPED = "gpsAnchorTripped";
    private static final long SYNC_INTERVAL_MS = 5000L;
    private static final String PREF_SYNC_INTERVAL_SECONDS = "syncIntervalSeconds";
    private static final long MAX_BACKOFF_MS = 60000L;
    private static final int HTTP_TIMEOUT_MS = 7000;
    private static final String TAG = "BoatStationCore";

    private static volatile BoatStationCoreService activeService;
    private static volatile String pendingStationSnapshot = "";

    private final LocalBinder binder = new LocalBinder();
    private LocationManager locationManager;
    private GpsHistoryStore gpsHistoryStore;
    private boolean gpsHistoryEnabled;
    private int gpsHistoryHours = 6;
    private int gpsHistoryFrequencySeconds = 60;
    private boolean gpsAnchorEnabled;
    private double gpsAnchorLat;
    private double gpsAnchorLon;
    private double gpsAnchorRadius = 30d;
    private String gpsAnchorRadiusUnit = "m";
    private boolean gpsAnchorTripped;
    private TextToSpeech anchorTts;
    private volatile boolean anchorTtsReady;
    private volatile String pendingAlarmText = "";
    private long lastGpsSampleElapsedRealtime;
    private long lastGpsHistoryPruneElapsedRealtime;
    private long startedAtElapsedRealtime;
    private PowerManager.WakeLock wakeLock;
    private Handler syncHandler;
    private ExecutorService syncExecutor;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private volatile String latestStationSnapshot = "";
    private volatile String latestRemoteState = "";
    private final AtomicLong remoteReceivedBytes = new AtomicLong();
    private boolean syncInFlight;
    private boolean syncPending;
    private boolean hasCompletedClientPoll;
    private int consecutiveSyncFailures;
    private final Runnable syncRunnable = this::runSyncCycle;

    public final class LocalBinder extends Binder {
        public BoatStationCoreService getService() { return BoatStationCoreService.this; }
    }

    @Override public void onCreate() {
        super.onCreate();
        activeService = this;
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        gpsHistoryStore = GpsHistoryStore.get(this);
        startedAtElapsedRealtime = SystemClock.elapsedRealtime();
        latestStationSnapshot = pendingStationSnapshot;
        syncHandler = new Handler(getMainLooper());
        syncExecutor = Executors.newSingleThreadExecutor(r -> new Thread(r, "BoatStationSync"));
        initAnchorTts();
        createNotificationChannel();
        acquireWakeLock();
        registerNetworkCallback();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopGpsHistoryUpdates();
            cancelAnchorAlarm();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_CONFIGURE_REMOTE.equals(intent.getAction())) persistRemoteConfig(intent);
        else if (intent != null && ACTION_CONFIGURE_CLIENT.equals(intent.getAction())) persistRemoteClientConfig(intent);
        else if (intent != null && ACTION_CLEAR_REMOTE_SYNC.equals(intent.getAction())) clearRemoteSync();
        else if (intent != null && ACTION_CONFIGURE_NOTIFICATIONS.equals(intent.getAction())) persistNotificationSettings(intent);
        else if (intent != null && ACTION_SPEAK_ALARM.equals(intent.getAction())) {
            String text = intent.getStringExtra(EXTRA_ALARM_TEXT);
            if (text != null && !text.trim().isEmpty()) announceBackgroundAlarm(text.trim(), "Boat Station");
        }
        else if (intent != null && ACTION_CONFIGURE_GPS_HISTORY.equals(intent.getAction())) {
            persistGpsHistorySettings(intent);
            persistGpsAnchorSettings(intent);
        }

        loadGpsHistorySettings();
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceTypes = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE;
            if ((gpsHistoryEnabled || gpsAnchorEnabled) && hasLocationPermission()) serviceTypes |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
            startForeground(NOTIFICATION_ID, notification, serviceTypes);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        if (gpsHistoryEnabled || gpsAnchorEnabled) startGpsHistoryUpdates(); else stopGpsHistoryUpdates();
        scheduleSync(0L);
        return START_STICKY;
    }

    public static boolean isRunning() { return activeService != null; }

    private void persistNotificationSettings(Intent intent) {
        String raw = intent.getStringExtra(EXTRA_NOTIFICATION_SETTINGS);
        if (raw == null || raw.trim().isEmpty()) return;
        try {
            JSONObject settings = new JSONObject(raw);
            JSONObject general = settings.optJSONObject("general");
            String voice = general == null ? "" : general.optString("ttsVoice", "");
            float rate = general == null ? 1f : (float) general.optDouble("ttsRate", 1d);
            rate = Math.max(0.5f, Math.min(2f, rate));
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putString(PREF_NOTIFICATION_SETTINGS, settings.toString())
                    .putString("ttsVoice", voice)
                    .putFloat("ttsRate", rate)
                    .apply();
            applyAnchorTtsSettings();
            evaluateRemoteConnectionState();
        } catch (Exception e) {
            Log.w(TAG, "Could not save background notification settings", e);
        }
    }

    private void persistGpsHistorySettings(Intent intent) {
        int hours = validHours(intent.getIntExtra(EXTRA_GPS_HISTORY_HOURS, 6));
        int frequency = validFrequency(intent.getIntExtra(EXTRA_GPS_HISTORY_FREQUENCY, 60));
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putBoolean(PREF_GPS_HISTORY_ENABLED, intent.getBooleanExtra(EXTRA_GPS_HISTORY_ENABLED, false))
                .putInt(PREF_GPS_HISTORY_HOURS, hours)
                .putInt(PREF_GPS_HISTORY_FREQUENCY, frequency)
                .apply();
    }

    private void persistGpsAnchorSettings(Intent intent) {
        boolean enabled = intent.getBooleanExtra(EXTRA_GPS_ANCHOR_ENABLED, false);
        double lat = intent.getDoubleExtra(EXTRA_GPS_ANCHOR_LAT, Double.NaN);
        double lon = intent.getDoubleExtra(EXTRA_GPS_ANCHOR_LON, Double.NaN);
        double radius = intent.hasExtra(EXTRA_GPS_ANCHOR_RADIUS_METERS)
                ? validAnchorRadius(intent.getDoubleExtra(EXTRA_GPS_ANCHOR_RADIUS_METERS, 30d))
                : validAnchorRadius(intent.getIntExtra(EXTRA_GPS_ANCHOR_RADIUS, 30));
        String radiusUnit = "ft".equals(intent.getStringExtra(EXTRA_GPS_ANCHOR_RADIUS_UNIT)) ? "ft" : "m";
        boolean validPoint = Double.isFinite(lat) && lat >= -90d && lat <= 90d
                && Double.isFinite(lon) && lon >= -180d && lon <= 180d;
        SharedPreferences settings = getSharedPreferences(PREFS, MODE_PRIVATE);
        double oldLat = readDouble(settings, PREF_GPS_ANCHOR_LAT, Double.NaN);
        double oldLon = readDouble(settings, PREF_GPS_ANCHOR_LON, Double.NaN);
        boolean oldValidPoint = Double.isFinite(oldLat) && oldLat >= -90d && oldLat <= 90d
                && Double.isFinite(oldLon) && oldLon >= -180d && oldLon <= 180d;
        boolean changed = oldValidPoint != validPoint
                || (validPoint && (Math.abs(lat - oldLat) > 0.000001d || Math.abs(lon - oldLon) > 0.000001d))
                || Math.abs(radius - readDouble(settings, PREF_GPS_ANCHOR_RADIUS_METERS, settings.getInt(PREF_GPS_ANCHOR_RADIUS, 30))) > 0.001d;
        SharedPreferences.Editor editor = settings.edit()
                .putBoolean(PREF_GPS_ANCHOR_ENABLED, enabled && validPoint)
                .putInt(PREF_GPS_ANCHOR_RADIUS, Math.round((float) radius))
                .putString(PREF_GPS_ANCHOR_RADIUS_METERS, Double.toString(radius))
                .putString(PREF_GPS_ANCHOR_RADIUS_UNIT, radiusUnit);
        if (validPoint) {
            editor.putString(PREF_GPS_ANCHOR_LAT, Double.toString(lat))
                    .putString(PREF_GPS_ANCHOR_LON, Double.toString(lon));
        } else {
            editor.remove(PREF_GPS_ANCHOR_LAT).remove(PREF_GPS_ANCHOR_LON);
        }
        if (changed || !enabled || !validPoint) editor.putBoolean(PREF_GPS_ANCHOR_TRIPPED, false);
        editor.apply();
        if (changed || !enabled || !validPoint) cancelAnchorAlarm();
    }

    private void loadGpsHistorySettings() {
        SharedPreferences settings = getSharedPreferences(PREFS, MODE_PRIVATE);
        gpsHistoryHours = validHours(settings.getInt(PREF_GPS_HISTORY_HOURS, 6));
        gpsHistoryEnabled = settings.getBoolean(PREF_GPS_HISTORY_ENABLED, false) && gpsHistoryHours > 0;
        gpsHistoryFrequencySeconds = validFrequency(settings.getInt(PREF_GPS_HISTORY_FREQUENCY, 60));
        gpsAnchorEnabled = settings.getBoolean(PREF_GPS_ANCHOR_ENABLED, false);
        gpsAnchorLat = readDouble(settings, PREF_GPS_ANCHOR_LAT, 0d);
        gpsAnchorLon = readDouble(settings, PREF_GPS_ANCHOR_LON, 0d);
        gpsAnchorRadius = validAnchorRadius(readDouble(settings, PREF_GPS_ANCHOR_RADIUS_METERS, settings.getInt(PREF_GPS_ANCHOR_RADIUS, 30)));
        gpsAnchorRadiusUnit = "ft".equals(settings.getString(PREF_GPS_ANCHOR_RADIUS_UNIT, "m")) ? "ft" : "m";
        gpsAnchorTripped = settings.getBoolean(PREF_GPS_ANCHOR_TRIPPED, false);
        if (gpsHistoryStore != null && gpsHistoryEnabled) gpsHistoryStore.pruneOlderThan(gpsHistoryHours);
        if (!gpsAnchorEnabled) cancelAnchorAlarm();
    }

    private int validHours(int hours) { return hours == 0 || hours == 1 || hours == 3 || hours == 6 || hours == 12 || hours == 24 ? hours : 6; }
    private int validFrequency(int seconds) { return seconds == 30 || seconds == 60 || seconds == 150 || seconds == 300 || seconds == 600 ? seconds : 60; }
    private double validAnchorRadius(double radius) { return Math.min(5000d, Math.max(5d, radius)); }
    private String anchorRadiusLabel() { return "ft".equals(gpsAnchorRadiusUnit) ? Math.round(gpsAnchorRadius / 0.3048d) + " ft" : Math.round(gpsAnchorRadius) + " m"; }
    private double readDouble(SharedPreferences settings, String key, double fallback) {
        try { return Double.parseDouble(settings.getString(key, Double.toString(fallback))); }
        catch (Exception ignored) { return fallback; }
    }
    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void startGpsHistoryUpdates() {
        if ((!gpsHistoryEnabled && !gpsAnchorEnabled) || locationManager == null || !hasLocationPermission()) return;
        try {
            locationManager.removeUpdates(this);
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 0f, this, getMainLooper());
            lastGpsSampleElapsedRealtime = 0L;
        lastGpsHistoryPruneElapsedRealtime = 0L;
        } catch (Exception ignored) {}
    }

    private void stopGpsHistoryUpdates() {
        if (locationManager != null) {
            try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
        }
    }

    @Override public void onLocationChanged(Location location) {
        if (location == null) return;
        evaluateAnchorAlarm(location);
        if (!gpsHistoryEnabled) return;
        long elapsed = SystemClock.elapsedRealtime();
        if (lastGpsSampleElapsedRealtime != 0L
                && elapsed - lastGpsSampleElapsedRealtime < gpsHistoryFrequencySeconds * 1000L) return;
        lastGpsSampleElapsedRealtime = elapsed;
        long time = location.getTime() > 0L ? location.getTime() : System.currentTimeMillis();
        gpsHistoryStore.append(time, location.getLatitude(), location.getLongitude(), gpsHistoryHours);
        if (lastGpsHistoryPruneElapsedRealtime == 0L || elapsed - lastGpsHistoryPruneElapsedRealtime >= 60000L) {
            gpsHistoryStore.pruneOlderThan(gpsHistoryHours);
            lastGpsHistoryPruneElapsedRealtime = elapsed;
        }
    }

    private void evaluateAnchorAlarm(Location location) {
        if (!gpsAnchorEnabled || location == null) return;
        float[] result = new float[1];
        Location.distanceBetween(gpsAnchorLat, gpsAnchorLon, location.getLatitude(), location.getLongitude(), result);
        float accuracy = location.hasAccuracy() ? Math.max(0f, location.getAccuracy()) : 0f;
        float distance = result[0];
        if (!gpsAnchorTripped && distance - accuracy > gpsAnchorRadius) {
            gpsAnchorTripped = true;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_GPS_ANCHOR_TRIPPED, true).apply();
            speakAnchorAlarm();
            postAnchorAlarm();
        } else if (gpsAnchorTripped && distance < Math.max(3f, gpsAnchorRadius * 0.5f)) {
            gpsAnchorTripped = false;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_GPS_ANCHOR_TRIPPED, false).apply();
            cancelAnchorAlarm();
        }
    }

    private void initAnchorTts() {
        anchorTts = new TextToSpeech(getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS || anchorTts == null) return;
            try { anchorTts.setLanguage(new Locale("es", "AR")); } catch (Exception ignored) {}
            anchorTtsReady = true;
            applyAnchorTtsSettings();
            String pending = pendingAlarmText;
            pendingAlarmText = "";
            if (!pending.isEmpty()) speakAlarmText(pending);
        });
    }

    private void applyAnchorTtsSettings() {
        if (anchorTts == null) return;
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            String selected = prefs.getString("ttsVoice", "");
            float rate = Math.max(0.5f, Math.min(2f, prefs.getFloat("ttsRate", 1f)));
            anchorTts.setSpeechRate(rate);
            if (!selected.isEmpty() && anchorTts.getVoices() != null) {
                for (Voice voice : anchorTts.getVoices()) {
                    if (selected.equals(voice.getName())) { anchorTts.setVoice(voice); return; }
                }
            }
            anchorTts.setLanguage(new Locale("es", "AR"));
        } catch (Exception ignored) {}
    }

    private void speakAnchorAlarm() {
        speakAlarmText(notificationMessage("anchorLost", "Atención, Chez se está alejando del ancla."));
    }

    private String notificationMessage(String key, String fallback) {
        JSONObject messages = notificationSettings(getSharedPreferences(PREFS, MODE_PRIVATE)).optJSONObject("messages");
        return messages == null ? fallback : messages.optString(key, fallback);
    }

    private void speakAlarmText(String text) {
        if (text == null || text.trim().isEmpty()) return;
        if (anchorTts == null || !anchorTtsReady) {
            pendingAlarmText = text.trim();
            return;
        }
        try {
            applyAnchorTtsSettings();
            anchorTts.speak(text.trim(), TextToSpeech.QUEUE_ADD, null, "boat-station-alarm-" + System.currentTimeMillis());
        } catch (Exception ignored) {}
    }

    private void announceBackgroundAlarm(String text, String title) {
        speakAlarmText(text);
        postBackgroundAlarm(text, title);
    }

    private boolean canPostNotifications() {
        return Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private void postAnchorAlarm() {
        Intent openIntent = new Intent(this, BoatStationActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 1, openIntent, flags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, ANCHOR_CHANNEL_ID) : new Notification.Builder(this);
        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Alarma de fondeo")
                .setContentText(notificationMessage("anchorLost", "Atención, Chez se está alejando del ancla."))
                .setContentIntent(open)
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_HIGH)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setOngoing(true);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
                    .setVibrate(new long[]{0, 700, 350, 700, 350, 1200});
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null && canPostNotifications()) manager.notify(ANCHOR_NOTIFICATION_ID, builder.build());
    }

    private void postBackgroundAlarm(String text, String title) {
        Intent openIntent = new Intent(this, BoatStationActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 2, openIntent, flags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, ALARM_CHANNEL_ID) : new Notification.Builder(this);
        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title == null || title.trim().isEmpty() ? "Boat Station" : title.trim())
                .setContentText(text)
                .setContentIntent(open)
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null && canPostNotifications()) manager.notify(BACKGROUND_ALARM_NOTIFICATION_ID, builder.build());
    }

    private void cancelAnchorAlarm() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(ANCHOR_NOTIFICATION_ID);
    }

    @Override public void onStatusChanged(String provider, int status, android.os.Bundle extras) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}


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

    public static long getRemoteReceivedBytes() {
        BoatStationCoreService service = activeService;
        return service == null ? 0L : service.remoteReceivedBytes.get();
    }

    public static boolean announceAlarmFromApp(String text) {
        BoatStationCoreService service = activeService;
        if (service == null || service.syncHandler == null || text == null || text.trim().isEmpty()) return false;
        String message = text.trim();
        service.syncHandler.post(() -> service.announceBackgroundAlarm(message, "Boat Station"));
        return true;
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
        if (!sid.equals(previousId)) {
            latestRemoteState = "";
            hasCompletedClientPoll = false;
            prefs.edit().putBoolean(PREF_CONNECTION_INITIALIZED, false)
                    .putBoolean(PREF_CONNECTION_CONNECTED, false)
                    .putString(PREF_CONNECTION_STATION_ID, sid)
                    .putLong(PREF_LAST_REMOTE_TELEMETRY_TIME, 0L).apply();
        }
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
                .remove(PREF_CONNECTION_INITIALIZED)
                .remove(PREF_CONNECTION_CONNECTED)
                .remove(PREF_CONNECTION_STATION_ID)
                .remove(PREF_LAST_REMOTE_TELEMETRY_TIME)
                .apply();
        latestRemoteState = "";
        hasCompletedClientPoll = false;
        consecutiveSyncFailures = 0;
        syncHandler.removeCallbacks(syncRunnable);
    }

    private boolean hasSyncMode() {
        String mode = getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_SYNC_MODE, "");
        return MODE_SERVER.equals(mode) || MODE_CLIENT.equals(mode);
    }

    private void evaluateRemoteConnectionState() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!MODE_CLIENT.equals(prefs.getString(PREF_SYNC_MODE, ""))) return;
        String settingsRaw = prefs.getString(PREF_NOTIFICATION_SETTINGS, "");
        if (settingsRaw.isEmpty()) return;

        String stationId = prefs.getString(PREF_CLIENT_STATION_ID, "");
        if (stationId.isEmpty()) return;
        if (latestRemoteState.isEmpty() && !hasCompletedClientPoll && networkAvailable()) return;
        boolean connected = hasFreshRemoteSnapshot(latestRemoteState, System.currentTimeMillis(), prefs);
        String previousStation = prefs.getString(PREF_CONNECTION_STATION_ID, "");
        boolean initialized = prefs.getBoolean(PREF_CONNECTION_INITIALIZED, false)
                && stationId.equals(previousStation);
        boolean wasConnected = prefs.getBoolean(PREF_CONNECTION_CONNECTED, false);
        if (!initialized) {
            prefs.edit().putBoolean(PREF_CONNECTION_INITIALIZED, true)
                    .putBoolean(PREF_CONNECTION_CONNECTED, connected)
                    .putString(PREF_CONNECTION_STATION_ID, stationId).apply();
            if (connected) announceConnectionEstablished(settingsRaw, remoteStationName(latestRemoteState, prefs));
            return;
        }
        if (connected == wasConnected) return;
        prefs.edit().putBoolean(PREF_CONNECTION_CONNECTED, connected).apply();
        String name = remoteStationName(latestRemoteState, prefs);
        if (connected) announceConnectionEstablished(settingsRaw, name);
        else announceConnectionLost(settingsRaw, name);
    }

    private boolean hasFreshRemoteSnapshot(String raw, long now, SharedPreferences prefs) {
        long time = 0L;
        long serverInterval = 5000L;
        try {
            JSONObject root = new JSONObject(raw == null ? "{}" : raw);
            JSONObject snapshot = root.optJSONObject("snapshot");
            JSONObject telemetry = snapshot == null ? null : snapshot.optJSONObject("telemetry");
            if (telemetry != null) { time = telemetry.optLong("time", 0L); serverInterval=1000L*Math.max(5,Math.min(60,telemetry.optInt("syncIntervalSeconds",5))); }
        } catch (Exception ignored) {
        }
        if (time <= 0L) time = prefs.getLong(PREF_LAST_REMOTE_TELEMETRY_TIME, 0L);
        if (time <= 0L) return false;
        long effectiveTime = Math.min(now, time);
        long localInterval=1000L*Math.max(5,Math.min(60,prefs.getInt(PREF_SYNC_INTERVAL_SECONDS,5)));
        return now-effectiveTime <= Math.max(30000L,2L*(serverInterval+localInterval)+5000L);
    }

    private String remoteStationName(String raw, SharedPreferences prefs) {
        try {
            JSONObject root = new JSONObject(raw == null ? "{}" : raw);
            JSONObject snapshot = root.optJSONObject("snapshot");
            JSONObject telemetry = snapshot == null ? null : snapshot.optJSONObject("telemetry");
            String name = snapshot == null ? "" : snapshot.optString("boatName", "");
            if (name.trim().isEmpty() && telemetry != null) name = telemetry.optString("stationName", "");
            if (name.trim().isEmpty()) name = root.optString("boatName", "");
            if (!name.trim().isEmpty()) return name.trim();
        } catch (Exception ignored) {}
        return prefs.getString(PREF_NOTIFICATION_SETTINGS, "").isEmpty() ? "Chez"
                : notificationSettings(prefs).optString("stationName", "Chez");
    }

    private JSONObject notificationSettings(SharedPreferences prefs) {
        try { return new JSONObject(prefs.getString(PREF_NOTIFICATION_SETTINGS, "{}")); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    private void announceConnectionEstablished(String rawSettings, String stationName) {
        try {
            JSONObject settings = new JSONObject(rawSettings);
            JSONObject general = settings.optJSONObject("general");
            if (general == null || !general.optBoolean("connectionEstablished", true)) return;
            JSONObject messages = settings.optJSONObject("messages");
            String template = messages == null
                    ? general.optString("connectionEstablishedMessage", "Conexión con {barco} establecida.")
                    : messages.optString("connectionEstablished", "Conexión con {barco} establecida.");
            String name = stationName == null || stationName.trim().isEmpty() ? "Chez" : stationName.trim();
            String message = template.replace("{barco}", name).replace("{Barco}", name).replace("{BARCO}", name);
            announceBackgroundAlarm(message, "Conexión establecida");
        } catch (Exception ignored) {}
    }

    private void announceConnectionLost(String rawSettings, String stationName) {
        try {
            JSONObject settings = new JSONObject(rawSettings);
            JSONObject general = settings.optJSONObject("general");
            if (general == null || !general.optBoolean("connectionLost", false)) return;
            String name = stationName == null || stationName.trim().isEmpty() ? "Chez" : stationName.trim();
            JSONObject messages = settings.optJSONObject("messages");
            String template = messages == null ? "Conexión con {barco} perdida." : messages.optString("connectionLost", "Conexión con {barco} perdida.");
            String message = template.replace("{barco}", name).replace("{Barco}", name).replace("{BARCO}", name);
            announceBackgroundAlarm(message, "Conexión perdida");
        } catch (Exception ignored) {}
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
            evaluateRemoteConnectionState();
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
                    if (MODE_CLIENT.equals(getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_SYNC_MODE, ""))) hasCompletedClientPoll = true;
                    evaluateRemoteConnectionState();
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

    public void setSyncIntervalSeconds(int seconds) {
        int safe=Math.max(5,Math.min(60,seconds));
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(PREF_SYNC_INTERVAL_SECONDS,safe).apply();
        Handler handler=syncHandler;if(handler!=null)handler.post(()->scheduleSync(0L));
    }

    public static boolean updateSyncIntervalSeconds(int seconds) {
        BoatStationCoreService service=activeService;if(service==null)return false;service.setSyncIntervalSeconds(seconds);return true;
    }

    private long nextSyncDelay() {
        if (!networkAvailable()) return 10000L;
        if (consecutiveSyncFailures > 0) {
            int exponent = Math.min(consecutiveSyncFailures - 1, 5);
            return Math.min(MAX_BACKOFF_MS, 2000L * (1L << exponent));
        }
        return Math.max(SYNC_INTERVAL_MS,Math.min(60000L,1000L*getSharedPreferences(PREFS, MODE_PRIVATE).getInt(PREF_SYNC_INTERVAL_SECONDS,5)));
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
        remoteReceivedBytes.addAndGet(response.getBytes(StandardCharsets.UTF_8).length);
        JSONObject parsed = new JSONObject(response);
        JSONObject snapshot = parsed.optJSONObject("snapshot");
        JSONObject telemetry = snapshot == null ? null : snapshot.optJSONObject("telemetry");
        long telemetryTime = telemetry == null ? 0L : telemetry.optLong("time", 0L);
        if (telemetryTime > 0L) getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putLong(PREF_LAST_REMOTE_TELEMETRY_TIME, telemetryTime).apply();
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
        NotificationChannel alarm = new NotificationChannel(ANCHOR_CHANNEL_ID, "Alarma de fondeo", NotificationManager.IMPORTANCE_HIGH);
        alarm.setDescription("Alerta sonora cuando la embarcación sale del radio de fondeo configurado");
        alarm.enableVibration(true);
        alarm.setVibrationPattern(new long[]{0, 700, 350, 700, 350, 1200});
        alarm.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        manager.createNotificationChannel(alarm);
        NotificationChannel backgroundAlarm = new NotificationChannel(ALARM_CHANNEL_ID, "Alarmas de Boat Station", NotificationManager.IMPORTANCE_HIGH);
        backgroundAlarm.setDescription("Avisos de Boat Station que también se anuncian con la app en segundo plano");
        backgroundAlarm.setSound(null, null);
        backgroundAlarm.setShowBadge(false);
        manager.createNotificationChannel(backgroundAlarm);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, BoatStationActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 0, openIntent, pendingFlags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        String status = gpsHistoryEnabled && gpsAnchorEnabled
                ? "Grabando ubicación · últimas " + gpsHistoryHours + " h · alarma de fondeo activa"
                : gpsHistoryEnabled ? "Grabando ubicación en segundo plano · últimas " + gpsHistoryHours + " h"
                : gpsAnchorEnabled ? "Alarma de fondeo activa · radio " + anchorRadiusLabel()
                : "Conexión de estación activa";
        return builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Boat Station")
                .setContentText(status)
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    @Override public void onDestroy() {
        stopGpsHistoryUpdates();
        if (syncHandler != null) syncHandler.removeCallbacksAndMessages(null);
        try {
            if (connectivityManager != null && networkCallback != null) connectivityManager.unregisterNetworkCallback(networkCallback);
        } catch (Exception ignored) {}
        if (syncExecutor != null) syncExecutor.shutdownNow();
        try { if (anchorTts != null) { anchorTts.stop(); anchorTts.shutdown(); } } catch (Exception ignored) {}
        anchorTts = null;
        anchorTtsReady = false;
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        if (activeService == this) activeService = null;
        wakeLock = null;
        super.onDestroy();
    }
}
