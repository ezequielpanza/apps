package com.boatstation.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public class MainActivityV13 extends MainActivity {
    private static final int REQ_FOLDER = 1013;
    private static final String PREFS = "boat_station";
    private static final String DATA_FOLDER = "data_folder_uri";
    private WebView v13WebView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        v13WebView = findWebView(findViewById(android.R.id.content));
        if (v13WebView != null) {
            v13WebView.addJavascriptInterface(new StorageBridge(), "StorageBridge");
            v13WebView.loadUrl("file:///android_asset/index_v13.html");
        }
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

    private void chooseDataFolderNative() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(i, REQ_FOLDER);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FOLDER && resultCode == RESULT_OK && data != null && data.getData() != null) {
            Uri uri = data.getData();
            int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try { getContentResolver().takePersistableUriPermission(uri, flags); } catch (Exception ignored) {}
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(DATA_FOLDER, uri.toString()).apply();
            if (v13WebView != null) {
                final String js = "window.BoatStation&&BoatStation.onDataFolderChanged(" + org.json.JSONObject.quote(uri.toString()) + ")";
                v13WebView.post(() -> v13WebView.evaluateJavascript(js, null));
            }
        }
    }

    public class StorageBridge {
        @JavascriptInterface public void chooseDataFolder() { runOnUiThread(MainActivityV13.this::chooseDataFolderNative); }
        @JavascriptInterface public String getDataFolder() { return getSharedPreferences(PREFS, MODE_PRIVATE).getString(DATA_FOLDER, ""); }
    }
}
