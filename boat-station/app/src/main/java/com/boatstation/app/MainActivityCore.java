package com.boatstation.app;

import android.app.Activity;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.ViewGroup;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Locale;

/**
 * Boat Station Core 1.x
 *
 * Stable native container. Native hardware/data bridges remain in the parent
 * activities while the user interface is loaded from Boat Station Web on
 * Cloudflare. If the network copy cannot be loaded, Core falls back to the
 * bundled UI so the Station remains usable offline.
 */
public class MainActivityCore extends MainActivityV200 {
    private static final String WEB_URL = "https://boat-station-remote.pages.dev/?mode=station";
    private static final String LOCAL_URL = "file:///android_asset/index_v100.html";

    private WebView coreWebView;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private boolean fallingBack = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        coreWebView = findWebView(getWindow().getDecorView());
        if (coreWebView == null) return;

        initTts();
        coreWebView.addJavascriptInterface(new CoreBridge(), "CoreBridge");
        coreWebView.getSettings().setDomStorageEnabled(true);
        coreWebView.getSettings().setJavaScriptEnabled(true);

        coreWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                fallingBack = url != null && url.startsWith("file:///android_asset/");
                if (fallingBack) {
                    injectAsset(view, "patch_v101.js");
                    injectAsset(view, "patch_v200.js");
                }
                String mode = fallingBack ? "bundled" : "cloud";
                view.evaluateJavascript(
                    "window.BoatStationCore={mode:'" + mode + "',coreVersion:'1.0.0'};" +
                    "window.dispatchEvent(new CustomEvent('boatstation-core-ready',{detail:window.BoatStationCore}));",
                    null
                );
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame() && !fallingBack) {
                    fallingBack = true;
                    view.loadUrl(LOCAL_URL);
                }
            }
        });

        // The Cloudflare PWA is the normal UI. The bundled UI is only the
        // guaranteed offline/bootstrap fallback.
        coreWebView.loadUrl(WEB_URL);
    }

    private void initTts() {
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int result = tts.setLanguage(new Locale("es", "AR"));
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts.setLanguage(Locale.getDefault());
                }
                ttsReady = true;
            }
        });
    }

    private void injectAsset(WebView view, String file) {
        try {
            BufferedReader br = new BufferedReader(new InputStreamReader(getAssets().open(file)));
            StringBuilder js = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) js.append(line).append('\n');
            br.close();
            view.evaluateJavascript(js.toString(), null);
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

    public class CoreBridge {
        @JavascriptInterface
        public String getCoreVersion() {
            return "1.0.0";
        }

        @JavascriptInterface
        public String getMode() {
            return "station";
        }

        @JavascriptInterface
        public String getCapabilities() {
            try {
                JSONObject o = new JSONObject();
                o.put("location", true);
                o.put("bluetooth", true);
                o.put("camera", true);
                o.put("microphone", true);
                o.put("notifications", true);
                o.put("wifi", true);
                o.put("usb", true);
                o.put("nfc", true);
                o.put("tts", true);
                o.put("backup", true);
                o.put("webUpdate", true);
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public boolean isTtsReady() {
            return ttsReady;
        }

        @JavascriptInterface
        public void speak(final String text) {
            runOnUiThread(() -> {
                if (tts != null && ttsReady && text != null && !text.trim().isEmpty()) {
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "boat-station-alarm");
                }
            });
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> { if (tts != null) tts.stop(); });
        }

        @JavascriptInterface
        public void reloadWeb() {
            runOnUiThread(() -> {
                fallingBack = false;
                if (coreWebView != null) coreWebView.loadUrl(WEB_URL + "&t=" + System.currentTimeMillis());
            });
        }

        @JavascriptInterface
        public void useBundledWeb() {
            runOnUiThread(() -> {
                fallingBack = true;
                if (coreWebView != null) coreWebView.loadUrl(LOCAL_URL);
            });
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }
}
