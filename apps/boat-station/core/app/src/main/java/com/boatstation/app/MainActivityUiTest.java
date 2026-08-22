package com.boatstation.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/** Clean Boat Station Core shell. Native code only exposes hardware capabilities. */
public class MainActivityUiTest extends Activity implements LocationListener {
    private static final String VERSION = "1.1.5-test";
    private static final String URL = "https://boat-station.pages.dev/clean/?mode=station";
    private static final int REQ_LOCATION = 1001;

    private WebView webView;
    private LocationManager locationManager;
    private Location latestLocation;
    private boolean pageReady = false;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);
        webView.setBackgroundColor(0xFF061522);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = true;
                pushLatestLocation();
            }
        });

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.clearCache(true);
        webView.addJavascriptInterface(new CoreBridge(), "CoreBridge");

        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        webView.loadUrl(URL + "&t=" + System.currentTimeMillis());
        ensureLocationAccess();
    }

    private void ensureLocationAccess() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
            return;
        }
        startGps();
    }

    private void startGps() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            Location last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (last != null) latestLocation = last;
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 500L, 0f, this);
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 1000L, 0f, this);
            }
            pushLatestLocation();
        } catch (Exception ignored) { }
    }

    private void stopGps() {
        try { locationManager.removeUpdates(this); } catch (Exception ignored) { }
    }

    @Override protected void onResume() {
        super.onResume();
        if (locationManager != null && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) startGps();
    }

    @Override protected void onPause() {
        stopGps();
        super.onPause();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOCATION && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) startGps();
    }

    @Override public void onLocationChanged(Location location) {
        latestLocation = location;
        pushLocation(location);
    }

    private void pushLatestLocation() {
        if (latestLocation != null) pushLocation(latestLocation);
    }

    private void pushLocation(Location l) {
        if (!pageReady || webView == null || l == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("lat", l.getLatitude());
            o.put("lon", l.getLongitude());
            o.put("accuracy", l.hasAccuracy() ? l.getAccuracy() : JSONObject.NULL);
            o.put("speedKts", l.hasSpeed() ? l.getSpeed() * 1.9438444924406 : 0.0);
            o.put("bearing", l.hasBearing() ? l.getBearing() : 0.0);
            o.put("altitude", l.hasAltitude() ? l.getAltitude() : JSONObject.NULL);
            o.put("time", l.getTime());
            final String js = "window.BoatStation&&window.BoatStation.updateGPS(" + o.toString() + ");";
            runOnUiThread(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) { }
    }

    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) { }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }

    public class CoreBridge {
        @JavascriptInterface public String getMode() { return "station"; }
        @JavascriptInterface public String getCoreVersion() { return VERSION; }
        @JavascriptInterface public String getCapabilities() { return "{\"gps\":true}"; }
        @JavascriptInterface public void restartGps() { runOnUiThread(() -> { stopGps(); startGps(); }); }
    }
}
