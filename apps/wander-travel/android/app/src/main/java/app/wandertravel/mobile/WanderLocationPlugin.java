package app.wandertravel.mobile;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.ref.WeakReference;
import androidx.core.app.NotificationCompat;

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

    static void publish(Location location) {
        WanderLocationPlugin plugin = activePlugin.get();
        if (plugin == null) return;

        JSObject payload = new JSObject();
        payload.put("latitude", location.getLatitude());
        payload.put("longitude", location.getLongitude());
        payload.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : null);
        payload.put("altitude", location.hasAltitude() ? location.getAltitude() : null);
        payload.put("heading", location.hasBearing() ? location.getBearing() : null);
        payload.put("speed", location.hasSpeed() ? location.getSpeed() : null);
        payload.put("timestamp", location.getTime());
        plugin.notifyListeners("location", payload, true);
    }

    static void publishError(String status) {
        WanderLocationPlugin plugin = activePlugin.get();
        if (plugin == null) return;
        JSObject payload = new JSObject();
        payload.put("status", status);
        plugin.notifyListeners("locationError", payload, true);
    }
}
