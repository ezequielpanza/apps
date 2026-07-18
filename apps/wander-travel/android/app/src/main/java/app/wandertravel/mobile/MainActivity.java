package app.wandertravel.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WanderLocationPlugin.class);
        registerPlugin(WanderNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
