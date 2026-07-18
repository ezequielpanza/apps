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
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

public class WanderLocationService extends Service implements LocationListener, SensorEventListener {
    static final String ACTION_START = "app.wandertravel.mobile.action.START_LOCATION";
    static final String ACTION_STOP = "app.wandertravel.mobile.action.STOP_LOCATION";
    private static final String CHANNEL_ID = "wander_companion";
    private static final int NOTIFICATION_ID = 4107;
    private static final long BETTER_FIX_RETENTION_MS = 20000;
    private static final float ACCURACY_REGRESSION_TOLERANCE_M = 8f;
    private static final float SIGNIFICANT_ACCURACY_GAIN_M = 10f;
    private static volatile boolean running = false;

    private LocationManager locationManager;
    private SensorManager sensorManager;
    private Sensor motionSensor;
    private boolean linearAccelerationSensor = false;
    private long lastSensorPublishAt = 0;
    private Location lastPublishedLocation;

    static boolean isRunning() {
        return running;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        motionSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
        linearAccelerationSensor = motionSensor != null;
        if (motionSensor == null) motionSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
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
        lastPublishedLocation = null;
        running = false;
        try {
            if (highAccuracy && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, minimumIntervalMs, minimumDistanceM, this);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, minimumIntervalMs, minimumDistanceM, this);
            }
            running = true;
            startMotionSensor();
        } catch (RuntimeException error) {
            running = false;
            WanderLocationPlugin.publishError("unavailable");
            stopSelf();
        }
    }

    private void stopTracking() {
        if (locationManager != null) locationManager.removeUpdates(this);
        if (sensorManager != null) sensorManager.unregisterListener(this);
        lastPublishedLocation = null;
        running = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    private void startMotionSensor() {
        if (sensorManager == null || motionSensor == null) {
            WanderLocationPlugin.publishMotionUnavailable();
            return;
        }
        sensorManager.unregisterListener(this);
        sensorManager.registerListener(this, motionSensor, SensorManager.SENSOR_DELAY_NORMAL);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event == null || event.sensor != motionSensor || event.values.length < 3) return;
        long now = System.currentTimeMillis();
        if (now - lastSensorPublishAt < 500) return;
        lastSensorPublishAt = now;
        float x = event.values[0];
        float y = event.values[1];
        float z = event.values[2];
        float magnitude = (float) Math.sqrt(x * x + y * y + z * z);
        float activity = linearAccelerationSensor ? magnitude : Math.abs(magnitude - SensorManager.GRAVITY_EARTH);
        WanderLocationPlugin.publishMotion(x, y, z, magnitude, activity, linearAccelerationSensor, now);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

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

    private float accuracyOf(Location location) {
        return location != null && location.hasAccuracy() ? location.getAccuracy() : Float.POSITIVE_INFINITY;
    }

    private boolean shouldPublish(Location location) {
        if (location == null) return false;
        if (lastPublishedLocation == null) return true;

        long currentTime = location.getTime();
        long previousTime = lastPublishedLocation.getTime();
        if (currentTime > 0 && previousTime > 0 && currentTime + 1000 < previousTime) return false;

        long ageMs = currentTime > 0 && previousTime > 0
            ? Math.max(0, currentTime - previousTime)
            : BETTER_FIX_RETENTION_MS;
        float currentAccuracy = accuracyOf(location);
        float previousAccuracy = accuracyOf(lastPublishedLocation);

        if (ageMs >= BETTER_FIX_RETENTION_MS) return true;
        if (currentAccuracy + SIGNIFICANT_ACCURACY_GAIN_M < previousAccuracy) return true;
        if (currentAccuracy <= previousAccuracy + ACCURACY_REGRESSION_TOLERANCE_M) return true;

        String currentProvider = location.getProvider();
        String previousProvider = lastPublishedLocation.getProvider();
        boolean currentIsGps = LocationManager.GPS_PROVIDER.equals(currentProvider);
        boolean previousIsGps = LocationManager.GPS_PROVIDER.equals(previousProvider);
        return currentIsGps && !previousIsGps && currentAccuracy <= previousAccuracy * 1.5f;
    }

    @Override
    public void onLocationChanged(Location location) {
        if (!shouldPublish(location)) return;
        lastPublishedLocation = new Location(location);
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
