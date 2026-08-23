package com.boatstation.app;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/**
 * Production launcher. UI remains in MainActivityCore while persistent native capabilities migrate
 * incrementally to BoatStationCoreService.
 */
public class BoatStationActivity extends MainActivityCore {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startCoreService();
        WebView webView = findWebView(getWindow().getDecorView());
        if (webView != null) webView.addJavascriptInterface(new CoreRuntimeBridge(), "CoreRuntimeBridge");
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
