package app.wandertravel.mobile;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

public class WanderLocationService extends Service implements LocationListener {
    static final String ACTION_START = "app.wandertravel.mobile.action.START_LOCATION";
    static final String ACTION_STOP = "app.wandertravel.mobile.action.STOP_LOCATION";
    private static final String CHANNEL_ID = "wander_companion";
    private static final int NOTIFICATION_ID = 4107;
    private static volatile boolean running = false;

    private LocationManager locationManager;

    static boolean isRunning() {
        return running;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopTracking();
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildNotification());
        long minimumIntervalMs = intent == null ? 5000 : intent.getIntExtra("minimumIntervalMs", 5000);
        float minimumDistanceM = intent == null ? 5 : intent.getIntExtra("minimumDistanceM", 5);
        boolean highAccuracy = intent == null || intent.getBooleanExtra("highAccuracy", true);
        startTracking(minimumIntervalMs, minimumDistanceM, highAccuracy);
        return START_NOT_STICKY;
    }

    private void startTracking(long minimumIntervalMs, float minimumDistanceM, boolean highAccuracy) {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            WanderLocationPlugin.publishError("denied");
            stopSelf();
            return;
        }

        locationManager.removeUpdates(this);
        running = false;
        try {
            if (highAccuracy && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, minimumIntervalMs, minimumDistanceM, this);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, minimumIntervalMs, minimumDistanceM, this);
            }
            running = true;
        } catch (RuntimeException error) {
            running = false;
            WanderLocationPlugin.publishError("unavailable");
            stopSelf();
        }
    }

    private void stopTracking() {
        if (locationManager != null) locationManager.removeUpdates(this);
        running = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            getString(R.string.companion_channel_name),
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(getString(R.string.companion_channel_description));
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, WanderLocationService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_wander)
            .setContentTitle(getString(R.string.companion_notification_title))
            .setContentText(getString(R.string.companion_notification_text))
            .setContentIntent(openPendingIntent)
            .addAction(0, getString(R.string.companion_notification_stop), stopPendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    @Override
    public void onLocationChanged(Location location) {
        WanderLocationPlugin.publish(location);
    }

    @Override
    public void onProviderDisabled(String provider) {
        WanderLocationPlugin.publishError("unavailable");
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopTracking();
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        stopTracking();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
