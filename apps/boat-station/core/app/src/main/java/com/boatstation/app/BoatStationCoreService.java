package com.boatstation.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

/**
 * Persistent native runtime for Boat Station.
 *
 * Phase 1 foundation: this service intentionally owns no device-specific protocol logic yet.
 * BLE, location, sensors and remote transport will be migrated here incrementally. The service
 * lifecycle is independent from the Activity/WebView so native transports can remain alive while
 * the screen is off or the UI is recreated.
 */
public class BoatStationCoreService extends Service {
    public static final String ACTION_START = "com.boatstation.app.action.START_CORE";
    public static final String ACTION_STOP = "com.boatstation.app.action.STOP_CORE";

    private static final String CHANNEL_ID = "boat_station_core";
    private static final int NOTIFICATION_ID = 4101;

    private final LocalBinder binder = new LocalBinder();
    private long startedAtElapsedRealtime;

    public final class LocalBinder extends Binder {
        public BoatStationCoreService getService() {
            return BoatStationCoreService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        startedAtElapsedRealtime = SystemClock.elapsedRealtime();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildNotification());
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    public long getUptimeMs() {
        return Math.max(0L, SystemClock.elapsedRealtime() - startedAtElapsedRealtime);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Boat Station Core",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Mantiene activas las comunicaciones y sensores de Boat Station");
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
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Boat Station")
                .setContentText("Core activo")
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }
}
