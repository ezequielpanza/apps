package com.boatstation.app;

import android.content.Context;
import android.os.SystemClock;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class BatteryDiagnosticsLogger {
    private static final String PREFS = "battery_diagnostics";
    private static final String ENABLED = "enabled";
    private static final long SAMPLE_INTERVAL_MS = 10_000L;
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static final Map<String, Long> LAST_SAMPLE_ELAPSED = new ConcurrentHashMap<>();
    private static final Map<String, State> STATES = new ConcurrentHashMap<>();
    private static final Map<String, Boolean> CONNECTIONS = new ConcurrentHashMap<>();

    private BatteryDiagnosticsLogger() {}

    public static boolean isEnabled(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(ENABLED, true);
    }

    public static void setEnabled(Context context, boolean enabled) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(ENABLED, enabled).apply();
    }

    private static JSONObject copy(JSONObject value) {
        try { return value == null ? new JSONObject() : new JSONObject(value.toString()); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    private static final class State {
        double lastSoc = Double.NaN;
        long lastSocTime;
        Boolean charging;
        Boolean nearZero;
        long zeroCandidateSince;
        long fullCandidateSince;
        boolean fullReported;
        String lastFlags = null;
    }

    public static void recordData(Context context, JSONObject config, JSONObject sample, byte[] rawFrame) {
        if (sample == null || !isEnabled(context)) return;
        final Context app = context.getApplicationContext();
        final JSONObject cfg = copy(config), data = copy(sample);
        final String key = BatteryDiagnosticsStore.batteryKey(cfg);
        final long nowWall = data.optLong("time", System.currentTimeMillis());
        final long nowElapsed = SystemClock.elapsedRealtime();
        final List<String[]> events = new ArrayList<>();
        final State state = STATES.computeIfAbsent(key, k -> new State());

        synchronized (state) {
            double current = data.optDouble("current", Double.NaN);
            double soc = data.optDouble("soc", Double.NaN);
            if (Double.isFinite(current)) {
                boolean isCharging = current >= 0.8;
                if (state.charging == null) state.charging = isCharging;
                else if (isCharging != state.charging) {
                    events.add(new String[]{isCharging ? "CHARGE_STARTED" : "CHARGE_FINISHED",
                            String.format(Locale.US, "Corriente %.2f A", current)});
                    state.charging = isCharging;
                }

                boolean zero = Math.abs(current) <= 0.5;
                if (state.nearZero == null) {
                    if (zero) {
                        if (state.zeroCandidateSince == 0) state.zeroCandidateSince = nowWall;
                        if (nowWall - state.zeroCandidateSince >= 30_000L) {
                            state.nearZero = true;
                            events.add(new String[]{"CURRENT_NEAR_ZERO", "Corriente estable dentro de ±0.5 A por 30 s"});
                        }
                    } else {
                        state.zeroCandidateSince = 0;
                        state.nearZero = false;
                    }
                } else if (!state.nearZero && zero) {
                    if (state.zeroCandidateSince == 0) state.zeroCandidateSince = nowWall;
                    if (nowWall - state.zeroCandidateSince >= 30_000L) {
                        state.nearZero = true;
                        events.add(new String[]{"CURRENT_NEAR_ZERO", "Corriente estable dentro de ±0.5 A por 30 s"});
                    }
                } else if (state.nearZero && Math.abs(current) >= 0.8) {
                    state.nearZero = false;
                    state.zeroCandidateSince = 0;
                    events.add(new String[]{"CURRENT_LEFT_ZERO", String.format(Locale.US, "Corriente %.2f A", current)});
                } else if (!zero) state.zeroCandidateSince = 0;

                if (Double.isFinite(soc)) {
                    if (Double.isFinite(state.lastSoc) && nowWall > state.lastSocTime && nowWall - state.lastSocTime <= 60_000L && Math.abs(soc - state.lastSoc) >= 3.0) {
                        events.add(new String[]{"SOC_JUMP", String.format(Locale.US, "SOC %.1f%% → %.1f%% en %d s", state.lastSoc, soc, Math.max(1, (nowWall-state.lastSocTime)/1000L))});
                    }
                    state.lastSoc = soc;
                    state.lastSocTime = nowWall;
                    if (soc >= 99.0 && Math.abs(current) <= 0.5) {
                        if (state.fullCandidateSince == 0) state.fullCandidateSince = nowWall;
                        if (!state.fullReported && nowWall - state.fullCandidateSince >= 60_000L) {
                            events.add(new String[]{"FULL_CHARGE_INFERRED", "Inferida: SOC ≥99% y corriente ≤0.5 A por 60 s; el protocolo leído no expone confirmación explícita"});
                            state.fullReported = true;
                        }
                    } else {
                        state.fullCandidateSince = 0;
                        if (soc < 97.0 || Math.abs(current) > 1.0) state.fullReported = false;
                    }
                }
            }

            String flags = flagsValue(data, "alarms") + "|" + flagsValue(data, "protections");
            if (!"null|null".equals(flags)) {
                if (state.lastFlags != null && !state.lastFlags.equals(flags)) {
                    events.add(new String[]{"BMS_FLAGS_CHANGED", flags});
                }
                state.lastFlags = flags;
            }
        }

        for (String[] event : events) enqueueEvent(app, cfg, nowWall, event[0], event[1]);

        Long previous = LAST_SAMPLE_ELAPSED.get(key);
        if (previous == null || nowElapsed - previous >= SAMPLE_INTERVAL_MS || nowElapsed < previous) {
            LAST_SAMPLE_ELAPSED.put(key, nowElapsed);
            final long elapsed = nowElapsed;
            final String rawHex = toHex(rawFrame);
            enqueue(() -> BatteryDiagnosticsStore.get(app).addSample(cfg, data, rawHex, elapsed));
        }
    }

    private static String flagsValue(JSONObject data, String key) {
        return data.has(key) && !data.isNull(key) ? data.opt(key).toString() : "null";
    }

    public static void recordConnection(Context context, JSONObject config, boolean connected) {
        if (config == null || !isEnabled(context)) return;
        String key = BatteryDiagnosticsStore.batteryKey(config);
        Boolean previous = CONNECTIONS.put(key, connected);
        if (previous == null && connected) enqueueEvent(context.getApplicationContext(), copy(config), System.currentTimeMillis(), "BMS_CONNECTED", "Conexión BLE establecida");
        else if (Boolean.FALSE.equals(previous) && connected) enqueueEvent(context.getApplicationContext(), copy(config), System.currentTimeMillis(), "BMS_RECONNECTED", "BMS reconectado por Bluetooth");
        else if (Boolean.TRUE.equals(previous) && !connected) enqueueEvent(context.getApplicationContext(), copy(config), System.currentTimeMillis(), "BMS_DISCONNECTED", "Conexión BLE interrumpida");
    }

    private static void enqueueEvent(Context context, JSONObject config, long time, String type, String details) {
        JSONObject cfg = copy(config);
        enqueue(() -> BatteryDiagnosticsStore.get(context).addEvent(cfg, time, type, details));
    }

    private static void enqueue(Runnable action) {
        try { IO.execute(action); } catch (Exception ignored) {}
    }

    private static String toHex(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return "";
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format(Locale.US, "%02X", b & 255));
        return out.toString();
    }
}