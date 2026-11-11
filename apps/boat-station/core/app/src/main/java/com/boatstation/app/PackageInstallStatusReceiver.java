package com.boatstation.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageInstaller;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.Toast;

public final class PackageInstallStatusReceiver extends BroadcastReceiver {
    public static final String ACTION_INSTALL_STATUS = "com.boatstation.app.ACTION_INSTALL_STATUS";
    public static final String ACTION_USER_CONFIRMATION = "com.boatstation.app.ACTION_INSTALL_USER_CONFIRMATION";
    public static final String INSTALL_SESSION_ID = "install_session_id";
    public static final String PENDING_CONFIRMATION_URI = "pending_confirmation_uri";
    public static final String PENDING_SESSION_ID = "pending_session_id";
    public static final String EXTRA_CONFIRMATION_URI = "confirmation_uri";
    private static final String PREFS = "boatstation_update";
    private static final String UPDATE_ID = "download_id";
    private static final String CHANNEL_ID = "boatstation_updates";

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        int sessionId = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1);
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String statusMessage = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirmation;
            if (Build.VERSION.SDK_INT >= 33) {
                confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
            } else {
                confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            }
            if (confirmation == null) {
                notifyUser(context, "Boat Station", "Android requiere confirmar la actualización. Abrí Boat Station para continuar.", sessionId, null);
                return;
            }
            String confirmationUri = confirmation.toUri(Intent.URI_INTENT_SCHEME);
            prefs.edit().putString(PENDING_CONFIRMATION_URI, confirmationUri)
                    .putInt(PENDING_SESSION_ID, sessionId).apply();
            if (BoatStationActivity.isActivityVisible()) {
                Intent event = new Intent(ACTION_USER_CONFIRMATION)
                        .setPackage(context.getPackageName())
                        .putExtra(Intent.EXTRA_INTENT, confirmation)
                        .putExtra(EXTRA_CONFIRMATION_URI, confirmationUri);
                context.sendBroadcast(event);
            } else {
                notifyUser(context, "Boat Station", "Android necesita tu autorización para instalar la actualización.", sessionId, confirmation);
            }
            return;
        }

        int activeSession = prefs.getInt(INSTALL_SESSION_ID, -1);
        if (sessionId < 0 || activeSession == sessionId) {
            prefs.edit().remove(INSTALL_SESSION_ID).remove(PENDING_CONFIRMATION_URI)
                    .remove(PENDING_SESSION_ID).remove(UPDATE_ID).apply();
        }

        if (status == PackageInstaller.STATUS_SUCCESS) {
            if (BoatStationActivity.isActivityVisible()) {
                Toast.makeText(context, "Boat Station se actualizó correctamente", Toast.LENGTH_LONG).show();
            } else {
                notifyUser(context, "Boat Station", "La actualización se instaló correctamente.", sessionId, null);
            }
        } else {
            String message = "No se pudo completar la actualización.";
            if (statusMessage != null && !statusMessage.trim().isEmpty()) message += " " + statusMessage;
            if (BoatStationActivity.isActivityVisible()) {
                Toast.makeText(context, message, Toast.LENGTH_LONG).show();
            } else {
                notifyUser(context, "Boat Station", message + " La APK descargada sigue en Descargas.", sessionId, null);
            }
        }
    }

    public static void notifyUser(Context context, String title, String message, int requestCode, Intent action) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Actualizaciones de Boat Station", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Avisos para completar o confirmar actualizaciones de Boat Station");
            manager.createNotificationChannel(channel);
        }
        Intent tapIntent;
        if (action == null) {
            tapIntent = new Intent(context, BoatStationActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        } else {
            tapIntent = new Intent(context, InstallConfirmationActivity.class)
                    .putExtra(Intent.EXTRA_INTENT, action)
                    .putExtra(InstallConfirmationActivity.EXTRA_SESSION_ID, requestCode)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, Math.max(1, requestCode), tapIntent, flags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID) : new Notification.Builder(context);
        Notification notification = builder.setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle(title).setContentText(message).setStyle(new Notification.BigTextStyle().bigText(message))
                .setContentIntent(pendingIntent).setAutoCancel(true).build();
        manager.notify(Math.max(1, requestCode), notification);
    }
}
