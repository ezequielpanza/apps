package com.boatstation.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Stable native shell: Android/hardware access only. Boat Station itself lives in the PWA. */
public class MainActivityCore extends MainActivityV100 {
    private static final String CORE_VERSION = "1.1.1";
    private static final String WEB_URL = "https://boat-station.pages.dev/?mode=station";
    private static final int REQ_EXPORT_GPX = 3101;
    private static final int REQ_IMPORT_GPX = 3102;
    private static final long SENSOR_PUSH_MS = 80; // ~12.5 Hz, fast enough for a fluid compass without flooding WebView

    private WebView coreWebView;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private String pendingGpx = "";

    // Core-owned sensor path. We intentionally replace the legacy inherited
    // accelerometer+magnetometer stream so the WebView is not flooded with JS calls.
    private SensorManager coreSensorManager;
    private Sensor coreRotationSensor;
    private Sensor coreAccelSensor;
    private long lastSensorPush = 0;
    private float latestHeading = 0f;
    private double latestMotion = 0d;
    private boolean haveHeading = false;
    private boolean haveMotion = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        coreWebView = findWebView(getWindow().getDecorView());
        if (coreWebView == null) return;

        // Parent classes still provide native bridges. Stop their legacy local UI immediately.
        coreWebView.stopLoading();
        initTts();
        coreWebView.addJavascriptInterface(new CoreBridge(), "CoreBridge");
        coreWebView.addJavascriptInterface(new NativeToolsBridge(), "NativeToolsBridge");
        coreWebView.getSettings().setJavaScriptEnabled(true);
        coreWebView.getSettings().setDomStorageEnabled(true);
        coreWebView.getSettings().setAllowFileAccess(true);
        coreWebView.getSettings().setAllowContentAccess(true);
        // The PWA/service worker owns offline caching. Never prefer a stale native
        // WebView cache entry over the network, or HTML/JS/CSS releases can diverge.
        coreWebView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);

        coreSensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (coreSensorManager != null) {
            coreRotationSensor = coreSensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            coreAccelSensor = coreSensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        }

        coreWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                announceCore(view);
                pushSensorFrame(true);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) showOfflineShell(view);
            }
        });
        coreWebView.loadUrl(WEB_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (coreSensorManager != null) {
            // Remove the inherited MainActivity registrations first. They generated
            // multiple evaluateJavascript calls per sensor event and could backlog the UI.
            coreSensorManager.unregisterListener(this);
            if (coreRotationSensor != null)
                coreSensorManager.registerListener(this, coreRotationSensor, SensorManager.SENSOR_DELAY_GAME);
            if (coreAccelSensor != null)
                coreSensorManager.registerListener(this, coreAccelSensor, SensorManager.SENSOR_DELAY_GAME);
        }
        lastSensorPush = 0;
    }

    @Override
    protected void onPause() {
        if (coreSensorManager != null) coreSensorManager.unregisterListener(this);
        super.onPause();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event == null || event.sensor == null) return;
        int type = event.sensor.getType();
        if (type == Sensor.TYPE_ROTATION_VECTOR) {
            float[] r = new float[9];
            float[] o = new float[3];
            try {
                SensorManager.getRotationMatrixFromVector(r, event.values);
                SensorManager.getOrientation(r, o);
                float h = (float) Math.toDegrees(o[0]);
                if (h < 0) h += 360f;
                latestHeading = h;
                haveHeading = true;
            } catch (Exception ignored) { }
        } else if (type == Sensor.TYPE_ACCELEROMETER) {
            double m = Math.sqrt(
                event.values[0] * event.values[0] +
                event.values[1] * event.values[1] +
                event.values[2] * event.values[2]);
            latestMotion = Math.abs(m - SensorManager.GRAVITY_EARTH);
            haveMotion = true;
        }
        pushSensorFrame(false);
    }

    private void pushSensorFrame(boolean force) {
        if (coreWebView == null) return;
        long now = SystemClock.elapsedRealtime();
        if (!force && now - lastSensorPush < SENSOR_PUSH_MS) return;
        if (!haveHeading && !haveMotion) return;
        lastSensorPush = now;
        String heading = haveHeading ? String.format(Locale.US, "%.1f", latestHeading) : "null";
        String motion = haveMotion ? String.format(Locale.US, "%.3f", latestMotion) : "null";
        String js = "(function(){var b=window.BoatStation;if(!b)return;" +
            "if(" + heading + "!==null&&b.updateCompass)b.updateCompass(" + heading + ");" +
            "if(" + motion + "!==null&&b.updateMotion)b.updateMotion(" + motion + ");" +
            "window.__bsLastNativeSensor=Date.now();})();";
        coreWebView.post(() -> coreWebView.evaluateJavascript(js, null));
    }

    private void announceCore(WebView view) {
        view.evaluateJavascript(
            "window.BoatStationCore={mode:'station',coreVersion:'" + CORE_VERSION + "'};" +
            "window.dispatchEvent(new CustomEvent('boatstation-core-ready',{detail:window.BoatStationCore}));", null);
    }

    private void showOfflineShell(WebView view) {
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<style>body{margin:0;background:#061522;color:#f4f8fb;font-family:system-ui;display:grid;place-items:center;min-height:100vh}.c{max-width:360px;text-align:center;padding:24px}.b{border:1px solid #24516a;background:#102f45;color:white;border-radius:12px;padding:12px 18px;font-size:16px}</style></head>" +
            "<body><div class='c'><h2>Boat Station</h2><p>No se pudo cargar Boat Station ni una copia en caché.</p><button class='b' onclick=\"CoreBridge.reloadWeb()\">Reintentar</button></div></body></html>";
        view.loadDataWithBaseURL("https://boat-station.pages.dev/", html, "text/html", "UTF-8", null);
    }

    private void initTts() {
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int result = tts.setLanguage(new Locale("es", "AR"));
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED)
                    tts.setLanguage(Locale.getDefault());
                ttsReady = true;
            }
        });
    }

    private void toneFallback() {
        try {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_ALARM, 100);
            tone.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 1200);
            new Handler(Looper.getMainLooper()).postDelayed(tone::release, 1500);
        } catch (Exception ignored) { }
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

    private byte[] readBytes(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] b = new byte[16384];
        int n;
        while ((n = in.read(b)) > 0) out.write(b, 0, n);
        return out.toByteArray();
    }

    private void chooseGpxExport() {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.setType("application/gpx+xml");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.putExtra(Intent.EXTRA_TITLE, "BoatStation-route.gpx");
        startActivityForResult(i, REQ_EXPORT_GPX);
    }

    private void chooseGpxImport() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.setType("*/*");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(i, REQ_IMPORT_GPX);
    }

    private boolean write(Uri uri, String text) {
        try (OutputStream o = getContentResolver().openOutputStream(uri, "wt")) {
            if (o == null) return false;
            o.write((text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
            o.flush();
            return true;
        } catch (Exception e) { return false; }
    }

    private String read(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            return in == null ? "" : new String(readBytes(in), StandardCharsets.UTF_8);
        } catch (Exception e) { return ""; }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (requestCode == REQ_EXPORT_GPX) {
            boolean ok = write(uri, pendingGpx);
            pendingGpx = "";
            if (coreWebView != null) coreWebView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('boatstation-gpx-exported',{detail:{ok:" + ok + "}}));", null);
        } else if (requestCode == REQ_IMPORT_GPX) {
            String raw = read(uri);
            if (coreWebView != null) coreWebView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('boatstation-gpx-imported',{detail:{gpx:" + JSONObject.quote(raw) + "}}));", null);
        }
    }

    public class CoreBridge {
        @JavascriptInterface public String getCoreVersion() { return CORE_VERSION; }
        @JavascriptInterface public String getMode() { return "station"; }

        @JavascriptInterface
        public String getCapabilities() {
            try {
                JSONObject o = new JSONObject();
                o.put("location", true); o.put("bluetooth", true); o.put("sensors", true);
                o.put("storage", true); o.put("camera", true); o.put("microphone", true);
                o.put("notifications", true); o.put("wifi", true); o.put("usb", true);
                o.put("nfc", true); o.put("tts", true); o.put("wakeLock", true);
                o.put("background", true); o.put("qr", true); o.put("gpx", true);
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface public boolean isTtsReady() { return ttsReady; }

        @JavascriptInterface
        public void restartSensors() {
            runOnUiThread(() -> {
                if (coreSensorManager == null) return;
                coreSensorManager.unregisterListener(MainActivityCore.this);
                if (coreRotationSensor != null)
                    coreSensorManager.registerListener(MainActivityCore.this, coreRotationSensor, SensorManager.SENSOR_DELAY_GAME);
                if (coreAccelSensor != null)
                    coreSensorManager.registerListener(MainActivityCore.this, coreAccelSensor, SensorManager.SENSOR_DELAY_GAME);
                lastSensorPush = 0;
                pushSensorFrame(true);
            });
        }

        @JavascriptInterface
        public void speak(final String text) {
            runOnUiThread(() -> {
                if (tts != null && ttsReady && text != null && !text.trim().isEmpty())
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "boat-station-tts");
            });
        }

        @JavascriptInterface
        public void alarm(final String text) {
            runOnUiThread(() -> {
                if (tts != null && ttsReady && text != null && !text.trim().isEmpty())
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "boat-station-alarm");
                else toneFallback();
            });
        }

        @JavascriptInterface public void stopSpeaking() { runOnUiThread(() -> { if (tts != null) tts.stop(); }); }

        @JavascriptInterface
        public void reloadWeb() {
            runOnUiThread(() -> {
                if (coreWebView != null) {
                    coreWebView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
                    coreWebView.loadUrl(WEB_URL + "&t=" + System.currentTimeMillis());
                }
            });
        }
    }

    public class NativeToolsBridge {
        @JavascriptInterface
        public String qrDataUrl(String payload) {
            try {
                BitMatrix m = new MultiFormatWriter().encode(payload, BarcodeFormat.QR_CODE, 640, 640);
                Bitmap bmp = Bitmap.createBitmap(640, 640, Bitmap.Config.ARGB_8888);
                for (int y = 0; y < 640; y++) for (int x = 0; x < 640; x++)
                    bmp.setPixel(x, y, m.get(x, y) ? 0xFF000000 : 0xFFFFFFFF);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
                return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public void exportGpx(String gpx) {
            pendingGpx = gpx == null ? "" : gpx;
            runOnUiThread(MainActivityCore.this::chooseGpxExport);
        }

        @JavascriptInterface public void importGpx() { runOnUiThread(MainActivityCore.this::chooseGpxImport); }
    }

    @Override
    protected void onDestroy() {
        if (coreSensorManager != null) coreSensorManager.unregisterListener(this);
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }
}
