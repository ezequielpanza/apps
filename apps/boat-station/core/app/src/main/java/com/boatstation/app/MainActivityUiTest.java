package com.boatstation.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Temporary diagnostic shell: no hardware, permissions or legacy initialization. */
public class MainActivityUiTest extends Activity {
    private static final String VERSION = "1.1.3-test";
    private static final String URL = "https://boat-station.pages.dev/ui-test.html?mode=station";

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = new WebView(this);
        setContentView(webView);
        webView.setBackgroundColor(0xFF061522);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient());
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.clearCache(true);
        webView.addJavascriptInterface(new TestCoreBridge(), "CoreBridge");
        webView.loadUrl(URL + "&t=" + System.currentTimeMillis());
    }

    public static class TestCoreBridge {
        @JavascriptInterface public String getMode() { return "station"; }
        @JavascriptInterface public String getCoreVersion() { return VERSION; }
        @JavascriptInterface public String getCapabilities() { return "{}"; }
    }
}
