package com.boatstation.app;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class MainActivity extends Activity implements LocationListener, SensorEventListener {
    private static final int REQ_LOCATION = 1001;
    private static final int REQ_BLUETOOTH = 1002;
    private static final String PREFS = "boat_station";
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private WebView webView;
    private LocationManager locationManager;
    private SensorManager sensorManager;
    private Sensor accelSensor;
    private Sensor magneticSensor;
    private final float[] gravity = new float[3];
    private final float[] geomagnetic = new float[3];
    private boolean hasGravity = false;
    private boolean hasGeomagnetic = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bleScanner;
    private boolean scanning = false;
    private final Map<Integer, BluetoothGatt> batteryGatts = new HashMap<>();

    private final Runnable statusTicker = new Runnable() {
        @Override public void run() {
            pushPhoneStatus();
            handler.postDelayed(this, 5000);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.addJavascriptInterface(new NativeBridge(), "NativeBridge");
        webView.setBackgroundColor(0xFF061522);

        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        accelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        magneticSensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);

        BluetoothManager bluetoothManager = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        bluetoothAdapter = bluetoothManager != null ? bluetoothManager.getAdapter() : null;
        bleScanner = bluetoothAdapter != null ? bluetoothAdapter.getBluetoothLeScanner() : null;

        webView.loadUrl("file:///android_asset/index.html");
        webView.postDelayed(() -> {
            requestLocationIfNeeded();
            requestBluetoothIfNeeded();
            pushPhoneStatus();
            connectSavedBatteries();
        }, 800);
    }

    private void requestLocationIfNeeded() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
        } else startLocationUpdates();
    }

    private boolean hasBluetoothPermissions() {
        if (Build.VERSION.SDK_INT < 31) return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        return checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestBluetoothIfNeeded() {
        if (hasBluetoothPermissions()) return;
        if (Build.VERSION.SDK_INT >= 31) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}, REQ_BLUETOOTH);
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOCATION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startLocationUpdates();
                if (Build.VERSION.SDK_INT < 31) connectSavedBatteries();
            } else eval("window.BoatStation&&BoatStation.locationDenied&&BoatStation.locationDenied()");
        } else if (requestCode == REQ_BLUETOOTH) {
            if (hasBluetoothPermissions()) {
                refreshScanner();
                connectSavedBatteries();
            } else eval("window.BoatStation&&BoatStation.onBluetoothPermission&&BoatStation.onBluetoothPermission(false)");
        }
    }

    private void startLocationUpdates() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 0.5f, this);
            Location last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (last != null) onLocationChanged(last);
        } catch (Exception ignored) {}
    }

    @Override public void onLocationChanged(Location location) {
        try {
            JSONObject o = new JSONObject();
            o.put("lat", location.getLatitude());
            o.put("lon", location.getLongitude());
            o.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : -1);
            o.put("speedKts", location.hasSpeed() ? location.getSpeed() * 1.94384449 : 0);
            o.put("bearing", location.hasBearing() ? location.getBearing() : 0);
            o.put("altitude", location.hasAltitude() ? location.getAltitude() : 0);
            o.put("time", location.getTime());
            eval("window.BoatStation&&BoatStation.updateGPS(" + o + ")");
        } catch (Exception ignored) {}
    }

    private void pushPhoneStatus() {
        try {
            Intent battery = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            int level = 0, tempTenths = 0;
            boolean charging = false;
            if (battery != null) {
                int raw = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                level = scale > 0 ? Math.round(raw * 100f / scale) : raw;
                tempTenths = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0);
                int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
            }
            long chargeTimeMs = -1;
            if (Build.VERSION.SDK_INT >= 28) {
                BatteryManager bm = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
                if (bm != null) chargeTimeMs = bm.computeChargeTimeRemaining();
            }
            JSONObject o = new JSONObject();
            o.put("battery", level);
            o.put("batteryTemp", tempTenths / 10.0);
            o.put("charging", charging);
            o.put("network", getNetworkLabel());
            o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
            o.put("android", Build.VERSION.RELEASE);
            o.put("version", "0.0.7");
            o.put("chargeTimeMs", Math.max(0, chargeTimeMs));
            eval("window.BoatStation&&BoatStation.updatePhone(" + o + ")");
        } catch (Exception ignored) {}
    }

    private String getNetworkLabel() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            if (n == null) return "Offline";
            NetworkCapabilities caps = cm.getNetworkCapabilities(n);
            if (caps == null) return "Online";
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "Wi-Fi";
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "Datos móviles";
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "Ethernet";
            return "Online";
        } catch (Exception e) { return "Desconocida"; }
    }

    private void refreshScanner() { if (bluetoothAdapter != null) bleScanner = bluetoothAdapter.getBluetoothLeScanner(); }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override public void onScanResult(int callbackType, ScanResult result) {
            try {
                BluetoothDevice d = result.getDevice();
                String name = result.getScanRecord() != null ? result.getScanRecord().getDeviceName() : null;
                if ((name == null || name.trim().isEmpty()) && (Build.VERSION.SDK_INT < 31 || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED)) name = d.getName();
                JSONObject o = new JSONObject();
                o.put("name", name == null ? "" : name);
                o.put("address", d.getAddress());
                o.put("rssi", result.getRssi());
                eval("window.BoatStation&&BoatStation.onBleScanResult(" + o + ")");
            } catch (Exception ignored) {}
        }
        @Override public void onScanFailed(int errorCode) { eval("window.BoatStation&&BoatStation.onBleScanFailed&&BoatStation.onBleScanFailed(" + errorCode + ")"); }
    };

    private void startBatteryScanInternal() {
        if (!hasBluetoothPermissions()) { requestBluetoothIfNeeded(); return; }
        refreshScanner();
        if (bleScanner == null || bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            eval("window.BoatStation&&BoatStation.onBleScanFailed&&BoatStation.onBleScanFailed(-1)"); return;
        }
        try {
            if (scanning) bleScanner.stopScan(scanCallback);
            scanning = true; bleScanner.startScan(scanCallback);
            handler.postDelayed(this::stopBatteryScanInternal, 10000);
        } catch (SecurityException ignored) {}
    }

    private void stopBatteryScanInternal() {
        if (!scanning || bleScanner == null || !hasBluetoothPermissions()) return;
        try { bleScanner.stopScan(scanCallback); } catch (Exception ignored) {}
        scanning = false;
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, MODE_PRIVATE); }

    private void saveBatteryConfig(int slot, String address, String name, int capacityAh) {
        prefs().edit().putString("battery_" + slot + "_address", address == null ? "" : address)
                .putString("battery_" + slot + "_name", name == null ? ("Batería " + slot) : name)
                .putInt("battery_" + slot + "_capacity", capacityAh).apply();
        connectBattery(slot);
    }

    private JSONArray savedBatteryJson() {
        JSONArray arr = new JSONArray();
        try {
            for (int slot = 1; slot <= 2; slot++) {
                String address = prefs().getString("battery_" + slot + "_address", "");
                String name = prefs().getString("battery_" + slot + "_name", "Batería " + slot);
                int capacity = prefs().getInt("battery_" + slot + "_capacity", 300);
                JSONObject o = new JSONObject();
                o.put("slot", slot); o.put("address", address); o.put("name", name); o.put("capacityAh", capacity);
                o.put("connected", batteryGatts.containsKey(slot)); arr.put(o);
            }
        } catch (Exception ignored) {}
        return arr;
    }

    private void connectSavedBatteries() {
        if (!hasBluetoothPermissions() || bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) return;
        connectBattery(1); connectBattery(2);
    }

    private void connectBattery(int slot) {
        if (!hasBluetoothPermissions() || bluetoothAdapter == null) return;
        String address = prefs().getString("battery_" + slot + "_address", "");
        if (address == null || address.isEmpty()) return;
        try {
            BluetoothGatt old = batteryGatts.remove(slot); if (old != null) old.close();
            BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
            BluetoothGatt gatt = device.connectGatt(this, true, new BatteryGattCallback(slot));
            batteryGatts.put(slot, gatt); pushBatteryConnection(slot, false);
        } catch (Exception ignored) {}
    }

    private void pushBatteryConnection(int slot, boolean connected) {
        try {
            JSONObject o = new JSONObject();
            o.put("slot", slot); o.put("connected", connected);
            o.put("address", prefs().getString("battery_" + slot + "_address", ""));
            o.put("name", prefs().getString("battery_" + slot + "_name", "Batería " + slot));
            o.put("capacityAh", prefs().getInt("battery_" + slot + "_capacity", 300));
            eval("window.BoatStation&&BoatStation.onBatteryConnection(" + o + ")");
        } catch (Exception ignored) {}
    }

    private static String hex(byte[] data) {
        if (data == null) return "";
        StringBuilder sb = new StringBuilder();
        for (byte b : data) { if (sb.length() > 0) sb.append(' '); sb.append(String.format(java.util.Locale.US, "%02X", b & 0xFF)); }
        return sb.toString();
    }

    private static String propertiesText(int p) {
        List<String> out = new ArrayList<>();
        if ((p & BluetoothGattCharacteristic.PROPERTY_READ) != 0) out.add("READ");
        if ((p & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0) out.add("WRITE");
        if ((p & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) out.add("WRITE_NO_RESPONSE");
        if ((p & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) out.add("NOTIFY");
        if ((p & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0) out.add("INDICATE");
        return android.text.TextUtils.join(" | ", out);
    }

    private void pushRaw(int slot, BluetoothGattCharacteristic c, byte[] value, String source) {
        try {
            JSONObject o = new JSONObject();
            o.put("slot", slot); o.put("service", c.getService() != null ? c.getService().getUuid().toString() : "");
            o.put("characteristic", c.getUuid().toString()); o.put("source", source); o.put("hex", hex(value));
            o.put("length", value == null ? 0 : value.length); o.put("time", System.currentTimeMillis());
            eval("window.BoatStation&&BoatStation.onBatteryRaw(" + o + ")");
        } catch (Exception ignored) {}
    }

    private void subscribeDiagnostic(BluetoothGatt gatt, BluetoothGattCharacteristic c) {
        if (!hasBluetoothPermissions()) return;
        int p = c.getProperties();
        boolean notify = (p & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0;
        boolean indicate = (p & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0;
        if (!notify && !indicate) return;
        try {
            gatt.setCharacteristicNotification(c, true);
            BluetoothGattDescriptor d = c.getDescriptor(CCCD);
            if (d != null) {
                d.setValue(indicate ? BluetoothGattDescriptor.ENABLE_INDICATION_VALUE : BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                gatt.writeDescriptor(d);
            }
        } catch (Exception ignored) {}
    }

    private void readDiagnosticsInternal(int slot) {
        BluetoothGatt gatt = batteryGatts.get(slot);
        if (gatt == null || !hasBluetoothPermissions()) return;
        long delay = 0;
        try {
            for (BluetoothGattService s : gatt.getServices()) {
                for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                    if ((c.getProperties() & BluetoothGattCharacteristic.PROPERTY_READ) != 0) {
                        delay += 450;
                        handler.postDelayed(() -> { try { if (hasBluetoothPermissions()) gatt.readCharacteristic(c); } catch (Exception ignored) {} }, delay);
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    private class BatteryGattCallback extends BluetoothGattCallback {
        private final int slot;
        BatteryGattCallback(int slot) { this.slot = slot; }

        @Override public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            boolean connected = newState == BluetoothProfile.STATE_CONNECTED;
            if (connected) {
                batteryGatts.put(slot, gatt); pushBatteryConnection(slot, true);
                if (hasBluetoothPermissions()) try { gatt.discoverServices(); } catch (SecurityException ignored) {}
            } else { batteryGatts.remove(slot); pushBatteryConnection(slot, false); }
        }

        @Override public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            try {
                JSONArray services = new JSONArray();
                for (BluetoothGattService s : gatt.getServices()) {
                    JSONObject so = new JSONObject(); so.put("uuid", s.getUuid().toString());
                    JSONArray chars = new JSONArray();
                    for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                        JSONObject co = new JSONObject(); co.put("uuid", c.getUuid().toString());
                        co.put("properties", propertiesText(c.getProperties())); co.put("propertiesMask", c.getProperties()); chars.put(co);
                        subscribeDiagnostic(gatt, c);
                    }
                    so.put("characteristics", chars); services.put(so);
                }
                JSONObject o = new JSONObject(); o.put("slot", slot); o.put("services", services);
                eval("window.BoatStation&&BoatStation.onBatteryServices(" + o + ")");
                handler.postDelayed(() -> readDiagnosticsInternal(slot), 1200);
            } catch (Exception ignored) {}
        }

        @Override public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            pushRaw(slot, characteristic, characteristic.getValue(), "NOTIFY");
        }

        @Override public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) pushRaw(slot, characteristic, characteristic.getValue(), "READ");
        }
    }

    public class NativeBridge {
        @JavascriptInterface public void startBatteryScan() { runOnUiThread(MainActivity.this::startBatteryScanInternal); }
        @JavascriptInterface public void stopBatteryScan() { runOnUiThread(MainActivity.this::stopBatteryScanInternal); }
        @JavascriptInterface public String getSavedBatteries() { return savedBatteryJson().toString(); }
        @JavascriptInterface public void saveBattery(int slot, String address, String name, int capacityAh) { runOnUiThread(() -> saveBatteryConfig(slot, address, name, Math.max(1, capacityAh))); }
        @JavascriptInterface public void reconnectBatteries() { runOnUiThread(MainActivity.this::connectSavedBatteries); }
        @JavascriptInterface public void readBatteryDiagnostics(int slot) { runOnUiThread(() -> readDiagnosticsInternal(slot)); }
    }

    @Override protected void onResume() {
        super.onResume();
        if (accelSensor != null) sensorManager.registerListener(this, accelSensor, SensorManager.SENSOR_DELAY_UI);
        if (magneticSensor != null) sensorManager.registerListener(this, magneticSensor, SensorManager.SENSOR_DELAY_UI);
        handler.removeCallbacks(statusTicker); handler.post(statusTicker);
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) startLocationUpdates();
        handler.postDelayed(this::connectSavedBatteries, 800);
    }

    @Override protected void onPause() {
        super.onPause(); sensorManager.unregisterListener(this); handler.removeCallbacks(statusTicker); stopBatteryScanInternal();
        try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
    }

    @Override protected void onDestroy() {
        super.onDestroy(); for (BluetoothGatt gatt : batteryGatts.values()) try { gatt.close(); } catch (Exception ignored) {} batteryGatts.clear();
    }

    @Override public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            System.arraycopy(event.values, 0, gravity, 0, 3); hasGravity = true;
            double magnitude = Math.sqrt(event.values[0]*event.values[0] + event.values[1]*event.values[1] + event.values[2]*event.values[2]);
            double motion = Math.abs(magnitude - SensorManager.GRAVITY_EARTH);
            eval("window.BoatStation&&BoatStation.updateMotion(" + String.format(java.util.Locale.US, "%.3f", motion) + ")");
        } else if (event.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) { System.arraycopy(event.values, 0, geomagnetic, 0, 3); hasGeomagnetic = true; }
        if (hasGravity && hasGeomagnetic) {
            float[] R = new float[9], I = new float[9];
            if (SensorManager.getRotationMatrix(R, I, gravity, geomagnetic)) {
                float[] orientation = new float[3]; SensorManager.getOrientation(R, orientation);
                double azimuth = Math.toDegrees(orientation[0]); if (azimuth < 0) azimuth += 360;
                eval("window.BoatStation&&BoatStation.updateCompass(" + String.format(java.util.Locale.US, "%.1f", azimuth) + ")");
            }
        }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    private void eval(String js) { if (webView != null) webView.post(() -> webView.evaluateJavascript(js, null)); }
    @Override public void onBackPressed() { if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
}
