package app.wandertravel.mobile;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "WanderNotifications",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class WanderNotificationPlugin extends Plugin {
    private static final String CHANNEL_ID = "wander_companion_messages";

    private String permissionStatus() {
        boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return enabled ? "granted" : "blocked";
        }
        PermissionState state = getPermissionState("notifications");
        if (state == PermissionState.GRANTED && enabled) return "granted";
        if (state == PermissionState.DENIED) return "denied";
        return enabled ? "not_requested" : "blocked";
    }

    private JSObject permissionResult() {
        String status = permissionStatus();
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("granted", "granted".equals(status));
        result.put("enabled", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        result.put("canRequest", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && "not_requested".equals(status));
        return result;
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(permissionResult());
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void notifyCompanion(PluginCall call) {
        JSObject result = permissionResult();
        if (!result.getBool("granted", false)) {
            result.put("delivered", false);
            call.resolve(result);
            return;
        }

        String title = call.getString("title", "Wander");
        String message = call.getString("message", "Wander tiene algo para contarte.");
        String id = call.getString("id", String.valueOf(System.currentTimeMillis()));

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
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

        NotificationCompat.Builder notification = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_wander)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
            .setContentIntent(openPendingIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        try {
            NotificationManagerCompat.from(getContext()).notify(id.hashCode(), notification.build());
            result.put("delivered", true);
        } catch (SecurityException error) {
            result = permissionResult();
            result.put("delivered", false);
            result.put("error", "permission_denied");
        }
        call.resolve(result);
    }
}
