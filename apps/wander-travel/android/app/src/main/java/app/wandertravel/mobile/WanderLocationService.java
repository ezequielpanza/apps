package app.wandertravel.mobile;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.IBinder;
import android.view.Surface;
import android.view.WindowManager;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

public class WanderLocationService extends Service implements LocationListener, SensorEventListener {
    static final String ACTION_START = "app.wandertravel.mobile.action.START_LOCATION";
    static final String ACTION_STOP = "app.wandertravel.mobile.action.STOP_LOCATION";
    static final String ACTION_DIRECTION_SENSOR = "app.wandertravel.mobile.action.DIRECTION_SENSOR";
    static final String EXTRA_DIRECTION_SENSOR_ENABLED = "directionSensorEnabled";
    private static final String CHANNEL_ID = "wander_companion";
    private static final String RUNTIME_PREFS = "wander_direction_runtime";
    private static final String DIRECTION_ACTIVE_KEY = "direction_active";
    private static final int NOTIFICATION_ID = 4107;
    private static final long BETTER_FIX_RETENTION_MS = 20000;
    private static final float ACCURACY_REGRESSION_TOLERANCE_M = 8f;
    private static final float SIGNIFICANT_ACCURACY_GAIN_M = 10f;
    private static final long DIRECTION_PUBLISH_INTERVAL_MS = 100;
    private static volatile boolean running = false;
    private static volatile boolean directionRunning = false;

    private LocationManager locationManager;
    private SensorManager sensorManager;
    private Sensor motionSensor;
    private Sensor directionSensor;
    private WanderLocationJournal locationJournal;
    private boolean linearAccelerationSensor = false;
    private long lastSensorPublishAt = 0;
    private long lastDirectionPublishAt = 0;
    private int directionAccuracy = SensorManager.SENSOR_STATUS_UNRELIABLE;
    private Location lastPublishedLocation;
    private final float[] rotationMatrix = new float[9];
    private final float[] adjustedRotationMatrix = new float[9];
    private final float[] orientationAngles = new float[3];

    static boolean isRunning() {
        return running;
    }

    static boolean isDirectionRunning() {
        return directionRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        locationJournal = WanderLocationJournal.get(this);
        motionSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
        linearAccelerationSensor = motionSensor != null;
        if (motionSensor == null) motionSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        directionSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        createNotificationChannel();
        boolean restoreDirection = getSharedPreferences(RUNTIME_PREFS, MODE_PRIVATE).getBoolean(DIRECTION_ACTIVE_KEY, false);
        if (restoreDirection) setDirectionSensorEnabled(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            setDirectionSensorEnabled(false);
            stopTracking();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (intent != null && ACTION_DIRECTION_SENSOR.equals(intent.getAction())) {
            setDirectionSensorEnabled(intent.getBooleanExtra(EXTRA_DIRECTION_SENSOR_ENABLED, false));
            return START_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildNotification());
        long minimumIntervalMs = intent == null ? 5000 : intent.getIntExtra("minimumIntervalMs", 5000);
        float minimumDistanceM = intent == null ? 5 : intent.getIntExtra("minimumDistanceM", 5);
        boolean highAccuracy = intent == null || intent.getBooleanExtra("highAccuracy", true);
        boolean directionEnabled = intent != null && intent.getBooleanExtra(EXTRA_DIRECTION_SENSOR_ENABLED, directionRunning);
        startTracking(minimumIntervalMs, minimumDistanceM, highAccuracy);
        setDirectionSensorEnabled(directionEnabled);
        return START_STICKY;
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
        if (sensorManager != null && motionSensor != null) sensorManager.unregisterListener(this, motionSensor);
        lastPublishedLocation = null;
        running = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    private void startMotionSensor() {
        if (sensorManager == null || motionSensor == null) {
            WanderLocationPlugin.publishMotionUnavailable();
            return;
        }
        sensorManager.unregisterListener(this, motionSensor);
        sensorManager.registerListener(this, motionSensor, SensorManager.SENSOR_DELAY_NORMAL);
    }

    private void setDirectionSensorEnabled(boolean enabled) {
        SharedPreferences preferences = getSharedPreferences(RUNTIME_PREFS, MODE_PRIVATE);
        boolean active = enabled && sensorManager != null && directionSensor != null;
        preferences.edit().putBoolean(DIRECTION_ACTIVE_KEY, active).apply();
        if (sensorManager != null && directionSensor != null) sensorManager.unregisterListener(this, directionSensor);
        directionRunning = false;
        if (!enabled) return;
        if (!active) {
            WanderLocationPlugin.publishDirectionUnavailable();
            return;
        }
        directionAccuracy = SensorManager.SENSOR_STATUS_UNRELIABLE;
        directionRunning = sensorManager.registerListener(this, directionSensor, SensorManager.SENSOR_DELAY_GAME);
        if (!directionRunning) WanderLocationPlugin.publishDirectionUnavailable();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event == null || event.sensor == null) return;
        if (event.sensor == directionSensor) {
            publishDirection(event);
            return;
        }
        if (event.sensor != motionSensor || event.values.length < 3) return;
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

    private void publishDirection(SensorEvent event) {
        if (!directionRunning || event.values.length < 3) return;
        long now = System.currentTimeMillis();
        if (now - lastDirectionPublishAt < DIRECTION_PUBLISH_INTERVAL_MS) return;
        lastDirectionPublishAt = now;

        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);
        float[] displayMatrix = remapForDisplay(rotationMatrix);
        SensorManager.getOrientation(displayMatrix, orientationAngles);
        float heading = (float) Math.toDegrees(orientationAngles[0]);
        if (heading < 0) heading += 360f;
        WanderLocationPlugin.publishDirection(heading, directionAccuracy, now);
    }

    private float[] remapForDisplay(float[] source) {
        WindowManager windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        int rotation = windowManager == null ? Surface.ROTATION_0 : windowManager.getDefaultDisplay().getRotation();
        int axisX = SensorManager.AXIS_X;
        int axisY = SensorManager.AXIS_Y;
        if (rotation == Surface.ROTATION_90) {
            axisX = SensorManager.AXIS_Y;
            axisY = SensorManager.AXIS_MINUS_X;
        } else if (rotation == Surface.ROTATION_180) {
            axisX = SensorManager.AXIS_MINUS_X;
            axisY = SensorManager.AXIS_MINUS_Y;
        } else if (rotation == Surface.ROTATION_270) {
            axisX = SensorManager.AXIS_MINUS_Y;
            axisY = SensorManager.AXIS_X;
        }
        if (rotation == Surface.ROTATION_0) return source;
        SensorManager.remapCoordinateSystem(source, axisX, axisY, adjustedRotationMatrix);
        return adjustedRotationMatrix;
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        if (sensor == directionSensor) directionAccuracy = accuracy;
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

    private String permissionPrecision() {
        return ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            ? "precise"
            : "approximate";
    }

    @Override
    public void onLocationChanged(Location location) {
        if (!shouldPublish(location)) return;
        lastPublishedLocation = new Location(location);
        long journalId = locationJournal == null ? -1 : locationJournal.append(location, permissionPrecision());
        WanderLocationPlugin.publish(location, journalId);
    }

    @Override
    public void onProviderDisabled(String provider) {
        WanderLocationPlugin.publishError("unavailable");
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        setDirectionSensorEnabled(false);
        stopTracking();
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        setDirectionSensorEnabled(false);
        stopTracking();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
