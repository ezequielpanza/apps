package com.boatstation.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

/**
 * Production launcher. UI remains in MainActivityCore while persistent native capabilities migrate
 * incrementally to BoatStationCoreService.
 */
public class BoatStationActivity extends MainActivityCore {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startCoreService();
    }

    private void startCoreService() {
        Intent intent = new Intent(this, BoatStationCoreService.class);
        intent.setAction(BoatStationCoreService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
        else startService(intent);
    }
}
