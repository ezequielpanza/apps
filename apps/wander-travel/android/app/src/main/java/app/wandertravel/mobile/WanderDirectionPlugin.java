package app.wandertravel.mobile;

import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.view.Surface;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WanderDirection")
public class WanderDirectionPlugin extends Plugin implements SensorEventListener {
    private static final long PUBLISH_INTERVAL_MS = 100;

    private SensorManager sensorManager;
    private Sensor directionSensor;
    private boolean requestedEnabled = false;
    private boolean running = false;
    private int directionAccuracy = SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM;
    private long lastPublishAt = 0;
    private final float[] rotationMatrix = new float[9];
    private final float[] adjustedRotationMatrix = new float[9];
    private final float[] orientationAngles = new float[3];

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(android.content.Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            directionSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            if (directionSensor == null) {
                directionSensor = sensorManager.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
            }
        }
    }

    private boolean sensorAvailable() {
        return sensorManager != null && directionSensor != null;
    }

    private String sensorSource() {
        if (directionSensor == null) return "unavailable";
        return directionSensor.getType() == Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR
            ? "geomagnetic_rotation_vector"
            : "rotation_vector";
    }

    private boolean registerSensor() {
        if (!requestedEnabled || !sensorAvailable()) {
            running = false;
            return false;
        }
        sensorManager.unregisterListener(this);
        directionAccuracy = SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM;
        lastPublishAt = 0;
        running = sensorManager.registerListener(this, directionSensor, SensorManager.SENSOR_DELAY_GAME);
        if (!running) publishUnavailable();
        return running;
    }

    private void unregisterSensor() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        running = false;
    }

    private JSObject statusPayload() {
        JSObject result = new JSObject();
        result.put("available", sensorAvailable());
        result.put("enabled", requestedEnabled && running);
        result.put("running", running);
        result.put("source", sensorSource());
        result.put("magnetic", true);
        result.put("gyroscopeFused", true);
        result.put("independentFromLocation", true);
        return result;
    }

    @PluginMethod
    public void setSensorEnabled(PluginCall call) {
        requestedEnabled = call.getBoolean("enabled", false);
        Runnable action = () -> {
            if (requestedEnabled) registerSensor();
            else unregisterSensor();
            call.resolve(statusPayload());
        };
        if (getActivity() != null) getActivity().runOnUiThread(action);
        else action.run();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(statusPayload());
    }

    private static String confidenceFor(int accuracy) {
        if (accuracy == SensorManager.SENSOR_STATUS_ACCURACY_HIGH) return "high";
        if (accuracy == SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM) return "medium";
        if (accuracy == SensorManager.SENSOR_STATUS_ACCURACY_LOW) return "low";
        return "unreliable";
    }

    private int displayRotation() {
        if (getActivity() == null) return Surface.ROTATION_0;
        WindowManager manager = getActivity().getWindowManager();
        return manager == null ? Surface.ROTATION_0 : manager.getDefaultDisplay().getRotation();
    }

    private float[] remapForDisplay(float[] source) {
        int rotation = displayRotation();
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
    public void onSensorChanged(SensorEvent event) {
        if (!running || event == null || event.sensor != directionSensor || event.values.length < 3) return;
        long now = System.currentTimeMillis();
        if (now - lastPublishAt < PUBLISH_INTERVAL_MS) return;
        lastPublishAt = now;

        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);
        SensorManager.getOrientation(remapForDisplay(rotationMatrix), orientationAngles);
        float heading = (float) Math.toDegrees(orientationAngles[0]);
        if (heading < 0) heading += 360f;

        JSObject payload = new JSObject();
        payload.put("heading", heading);
        payload.put("accuracy", directionAccuracy);
        payload.put("confidence", confidenceFor(directionAccuracy));
        payload.put("timestamp", now);
        payload.put("source", sensorSource());
        payload.put("magnetic", true);
        payload.put("gyroscopeFused", true);
        notifyListeners("direction", payload, true);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        if (sensor == directionSensor) directionAccuracy = accuracy;
    }

    private void publishUnavailable() {
        JSObject payload = new JSObject();
        payload.put("status", "unavailable");
        payload.put("source", sensorSource());
        notifyListeners("directionError", payload, true);
    }

    @Override
    protected void handleOnPause() {
        unregisterSensor();
    }

    @Override
    protected void handleOnResume() {
        if (requestedEnabled) registerSensor();
    }

    @Override
    protected void handleOnDestroy() {
        requestedEnabled = false;
        unregisterSensor();
    }
}
