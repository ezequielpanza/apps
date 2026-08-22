package com.boatstation.app;

import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

/**
 * Production Boat Station native shell.
 *
 * Native responsibilities are limited to Android/hardware access. Application logic and UI
 * live in the PWA. The inherited core provides GPS, motion/orientation sensors, BLE/GATT,
 * selected-folder storage, GPX/file pickers and native utilities.
 */
public class BoatStationActivity extends MainActivityCore {
    private static final String VERSION = "1.2.0";
    private static final String URL = "https://boat-station.pages.dev/clean/?mode=station";

    private WebView stationWebView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        stationWebView = findWebView(getWindow().getDecorView());
        if (stationWebView == null) return;

        stationWebView.stopLoading();
        stationWebView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        stationWebView.addJavascriptInterface(new ProductionBridge(), "BoatStationCoreNative");
        // Override the legacy informational CoreBridge name with the production version.
        stationWebView.addJavascriptInterface(new ProductionBridge(), "CoreBridgeInfo");
        stationWebView.loadUrl(URL + "&t=" + System.currentTimeMillis());
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private String phonePowerStatus() {
        try {
            Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            JSONObject o = new JSONObject();
            if (b == null) return o.toString();
            int raw = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            int status = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            int plugged = b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
            int temperature = b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
            int voltageMv = b.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1);
            o.put("level", scale > 0 ? Math.round(raw * 100f / scale) : raw);
            o.put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
            o.put("plugged", plugged);
            o.put("temperatureC", temperature == Integer.MIN_VALUE ? JSONObject.NULL : temperature / 10.0);
            o.put("voltageV", voltageMv > 0 ? voltageMv / 1000.0 : JSONObject.NULL);
            o.put("manufacturer", Build.MANUFACTURER);
            o.put("model", Build.MODEL);
            o.put("android", Build.VERSION.RELEASE);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    public class ProductionBridge {
        @JavascriptInterface public String getCoreVersion() { return VERSION; }
        @JavascriptInterface public String getMode() { return "station"; }

        @JavascriptInterface
        public String getCapabilities() {
            try {
                JSONObject o = new JSONObject();
                o.put("gps", true);
                o.put("accelerometer", true);
                o.put("orientation", true);
                o.put("compass", true);
                o.put("bluetooth", true);
                o.put("ble", true);
                o.put("battery", true);
                o.put("temperature", true);
                o.put("selectedFolders", true);
                o.put("storage", true);
                o.put("network", true);
                o.put("gpx", true);
                o.put("tts", true);
                o.put("qr", true);
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface public String getPhonePowerStatus() { return phonePowerStatus(); }

        @JavascriptInterface
        public void reloadWeb() {
            runOnUiThread(() -> {
                if (stationWebView != null)
                    stationWebView.loadUrl(URL + "&t=" + System.currentTimeMillis());
            });
        }
    }
}
