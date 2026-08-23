package com.boatstation.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.List;

/** Dedicated BLE discovery bridge. Each scan uses a fresh callback/session. */
public final class BatteryScannerBridge {
    private final BoatStationActivity activity;
    private final WebView webView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private ScanCallback activeCallback;
    private int generation = 0;

    BatteryScannerBridge(BoatStationActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        refreshScanner();
    }

    private boolean hasPermissions() {
        if (Build.VERSION.SDK_INT < 31) {
            return activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        }
        return activity.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
                activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private void refreshScanner() {
        BluetoothManager manager = (BluetoothManager) activity.getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager != null ? manager.getAdapter() : null;
        scanner = adapter != null ? adapter.getBluetoothLeScanner() : null;
    }

    private void eval(String js) {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void status(String state, String message) {
        try {
            JSONObject o = new JSONObject();
            o.put("state", state);
            o.put("message", message == null ? "" : message);
            eval("window.BoatStation&&BoatStation.onBleScanStatus&&BoatStation.onBleScanStatus(" + o + ")");
        } catch (Exception ignored) { }
    }

    private void emit(ScanResult result) {
        if (result == null) return;
        try {
            BluetoothDevice device = result.getDevice();
            String name = result.getScanRecord() != null ? result.getScanRecord().getDeviceName() : null;
            if ((name == null || name.isEmpty()) && (Build.VERSION.SDK_INT < 31 ||
                    activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED)) {
                name = device.getName();
            }
            JSONObject o = new JSONObject();
            o.put("name", name == null ? "" : name);
            o.put("address", device.getAddress());
            o.put("rssi", result.getRssi());
            eval("window.BoatStation&&BoatStation.onBleScanResult&&BoatStation.onBleScanResult(" + o + ")");
        } catch (Exception ignored) { }
    }

    private void stopInternal() {
        generation++;
        ScanCallback callback = activeCallback;
        activeCallback = null;
        if (callback != null && scanner != null && hasPermissions()) {
            try { scanner.stopScan(callback); } catch (Exception ignored) { }
        }
    }

    @JavascriptInterface
    public void startBatteryScan() {
        activity.runOnUiThread(() -> {
            stopInternal();
            refreshScanner();
            if (!hasPermissions()) {
                status("permission", "Falta permiso de Bluetooth");
                return;
            }
            if (adapter == null || !adapter.isEnabled()) {
                status("bluetooth_off", "Bluetooth está apagado");
                return;
            }
            if (scanner == null) {
                status("unavailable", "Scanner Bluetooth no disponible");
                return;
            }
            final int mine = ++generation;
            ScanCallback callback = new ScanCallback() {
                @Override public void onScanResult(int callbackType, ScanResult result) { if (mine == generation) emit(result); }
                @Override public void onBatchScanResults(List<ScanResult> results) {
                    if (mine != generation || results == null) return;
                    for (ScanResult result : results) emit(result);
                }
                @Override public void onScanFailed(int errorCode) {
                    if (mine != generation) return;
                    activeCallback = null;
                    status("error", "Error de escaneo Bluetooth " + errorCode);
                }
            };
            activeCallback = callback;
            try {
                ScanSettings settings = new ScanSettings.Builder()
                        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                        .setReportDelay(0)
                        .build();
                scanner.startScan(null, settings, callback);
                status("scanning", "Escaneando dispositivos Bluetooth…");
                handler.postDelayed(() -> {
                    if (mine != generation || activeCallback != callback) return;
                    stopInternal();
                    status("finished", "Escaneo finalizado");
                }, 15000);
            } catch (Exception e) {
                activeCallback = null;
                status("error", "No se pudo iniciar el escaneo Bluetooth");
            }
        });
    }

    @JavascriptInterface
    public void stopBatteryScan() {
        activity.runOnUiThread(() -> {
            stopInternal();
            status("stopped", "Escaneo detenido");
        });
    }
}
