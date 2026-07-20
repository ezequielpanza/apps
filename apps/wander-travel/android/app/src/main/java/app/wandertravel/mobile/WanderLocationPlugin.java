package app.wandertravel.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(
    name = "WanderLocation",
    permissions = {
        @Permission(
            alias = "location",
            strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }
        ),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class WanderLocationPlugin extends Plugin {
    private static final String MESSAGE_CHANNEL_ID = "wander_companion_messages";
    private static final int MAX_GPX_BYTES = 10 * 1024 * 1024;
    private static WeakReference<WanderLocationPlugin> activePlugin = new WeakReference<>(null);

    @Override
    public void load() {
        activePlugin = new WeakReference<>(this);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            String[] aliases = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? new String[] { "location", "notifications" }
                : new String[] { "location" };
            requestPermissionForAliases(aliases, call, "startAfterPermission");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void startAfterPermission(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location permission is required", "PERMISSION_DENIED");
            return;
        }
        startService(call);
    }

    private void startService(PluginCall call) {
        Intent intent = new Intent(getContext(), WanderLocationService.class);
        intent.setAction(WanderLocationService.ACTION_START);
        intent.putExtra("minimumIntervalMs", Math.max(2000, call.getInt("minimumIntervalMs", 5000)));
        intent.putExtra("minimumDistanceM", Math.max(0, call.getInt("minimumDistanceM", 5)));
        intent.putExtra("highAccuracy", call.getBoolean("highAccuracy", true));
        getContext().startForegroundService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), WanderLocationService.class);
        intent.setAction(WanderLocationService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void isWatching(PluginCall call) {
        JSObject result = new JSObject();
        result.put("watching", WanderLocationService.isRunning());
        call.resolve(result);
    }

    @PluginMethod
    public void getPendingLocations(PluginCall call) {
        int limit = Math.max(1, Math.min(1000, call.getInt("limit", 500)));
        WanderLocationJournal journal = WanderLocationJournal.get(getContext());
        JSObject result = new JSObject();
        result.put("locations", journal.pending(limit));
        result.put("pendingCount", journal.count());
        result.put("latestRecordedAt", journal.latestRecordedAt());
        result.put("watching", WanderLocationService.isRunning());
        call.resolve(result);
    }

    @PluginMethod
    public void acknowledgeLocations(PluginCall call) {
        JSArray ids = call.getArray("ids");
        WanderLocationJournal journal = WanderLocationJournal.get(getContext());
        JSObject result = new JSObject();
        result.put("acknowledged", journal.acknowledge(ids));
        result.put("pendingCount", journal.count());
        call.resolve(result);
    }

    @PluginMethod
    public void getBackgroundStatus(PluginCall call) {
        WanderLocationJournal journal = WanderLocationJournal.get(getContext());
        JSObject result = new JSObject();
        result.put("watching", WanderLocationService.isRunning());
        result.put("pendingCount", journal.count());
        result.put("latestRecordedAt", journal.latestRecordedAt());
        result.put("nativeJournal", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageInfo packageInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? packageInfo.getLongVersionCode()
                : packageInfo.versionCode;
            JSObject result = new JSObject();
            result.put("versionName", packageInfo.versionName);
            result.put("versionCode", versionCode);
            result.put("packageName", getContext().getPackageName());
            result.put("gpxFileAccess", true);
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException error) {
            call.reject("Unable to read app version", "APP_INFO_UNAVAILABLE", error);
        }
    }

    @PluginMethod
    public void pickGpx(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            "application/gpx+xml",
            "application/xml",
            "text/xml",
            "text/plain"
        });
        startActivityForResult(call, intent, "pickGpxResult");
    }

    @ActivityCallback
    private void pickGpxResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            JSObject result = new JSObject();
            result.put("cancelled", true);
            call.resolve(result);
            return;
        }

        Uri uri = activityResult.getData().getData();
        if (uri == null) {
            call.reject("No GPX file was selected", "GPX_URI_MISSING");
            return;
        }

        try {
            String content = readText(uri);
            JSObject result = new JSObject();
            result.put("cancelled", false);
            result.put("name", displayName(uri));
            result.put("content", content);
            call.resolve(result);
        } catch (IOException error) {
            call.reject("Unable to read GPX file", "GPX_READ_FAILED", error);
        }
    }

    @PluginMethod
    public void saveGpx(PluginCall call) {
        String content = call.getString("content", "");
        if (content.isEmpty()) {
            call.reject("GPX content is empty", "GPX_CONTENT_EMPTY");
            return;
        }
        if (content.getBytes(StandardCharsets.UTF_8).length > MAX_GPX_BYTES) {
            call.reject("GPX file is too large", "GPX_TOO_LARGE");
            return;
        }

        String filename = safeFilename(call.getString("filename", "wander-points.gpx"));
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/gpx+xml");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "saveGpxResult");
    }

    @ActivityCallback
    private void saveGpxResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            JSObject result = new JSObject();
            result.put("cancelled", true);
            call.resolve(result);
            return;
        }

        Uri uri = activityResult.getData().getData();
        if (uri == null) {
            call.reject("No destination was selected", "GPX_DESTINATION_MISSING");
            return;
        }

        String content = call.getString("content", "");
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IOException("Unable to open destination");
            output.write(content.getBytes(StandardCharsets.UTF_8));
            output.flush();
            JSObject result = new JSObject();
            result.put("cancelled", false);
            result.put("uri", uri.toString());
            result.put("name", displayName(uri));
            call.resolve(result);
        } catch (IOException error) {
            call.reject("Unable to save GPX file", "GPX_WRITE_FAILED", error);
        }
    }

    private String readText(Uri uri) throws IOException {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IOException("Unable to open selected file");
            byte[] buffer = new byte[8192];
            int total = 0;
            int count;
            while ((count = input.read(buffer)) != -1) {
                total += count;
                if (total > MAX_GPX_BYTES) throw new IOException("GPX file exceeds size limit");
                output.write(buffer, 0, count);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (RuntimeException ignored) {}
        String last = uri.getLastPathSegment();
        return last == null || last.trim().isEmpty() ? "wander-points.gpx" : last;
    }

    private String safeFilename(String value) {
        String filename = value == null ? "wander-points.gpx" : value.trim();
        if (filename.isEmpty()) filename = "wander-points.gpx";
        filename = filename.replaceAll("[\\\\/:*?\"<>|]", "-");
        if (!filename.toLowerCase().endsWith(".gpx")) filename += ".gpx";
        return filename;
    }

    @PluginMethod
    public void notifyCompanion(PluginCall call) {
        String title = call.getString("title", "Wander");
        String message = call.getString("message", "Wander tiene algo para contarte.");
        String id = call.getString("id", String.valueOf(System.currentTimeMillis()));

        NotificationChannel channel = new NotificationChannel(
            MESSAGE_CHANNEL_ID,
            getContext().getString(R.string.companion_message_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        getContext().getSystemService(NotificationManager.class).createNotificationChannel(channel);

        Intent openIntent = new Intent(getContext(), MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            getContext(),
            id.hashCode(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notification = new NotificationCompat.Builder(getContext(), MESSAGE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_wander)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
            .setContentIntent(openPendingIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true);

        getContext().getSystemService(NotificationManager.class).notify(id.hashCode(), notification.build());
        call.resolve();
    }

    static void publish(Location location, long journalId) {
        WanderLocationPlugin plugin = activePlugin.get();
        if (plugin == null) return;

        boolean precisePermission = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || plugin.getContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        JSObject payload = new JSObject();
        payload.put("journalId", journalId > 0 ? journalId : null);
        payload.put("latitude", location.getLatitude());
        payload.put("longitude", location.getLongitude());
        payload.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : null);
        payload.put("altitude", location.hasAltitude() ? location.getAltitude() : null);
        payload.put("heading", location.hasBearing() ? location.getBearing() : null);
        payload.put("speed", location.hasSpeed() ? location.getSpeed() : null);
        payload.put("provider", location.getProvider());
        payload.put("permissionPrecision", precisePermission ? "precise" : "approximate");
        payload.put("timestamp", location.getTime());
        payload.put("replayed", false);
        plugin.notifyListeners("location", payload, true);
    }

    static void publishError(String status) {
        WanderLocationPlugin plugin = activePlugin.get();
        if (plugin == null) return;
        JSObject payload = new JSObject();
        payload.put("status", status);
        plugin.notifyListeners("locationError", payload, true);
    }

    static void publishMotion(float x, float y, float z, float magnitude, float activity, boolean linear, long timestamp) {
        WanderLocationPlugin plugin = activePlugin.get();
        if (plugin == null) return;
        JSObject payload = new JSObject();
        payload.put("x", x);
        payload.put("y", y);
        payload.put("z", z);
        payload.put("magnitude", magnitude);
        payload.put("activity", activity);
        payload.put("linear", linear);
        payload.put("timestamp", timestamp);
        plugin.notifyListeners("motionSensor", payload, true);
    }

    static void publishMotionUnavailable() {
        WanderLocationPlugin plugin = activePlugin.get();
        if (plugin == null) return;
        JSObject payload = new JSObject();
        payload.put("status", "unavailable");
        plugin.notifyListeners("motionSensorError", payload, true);
    }
}
