package app.wandertravel.mobile;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WanderLocationPlugin.class);
        registerPlugin(WanderDirectionPlugin.class);
        registerPlugin(WanderNotificationPlugin.class);
        super.onCreate(savedInstanceState);
        WanderNotificationPlugin.captureOpenIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        WanderNotificationPlugin.captureOpenIntent(intent);
    }
}
