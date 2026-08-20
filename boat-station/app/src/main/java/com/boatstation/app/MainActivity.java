package com.boatstation.app;

import android.Manifest;
import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

public class MainActivity extends Activity implements LocationListener, SensorEventListener {
    private static final int REQ_LOCATION = 1001;
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

    private final Runnable statusTicker = new Runnable() {
        @Override public void run() {
            pushPhoneStatus();
            handler.postDelayed(this, 5000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.setBackgroundColor(0xFF061522);

        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        accelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        magneticSensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);

        webView.loadUrl("file:///android_asset/index.html");
        webView.postDelayed(() -> {
            installUiPatches();
            requestLocationIfNeeded();
            pushPhoneStatus();
        }, 900);
    }

    private void installUiPatches() {
        String js = "(function(){" +
                "if(window.__boatStationPagerFix)return;window.__boatStationPagerFix=true;" +
                "window.updateCardPager=function(card,idx){" +
                "if(!card)return;card.querySelectorAll('.pager').forEach(function(p){" +
                "var s=p.querySelectorAll('span');s.forEach(function(x,i){x.classList.toggle('on',i===idx);x.textContent=i===idx?'●':'○';});" +
                "});};" +
                "var oldCycle=window.cycleView;" +
                "window.cycleView=function(id,dir){" +
                "var card=document.querySelector('.card[data-id=\\\"'+id+'\\\"]');" +
                "var all=card?Array.from(card.querySelectorAll('.view')):[];" +
                "if(!card||all.length<2||card.dataset.flipping==='1')return;" +
                "var current=all.findIndex(function(v){return v.classList.contains('active');});" +
                "var next=(current+dir+all.length)%all.length;" +
                "card.dataset.flipping='1';" +
                "var out=dir>0?'flip-out-left':'flip-out-right',inn=dir>0?'flip-in-right':'flip-in-left';" +
                "card.classList.add(out);" +
                "setTimeout(function(){" +
                "all.forEach(function(v,i){v.classList.toggle('active',i===next);});" +
                "views[id]=next;save();window.updateCardPager(card,next);" +
                "card.classList.remove(out);card.classList.add(inn);" +
                "setTimeout(function(){card.classList.remove(inn);card.dataset.flipping='0';},195);" +
                "},155);" +
                "};" +
                "document.querySelectorAll('.card').forEach(function(card){" +
                "var id=card.dataset.id;window.updateCardPager(card,views[id]||0);" +
                "});" +
                "})();";
        eval(js);
    }

    private void requestLocationIfNeeded() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
        } else {
            startLocationUpdates();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOCATION && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startLocationUpdates();
        } else if (requestCode == REQ_LOCATION) {
            eval("window.BoatStation && BoatStation.locationDenied && BoatStation.locationDenied()");
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

    @Override
    public void onLocationChanged(Location location) {
        try {
            JSONObject o = new JSONObject();
            o.put("lat", location.getLatitude());
            o.put("lon", location.getLongitude());
            o.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : -1);
            o.put("speedKts", location.hasSpeed() ? location.getSpeed() * 1.94384449 : 0);
            o.put("bearing", location.hasBearing() ? location.getBearing() : 0);
            o.put("altitude", location.hasAltitude() ? location.getAltitude() : 0);
            o.put("time", location.getTime());
            eval("window.BoatStation && BoatStation.updateGPS(" + o.toString() + ")");
        } catch (Exception ignored) {}
    }

    private void pushPhoneStatus() {
        try {
            Intent battery = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            int level = 0;
            int tempTenths = 0;
            boolean charging = false;
            if (battery != null) {
                int raw = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                level = scale > 0 ? Math.round(raw * 100f / scale) : raw;
                tempTenths = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0);
                int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
            }

            JSONObject o = new JSONObject();
            o.put("battery", level);
            o.put("batteryTemp", tempTenths / 10.0);
            o.put("charging", charging);
            o.put("network", getNetworkLabel());
            o.put("model", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL);
            o.put("android", android.os.Build.VERSION.RELEASE);
            o.put("version", "0.0.3");
            eval("window.BoatStation && BoatStation.updatePhone(" + o.toString() + ")");
        } catch (Exception ignored) {}
    }

    private String getNetworkLabel() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            if (n == null) return "Offline";
            NetworkCapabilities caps = cm.getNetworkCapabilities(n);
            if (caps == null) return "Online";
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "Wi‑Fi";
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "Datos móviles";
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "Ethernet";
            return "Online";
        } catch (Exception e) { return "Desconocida"; }
    }

    @Override protected void onResume() {
        super.onResume();
        if (accelSensor != null) sensorManager.registerListener(this, accelSensor, SensorManager.SENSOR_DELAY_UI);
        if (magneticSensor != null) sensorManager.registerListener(this, magneticSensor, SensorManager.SENSOR_DELAY_UI);
        handler.removeCallbacks(statusTicker);
        handler.post(statusTicker);
        webView.postDelayed(this::installUiPatches, 300);
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) startLocationUpdates();
    }

    @Override protected void onPause() {
        super.onPause();
        sensorManager.unregisterListener(this);
        handler.removeCallbacks(statusTicker);
        try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
    }

    @Override public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            System.arraycopy(event.values, 0, gravity, 0, 3);
            hasGravity = true;
            double magnitude = Math.sqrt(event.values[0]*event.values[0] + event.values[1]*event.values[1] + event.values[2]*event.values[2]);
            double motion = Math.abs(magnitude - SensorManager.GRAVITY_EARTH);
            eval("window.BoatStation && BoatStation.updateMotion(" + String.format(java.util.Locale.US, "%.3f", motion) + ")");
        } else if (event.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
            System.arraycopy(event.values, 0, geomagnetic, 0, 3);
            hasGeomagnetic = true;
        }
        if (hasGravity && hasGeomagnetic) {
            float[] R = new float[9];
            float[] I = new float[9];
            if (SensorManager.getRotationMatrix(R, I, gravity, geomagnetic)) {
                float[] orientation = new float[3];
                SensorManager.getOrientation(R, orientation);
                double azimuth = Math.toDegrees(orientation[0]);
                if (azimuth < 0) azimuth += 360;
                eval("window.BoatStation && BoatStation.updateCompass(" + String.format(java.util.Locale.US, "%.1f", azimuth) + ")");
            }
        }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    private void eval(String js) {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
