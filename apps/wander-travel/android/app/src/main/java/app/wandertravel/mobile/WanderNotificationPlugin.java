package app.wandertravel.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
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
    private static final String CHANNEL_PREFIX = "wander_companion_messages_v";
    private static final String PREFS_NAME = "wander_notifications";
    private static final String KEY_SOUND_URI = "sound_uri";
    private static final String KEY_SOUND_LABEL = "sound_label";
    private static final String KEY_CHANNEL_GENERATION = "channel_generation";
    private static final String SOUND_DEFAULT = "default";
    private static final String SOUND_SILENT = "silent";

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private int channelGeneration() {
        return Math.max(1, preferences().getInt(KEY_CHANNEL_GENERATION, 1));
    }

    private String channelId() {
        return CHANNEL_PREFIX + channelGeneration();
    }

    private String storedSoundUri() {
        return preferences().getString(KEY_SOUND_URI, SOUND_DEFAULT);
    }

    private String storedSoundLabel() {
        String fallback = SOUND_SILENT.equals(storedSoundUri()) ? "Silencioso" : "Sonido predeterminado";
        return preferences().getString(KEY_SOUND_LABEL, fallback);
    }

    private Uri selectedSoundUri() {
        String value = storedSoundUri();
        if (SOUND_SILENT.equals(value)) return null;
        if (SOUND_DEFAULT.equals(value)) return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        try {
            return Uri.parse(value);
        } catch (RuntimeException ignored) {
            return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }
    }

    private String soundMode() {
        String value = storedSoundUri();
        if (SOUND_SILENT.equals(value)) return "silent";
        if (SOUND_DEFAULT.equals(value)) return "default";
        return "custom";
    }

    private JSObject soundResult() {
        JSObject result = new JSObject();
        result.put("mode", soundMode());
        result.put("label", storedSoundLabel());
        result.put("uri", SOUND_DEFAULT.equals(storedSoundUri()) || SOUND_SILENT.equals(storedSoundUri()) ? null : storedSoundUri());
        result.put("channelId", channelId());
        return result;
    }

    private String titleFor(Uri uri) {
        if (uri == null) return "Silencioso";
        if (uri.equals(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))) return "Sonido predeterminado";
        try {
            Ringtone ringtone = RingtoneManager.getRingtone(getContext(), uri);
            String title = ringtone == null ? null : ringtone.getTitle(getContext());
            return title == null || title.trim().isEmpty() ? "Sonido personalizado" : title;
        } catch (RuntimeException ignored) {
            return "Sonido personalizado";
        }
    }

    private void ensureChannel() {
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            channelId(),
            getContext().getString(R.string.companion_message_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        Uri soundUri = selectedSoundUri();
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(soundUri, soundUri == null ? null : attributes);
        manager.createNotificationChannel(channel);
    }

    private void saveSound(Uri uri) {
        String previousChannel = channelId();
        String value;
        if (uri == null) value = SOUND_SILENT;
        else if (uri.equals(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))) value = SOUND_DEFAULT;
        else value = uri.toString();

        preferences().edit()
            .putString(KEY_SOUND_URI, value)
            .putString(KEY_SOUND_LABEL, titleFor(uri))
            .putInt(KEY_CHANNEL_GENERATION, channelGeneration() + 1)
            .apply();
        ensureChannel();

        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager != null && !previousChannel.equals(channelId())) manager.deleteNotificationChannel(previousChannel);
    }

    private String permissionStatus() {
        boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return enabled ? "granted" : "blocked";
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
    public void getSound(PluginCall call) {
        ensureChannel();
        call.resolve(soundResult());
    }

    @PluginMethod
    public void pickSound(PluginCall call) {
        Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Sonido de Wander");
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, true);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, selectedSoundUri());
        startActivityForResult(call, intent, "pickSoundResult");
    }

    @ActivityCallback
    private void pickSoundResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        JSObject result = soundResult();
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            result.put("cancelled", true);
            call.resolve(result);
            return;
        }
        Uri picked = activityResult.getData().getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
        saveSound(picked);
        result = soundResult();
        result.put("cancelled", false);
        call.resolve(result);
    }

    @PluginMethod
    public void notifyCompanion(PluginCall call) {
        JSObject result = permissionResult();
        if (!result.getBool("granted", false)) {
            result.put("delivered", false);
            call.resolve(result);
            return;
        }

        ensureChannel();
        String title = call.getString("title", "Wander");
        String message = call.getString("message", "Wander tiene algo para contarte.");
        String id = call.getString("id", String.valueOf(System.currentTimeMillis()));

        Intent openIntent = new Intent(getContext(), MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            getContext(),
            id.hashCode(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notification = new NotificationCompat.Builder(getContext(), channelId())
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
            JSObject sound = soundResult();
            result.put("soundMode", sound.getString("mode"));
            result.put("soundLabel", sound.getString("label"));
        } catch (SecurityException error) {
            result = permissionResult();
            result.put("delivered", false);
            result.put("error", "permission_denied");
        }
        call.resolve(result);
    }
}
