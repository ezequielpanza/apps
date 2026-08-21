package com.boatstation.app;

import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Locale;

/** Stable native container for Boat Station Web. */
public class MainActivityCore extends MainActivityV200 {
    private static final String WEB_URL = "https://boat-station-web.pages.dev/?mode=station";
    private static final String LOCAL_URL = "file:///android_asset/index_v100.html";
    private static final String PREFS = "boat_station";
    private static final String MIGRATED = "core_web_storage_migrated_v1";
    private static final String LEGACY_STORAGE = "core_legacy_web_storage";

    private WebView coreWebView;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private boolean fallingBack = false;
    private boolean capturingLegacy = false;

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
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u == null) return true;
                String scheme = u.getScheme();
                String host = u.getHost();
                if ("file".equals(scheme)) return false;
                return !("https".equals(scheme) && "boat-station-web.pages.dev".equals(host));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                boolean local = url != null && url.startsWith("file:///android_asset/");
                fallingBack = local;

                if (local) {
                    injectAsset(view, "patch_v101.js");
                    injectAsset(view, "patch_v200.js");
                    if (capturingLegacy) {
                        view.evaluateJavascript(
                            "(function(){var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);o[k]=localStorage.getItem(k)}CoreBridge.saveLegacyStorage(JSON.stringify(o));})()",
                            null
                        );
                        return;
                    }
                } else {
                    restoreLegacyStorageIfNeeded(view);
                }

                announceCore(view, local ? "bundled" : "cloud");
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame() && !fallingBack) {
                    fallingBack = true;
                    capturingLegacy = false;
                    view.loadUrl(LOCAL_URL);
                }
            }
        });

        if (!getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(MIGRATED, false)) {
            capturingLegacy = true;
            coreWebView.loadUrl(LOCAL_URL + "?coreMigration=1");
        } else {
            coreWebView.loadUrl(WEB_URL);
        }
    }

    private void restoreLegacyStorageIfNeeded(WebView view) {
        if (getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(MIGRATED, false)) return;
        String raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString(LEGACY_STORAGE, "");
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(MIGRATED, true).apply();
        if (raw == null || raw.isEmpty()) return;
        String js = "(function(){try{var o=JSON.parse(" + JSONObject.quote(raw) + ");Object.keys(o).forEach(function(k){if(k.indexOf('bs.')===0)localStorage.setItem(k,o[k]);});location.reload();}catch(e){}})()";
        view.evaluateJavascript(js, null);
    }

    private void announceCore(WebView view, String mode) {
        view.evaluateJavascript(
            "window.BoatStationCore={mode:'" + mode + "',coreVersion:'1.0.1'};" +
            "window.dispatchEvent(new CustomEvent('boatstation-core-ready',{detail:window.BoatStationCore}));",
            null
        );
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

    private void toneFallback() {
        try {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_ALARM, 100);
            tone.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 1200);
            new Handler(Looper.getMainLooper()).postDelayed(tone::release, 1500);
        } catch (Exception ignored) { }
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
        @JavascriptInterface public String getCoreVersion() { return "1.0.1"; }
        @JavascriptInterface public String getMode() { return "station"; }

        @JavascriptInterface
        public String getCapabilities() {
            try {
                JSONObject o = new JSONObject();
                o.put("location", true); o.put("bluetooth", true);
                o.put("camera", true); o.put("microphone", true);
                o.put("notifications", true); o.put("wifi", true);
                o.put("usb", true); o.put("nfc", true);
                o.put("tts", true); o.put("backup", true); o.put("webUpdate", true);
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface public boolean isTtsReady() { return ttsReady; }

        @JavascriptInterface
        public void saveLegacyStorage(String json) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(LEGACY_STORAGE, json == null ? "" : json).apply();
            runOnUiThread(() -> {
                capturingLegacy = false;
                fallingBack = false;
                if (coreWebView != null) coreWebView.loadUrl(WEB_URL + "&migration=1");
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
                fallingBack = false;
                capturingLegacy = false;
                if (coreWebView != null) coreWebView.loadUrl(WEB_URL + "&t=" + System.currentTimeMillis());
            });
        }

        @JavascriptInterface
        public void useBundledWeb() {
            runOnUiThread(() -> {
                fallingBack = true;
                capturingLegacy = false;
                if (coreWebView != null) coreWebView.loadUrl(LOCAL_URL);
            });
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }
}
