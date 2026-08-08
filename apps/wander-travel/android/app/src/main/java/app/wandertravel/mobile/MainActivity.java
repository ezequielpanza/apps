package app.wandertravel.mobile;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WanderLocationPlugin.class);
        registerPlugin(WanderDirectionPlugin.class);
        registerPlugin(WanderNotificationPlugin.class);
        registerPlugin(WanderOfflineTilePlugin.class);
        registerPlugin(WanderCloudIdentityPlugin.class);
        registerPlugin(WanderTTSPlugin.class);
        super.onCreate(savedInstanceState);
        WanderNotificationPlugin.captureOpenIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        redrawWebViewAfterResume();
    }

    private void redrawWebViewAfterResume() {
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.post(() -> {
            webView.onResume();
            webView.requestLayout();
            webView.postInvalidateOnAnimation();
        });
        webView.postDelayed(() -> {
            webView.requestLayout();
            webView.postInvalidateOnAnimation();
        }, 120);
        webView.postDelayed(webView::postInvalidateOnAnimation, 450);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        WanderNotificationPlugin.captureOpenIntent(intent);
    }
}
