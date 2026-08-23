package com.boatstation.app;

import android.app.DownloadManager;
import android.bluetooth.BluetoothGatt;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import java.lang.reflect.Field;
import java.util.Map;

/**
 * Production launcher. UI remains in MainActivityCore while persistent native capabilities migrate
 * incrementally to BoatStationCoreService.
 */
public class BoatStationActivity extends MainActivityCore {
    private BatteryCycleBridge batteryCycleBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startCoreService();
        WebView webView = findWebView(getWindow().getDecorView());
        if (webView != null) {
            webView.addJavascriptInterface(new CoreRuntimeBridge(), "CoreRuntimeBridge");
            webView.addJavascriptInterface(new BatteryScannerBridge(this, webView), "BatteryScannerBridge");
            batteryCycleBridge = new BatteryCycleBridge(this, webView);
            webView.addJavascriptInterface(batteryCycleBridge, "BatteryCycleBridge");
        }
        // MainActivity still contains the pre-1.2.8 permanent-GATT runtime. Disable it after
        // inherited startup has completed; BatteryCycleBridge is the sole battery runtime now.
        getWindow().getDecorView().postDelayed(this::quiesceLegacyBatteryRuntime, 1600);
        getWindow().getDecorView().postDelayed(() -> { if (batteryCycleBridge != null) batteryCycleBridge.start(); }, 1750);
    }

    @Override
    protected void onResume() {
        super.onResume();
        getWindow().getDecorView().postDelayed(() -> {
            quiesceLegacyBatteryRuntime();
            if (batteryCycleBridge != null) batteryCycleBridge.start();
        }, 1200);
    }

    @Override
    protected void onPause() {
        if (batteryCycleBridge != null) batteryCycleBridge.stop();
        super.onPause();
    }

    private Field findField(String name) {
        Class<?> c = getClass();
        while (c != null) {
            try { Field f = c.getDeclaredField(name); f.setAccessible(true); return f; }
            catch (Exception ignored) { c = c.getSuperclass(); }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private void quiesceLegacyBatteryRuntime() {
        try {
            Field handlerField = findField("handler");
            Field tickerField = findField("statusTicker");
            if (handlerField != null && tickerField != null) {
                Handler h = (Handler) handlerField.get(this);
                Runnable ticker = (Runnable) tickerField.get(this);
                if (h != null && ticker != null) h.removeCallbacks(ticker);
            }
            Field gattsField = findField("batteryGatts");
            if (gattsField != null) {
                Map<Integer, BluetoothGatt> gatts = (Map<Integer, BluetoothGatt>) gattsField.get(this);
                if (gatts != null) {
                    for (BluetoothGatt g : gatts.values()) {
                        try { g.disconnect(); } catch (Exception ignored) { }
                        try { g.close(); } catch (Exception ignored) { }
                    }
                    gatts.clear();
                }
            }
            for (String fieldName : new String[]{"batteryVerified","humDetected","rxBuffers"}) {
                Field f=findField(fieldName);
                if(f!=null){Object value=f.get(this);if(value instanceof Map)((Map<?,?>)value).clear();}
            }
        } catch (Exception ignored) { }
    }

    private void startCoreService() {
        startCoreServiceIntent(new Intent(this, BoatStationCoreService.class)
                .setAction(BoatStationCoreService.ACTION_START));
    }

    private void startCoreServiceIntent(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
        else startService(intent);
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

    public final class CoreRuntimeBridge {
        @JavascriptInterface
        public void configureRemoteStation(String stationId, String token, String backend, String stationName) {
            Intent intent = new Intent(BoatStationActivity.this, BoatStationCoreService.class)
                    .setAction(BoatStationCoreService.ACTION_CONFIGURE_REMOTE)
                    .putExtra(BoatStationCoreService.EXTRA_STATION_ID, stationId)
                    .putExtra(BoatStationCoreService.EXTRA_TOKEN, token)
                    .putExtra(BoatStationCoreService.EXTRA_BACKEND, backend)
                    .putExtra(BoatStationCoreService.EXTRA_STATION_NAME, stationName);
            startCoreServiceIntent(intent);
        }

        @JavascriptInterface
        public boolean downloadApk(String url, String version) {
            if (url == null || url.trim().isEmpty()) return false;
            try {
                String v = version == null || version.trim().isEmpty() ? "update" : version.trim();
                String fileName = "BoatStation-" + v + ".apk";
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle("Boat Station " + v);
                request.setDescription("Descargando actualización");
                request.setMimeType("application/vnd.android.package-archive");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(true);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) return false;
                dm.enqueue(request);
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }
    }
}
