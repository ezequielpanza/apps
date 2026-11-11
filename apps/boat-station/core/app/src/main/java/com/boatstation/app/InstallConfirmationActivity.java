package com.boatstation.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

public final class InstallConfirmationActivity extends Activity {
    public static final String EXTRA_SESSION_ID = "install_confirmation_session_id";
    private static final String PREFS = "boatstation_update";
    private static final String PENDING_CONFIRMATION_URI = "pending_confirmation_uri";

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent confirmation;
        if (Build.VERSION.SDK_INT >= 33) {
            confirmation = getIntent().getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
        } else {
            confirmation = getIntent().getParcelableExtra(Intent.EXTRA_INTENT);
        }
        int sessionId = getIntent().getIntExtra(EXTRA_SESSION_ID, -1);
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(PENDING_CONFIRMATION_URI).apply();
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && sessionId >= 0) manager.cancel(sessionId);
        if (confirmation != null) {
            try {
                startActivity(confirmation);
            } catch (Exception e) {
                Toast.makeText(this, "No se pudo abrir la confirmación de instalación de Android.", Toast.LENGTH_LONG).show();
            }
        }
        finish();
    }
}
