package app.wandertravel.mobile;

import android.content.Intent;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;

@CapacitorPlugin(name = "WanderDirection")
public class WanderDirectionPlugin extends Plugin {
    private static WeakReference<WanderDirectionPlugin> activePlugin = new WeakReference<>(null);

    @Override
    public void load() {
        activePlugin = new WeakReference<>(this);
    }

    private boolean sensorAvailable() {
        SensorManager manager = (SensorManager) getContext().getSystemService(android.content.Context.SENSOR_SERVICE);
        Sensor sensor = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        return sensor != null;
    }

    @PluginMethod
    public void setSensorEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        Intent intent = new Intent(getContext(), WanderLocationService.class);
        intent.setAction(WanderLocationService.ACTION_DIRECTION_SENSOR);
        intent.putExtra(WanderLocationService.EXTRA_DIRECTION_SENSOR_ENABLED, enabled);
        getContext().startService(intent);

        JSObject result = new JSObject();
        result.put("available", sensorAvailable());
        result.put("enabled", enabled && sensorAvailable());
        result.put("running", WanderLocationService.isDirectionRunning());
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", sensorAvailable());
        result.put("running", WanderLocationService.isDirectionRunning());
        result.put("source", "rotation_vector");
        result.put("magnetic", true);
        result.put("gyroscopeFused", true);
        call.resolve(result);
    }

    private static String confidenceFor(int accuracy) {
        if (accuracy == SensorManager.SENSOR_STATUS_ACCURACY_HIGH) return "high";
        if (accuracy == SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM) return "medium";
        if (accuracy == SensorManager.SENSOR_STATUS_ACCURACY_LOW) return "low";
        return "unreliable";
    }

    static void publishDirection(float heading, int accuracy, long timestamp) {
        WanderDirectionPlugin plugin = activePlugin.get();
        if (plugin == null) return;
        JSObject payload = new JSObject();
        payload.put("heading", heading);
        payload.put("accuracy", accuracy);
        payload.put("confidence", confidenceFor(accuracy));
        payload.put("timestamp", timestamp);
        payload.put("source", "rotation_vector");
        payload.put("magnetic", true);
        payload.put("gyroscopeFused", true);
        plugin.notifyListeners("direction", payload, true);
    }

    static void publishUnavailable() {
        WanderDirectionPlugin plugin = activePlugin.get();
        if (plugin == null) return;
        JSObject payload = new JSObject();
        payload.put("status", "unavailable");
        plugin.notifyListeners("directionError", payload, true);
    }
}
