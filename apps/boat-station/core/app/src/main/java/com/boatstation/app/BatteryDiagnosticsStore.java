package com.boatstation.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.os.SystemClock;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

public final class BatteryDiagnosticsStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "boat_station_battery_diagnostics.db";
    private static final int DB_VERSION = 1;
    private static final long RETENTION_MS = 90L * 24L * 60L * 60L * 1000L;
    private static volatile BatteryDiagnosticsStore instance;

    public static BatteryDiagnosticsStore get(Context context) {
        if (instance == null) synchronized (BatteryDiagnosticsStore.class) {
            if (instance == null) instance = new BatteryDiagnosticsStore(context.getApplicationContext());
        }
        return instance;
    }

    private BatteryDiagnosticsStore(Context context) { super(context, DB_NAME, null, DB_VERSION); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE samples (_id INTEGER PRIMARY KEY AUTOINCREMENT, battery_id TEXT NOT NULL, battery_name TEXT, bms_type TEXT, time_ms INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL, voltage_v REAL, current_a REAL, soc_pct REAL, cell1_v REAL, cell2_v REAL, cell3_v REAL, cell4_v REAL, temp_battery_c REAL, temp_sensors_json TEXT, charge_allowed INTEGER, discharge_allowed INTEGER, alarms_json TEXT, protections_json TEXT, remaining_ah REAL, capacity_ah REAL, connected INTEGER, raw_frame_hex TEXT)");
        db.execSQL("CREATE INDEX samples_by_battery_time ON samples(battery_id,time_ms)");
        db.execSQL("CREATE INDEX samples_by_time ON samples(time_ms)");
        db.execSQL("CREATE TABLE events (_id INTEGER PRIMARY KEY AUTOINCREMENT, battery_id TEXT NOT NULL, battery_name TEXT, time_ms INTEGER NOT NULL, event_type TEXT NOT NULL, details TEXT)");
        db.execSQL("CREATE INDEX events_by_battery_time ON events(battery_id,time_ms)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    public static String batteryKey(JSONObject config) {
        String address = config == null ? "" : config.optString("address", "").trim();
        if (address.isEmpty() && config != null) address = config.optString("mac", "").trim();
        if (!address.isEmpty()) return address.toUpperCase(Locale.US);
        String id = config == null ? "" : config.optString("id", "").trim();
        return id.isEmpty() ? "bms-unknown" : "bms-" + id;
    }

    private static String batteryName(JSONObject config) {
        if (config == null) return "";
        String name = config.optString("name", "").trim();
        if (name.isEmpty()) name = config.optString("deviceName", "").trim();
        return name;
    }

    private static void putNumber(ContentValues values, String column, JSONObject json, String key) {
        if (json != null && json.has(key) && !json.isNull(key)) {
            double value = json.optDouble(key, Double.NaN);
            if (Double.isFinite(value)) { values.put(column, value); return; }
        }
        values.putNull(column);
    }

    private static void putBoolean(ContentValues values, String column, JSONObject json, String key) {
        if (json != null && json.has(key) && !json.isNull(key)) values.put(column, json.optBoolean(key) ? 1 : 0);
        else values.putNull(column);
    }

    public synchronized void addSample(JSONObject config, JSONObject sample, String rawFrameHex, long elapsedMs) {
        if (sample == null) return;
        SQLiteDatabase db = getWritableDatabase();
        ContentValues v = new ContentValues();
        v.put("battery_id", batteryKey(config));
        v.put("battery_name", batteryName(config));
        v.put("bms_type", sample.optString("bmsType", config == null ? "" : config.optString("bmsType", "")));
        v.put("time_ms", sample.optLong("time", System.currentTimeMillis()));
        v.put("elapsed_ms", elapsedMs);
        putNumber(v, "voltage_v", sample, "voltage");
        putNumber(v, "current_a", sample, "current");
        putNumber(v, "soc_pct", sample, "soc");
        putNumber(v, "cell1_v", sample, "cell1V");
        putNumber(v, "cell2_v", sample, "cell2V");
        putNumber(v, "cell3_v", sample, "cell3V");
        putNumber(v, "cell4_v", sample, "cell4V");
        putNumber(v, "temp_battery_c", sample, "temperature");
        v.put("temp_sensors_json", sample.has("temperatures") && !sample.isNull("temperatures") ? sample.opt("temperatures").toString() : null);
        putBoolean(v, "charge_allowed", sample, "chargeAllowed");
        putBoolean(v, "discharge_allowed", sample, "dischargeAllowed");
        v.put("alarms_json", sample.has("alarms") && !sample.isNull("alarms") ? sample.opt("alarms").toString() : null);
        v.put("protections_json", sample.has("protections") && !sample.isNull("protections") ? sample.opt("protections").toString() : null);
        putNumber(v, "remaining_ah", sample, "remainingAh");
        double capacity = config == null ? Double.NaN : config.optDouble("capacityAh", Double.NaN);
        if (!Double.isFinite(capacity) || capacity <= 0) capacity = sample.optDouble("totalAh", Double.NaN);
        if (Double.isFinite(capacity) && capacity > 0) v.put("capacity_ah", capacity); else v.putNull("capacity_ah");
        if (sample.has("connected") && !sample.isNull("connected")) v.put("connected", sample.optBoolean("connected") ? 1 : 0); else v.putNull("connected");
        v.put("raw_frame_hex", rawFrameHex);
        db.insert("samples", null, v);
        pruneIfNeeded(db, sample.optLong("time", System.currentTimeMillis()));
    }

    public synchronized void addEvent(JSONObject config, long timestampMs, String type, String details) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues v = new ContentValues();
        v.put("battery_id", batteryKey(config));
        v.put("battery_name", batteryName(config));
        v.put("time_ms", timestampMs);
        v.put("event_type", type == null ? "EVENT" : type);
        v.put("details", details == null ? "" : details);
        db.insert("events", null, v);
        pruneIfNeeded(db, timestampMs);
    }

    private void pruneIfNeeded(SQLiteDatabase db, long now) {
        Context c = getContextCompat();
        if (c == null) return;
        long last = c.getSharedPreferences("battery_diagnostics", Context.MODE_PRIVATE).getLong("last_prune_ms", 0);
        if (now - last < 24L * 60L * 60L * 1000L) return;
        long cutoff = now - RETENTION_MS;
        db.delete("samples", "time_ms < ?", new String[]{String.valueOf(cutoff)});
        db.delete("events", "time_ms < ?", new String[]{String.valueOf(cutoff)});
        c.getSharedPreferences("battery_diagnostics", Context.MODE_PRIVATE).edit().putLong("last_prune_ms", now).apply();
    }

    private Context getContextCompat() {
        try {
            java.lang.reflect.Field field = SQLiteOpenHelper.class.getDeclaredField("mContext");
            field.setAccessible(true);
            return (Context) field.get(this);
        } catch (Exception ignored) { return null; }
    }

    private static Double num(Cursor c, String column) {
        int i = c.getColumnIndex(column);
        return i < 0 || c.isNull(i) ? null : c.getDouble(i);
    }

    private static String text(Cursor c, String column) {
        int i = c.getColumnIndex(column);
        return i < 0 || c.isNull(i) ? "" : c.getString(i);
    }

    private static String fmt(Double value) {
        return value == null || !Double.isFinite(value) ? "" : String.format(Locale.US, "%.6f", value);
    }

    private static String csv(String value) {
        String s = value == null ? "" : value;
        return "\"" + s.replace("\"", "\"\"") + "\"";
    }

    private static void writeRow(BufferedWriter out, String[] row) throws IOException {
        for (int i = 0; i < row.length; i++) {
            if (i > 0) out.write(',');
            out.write(csv(row[i]));
        }
        out.write("\r\n");
    }

    private static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    private static final class Totals {
        long prevElapsed = -1;
        Double prevCurrent, prevSoc;
        double chargeAh, dischargeAh, chargeAmpSeconds, dischargeAmpSeconds, chargeSeconds, dischargeSeconds;
        Double minVoltage, maxVoltage, maxCellSpread;
        String name = "";
    }

    public synchronized JSONObject summaryJson(boolean enabled) {
        JSONObject out = new JSONObject();
        SQLiteDatabase db = getReadableDatabase();
        try {
            out.put("enabled", enabled);
            out.put("sampleCount", scalar(db, "SELECT COUNT(*) FROM samples"));
            out.put("eventCount", scalar(db, "SELECT COUNT(*) FROM events"));
            out.put("firstTime", scalar(db, "SELECT COALESCE(MIN(time_ms),0) FROM samples"));
            out.put("lastTime", scalar(db, "SELECT COALESCE(MAX(time_ms),0) FROM samples"));
            JSONArray batteries = new JSONArray();
            try (Cursor c = db.rawQuery("SELECT battery_id,COALESCE(MAX(battery_name),''),COUNT(*),COALESCE(MAX(time_ms),0) FROM samples GROUP BY battery_id ORDER BY battery_id", null)) {
                while (c.moveToNext()) {
                    JSONObject b = new JSONObject();
                    b.put("id", c.getString(0)); b.put("name", c.getString(1)); b.put("samples", c.getLong(2)); b.put("lastTime", c.getLong(3));
                    batteries.put(b);
                }
            }
            out.put("batteries", batteries);
            JSONArray events = new JSONArray();
            try (Cursor c = db.rawQuery("SELECT battery_id,COALESCE(battery_name,''),time_ms,event_type,COALESCE(details,'') FROM events ORDER BY time_ms DESC LIMIT 12", null)) {
                while (c.moveToNext()) {
                    JSONObject e = new JSONObject(); e.put("batteryId", c.getString(0)); e.put("batteryName", c.getString(1)); e.put("time", c.getLong(2)); e.put("type", c.getString(3)); e.put("details", c.getString(4)); events.put(e);
                }
            }
            out.put("recentEvents", events);
        } catch (Exception ignored) {}
        return out;
    }

    private static long scalar(SQLiteDatabase db, String sql) {
        try (Cursor c = db.rawQuery(sql, null)) { return c.moveToFirst() ? c.getLong(0) : 0; }
    }

    public synchronized void exportCsv(OutputStream stream) throws IOException {
        BufferedWriter out = new BufferedWriter(new OutputStreamWriter(stream, StandardCharsets.UTF_8), 32768);
        String[] header = {"record_type","timestamp_utc","timestamp_ms","battery_id","battery_name","bms_type","connected","voltage_v","current_a","soc_pct","cell1_v","cell2_v","cell3_v","cell4_v","temp_battery_c","temp_sensors_json","charge_allowed","discharge_allowed","alarms_json","protections_json","remaining_ah","capacity_ah","raw_frame_hex","interval_charge_ah","interval_discharge_ah","interval_net_ah","cumulative_charge_ah","cumulative_discharge_ah","cumulative_net_ah","soc_delta_pct","expected_soc_delta_pct","soc_error_pct","current_other_battery_a","current_difference_a","avg_charge_current_a","avg_discharge_current_a","min_voltage_v","max_voltage_v","max_cell_spread_v","interval_valid","event_type","event_details"};
        writeRow(out, header);
        SQLiteDatabase db = getReadableDatabase();
        Map<String, Totals> totals = new HashMap<>();
        String sql = "SELECT battery_id,battery_name,bms_type,time_ms,elapsed_ms,voltage_v,current_a,soc_pct,cell1_v,cell2_v,cell3_v,cell4_v,temp_battery_c,temp_sensors_json,charge_allowed,discharge_allowed,alarms_json,protections_json,remaining_ah,capacity_ah,connected,raw_frame_hex FROM samples ORDER BY battery_id,time_ms,_id";
        try (Cursor c = db.rawQuery(sql, null)) {
            while (c.moveToNext()) {
                String id = c.getString(0), name = text(c, "battery_name");
                Totals s = totals.get(id); if (s == null) { s = new Totals(); totals.put(id, s); } s.name = name;
                long time = c.getLong(3), elapsed = c.getLong(4);
                Double voltage = num(c, "voltage_v"), current = num(c, "current_a"), soc = num(c, "soc_pct"), capacity = num(c, "capacity_ah");
                Double intervalCharge = null, intervalDischarge = null, intervalNet = null, socDelta = null, expectedSocDelta = null, socError = null;
                boolean valid = false;
                if (s.prevElapsed >= 0 && elapsed > s.prevElapsed && elapsed - s.prevElapsed <= 20000L && s.prevCurrent != null && current != null) {
                    double dt = (elapsed - s.prevElapsed) / 1000.0;
                    double chargeStart = Math.max(0, s.prevCurrent), chargeEnd = Math.max(0, current);
                    double dischargeStart = Math.max(0, -s.prevCurrent), dischargeEnd = Math.max(0, -current);
                    intervalCharge = (chargeStart + chargeEnd) * 0.5 * dt / 3600.0;
                    intervalDischarge = (dischargeStart + dischargeEnd) * 0.5 * dt / 3600.0;
                    intervalNet = intervalCharge - intervalDischarge;
                    s.chargeAh += intervalCharge; s.dischargeAh += intervalDischarge;
                    s.chargeAmpSeconds += intervalCharge * 3600.0; s.dischargeAmpSeconds += intervalDischarge * 3600.0;
                    if (chargeStart + chargeEnd > 0) s.chargeSeconds += dt;
                    if (dischargeStart + dischargeEnd > 0) s.dischargeSeconds += dt;
                    if (soc != null && s.prevSoc != null) {
                        socDelta = soc - s.prevSoc;
                        if (capacity != null && capacity > 0) {
                            expectedSocDelta = intervalNet / capacity * 100.0;
                            socError = socDelta - expectedSocDelta;
                        }
                    }
                    valid = true;
                }
                if (voltage != null) { s.minVoltage = s.minVoltage == null ? voltage : Math.min(s.minVoltage, voltage); s.maxVoltage = s.maxVoltage == null ? voltage : Math.max(s.maxVoltage, voltage); }
                Double[] cells = {num(c,"cell1_v"),num(c,"cell2_v"),num(c,"cell3_v"),num(c,"cell4_v")};
                double cellMin = Double.POSITIVE_INFINITY, cellMax = Double.NEGATIVE_INFINITY; int cellCount = 0;
                for (Double cell : cells) if (cell != null) { cellMin = Math.min(cellMin, cell); cellMax = Math.max(cellMax, cell); cellCount++; }
                if (cellCount >= 2) { double spread = cellMax - cellMin; s.maxCellSpread = s.maxCellSpread == null ? spread : Math.max(s.maxCellSpread, spread); }
                Double other = null;
                if (current != null) try (Cursor p = db.rawQuery("SELECT current_a FROM samples WHERE battery_id<>? AND current_a IS NOT NULL AND time_ms BETWEEN ? AND ? ORDER BY ABS(time_ms-?) LIMIT 1", new String[]{id, String.valueOf(time-5000), String.valueOf(time+5000), String.valueOf(time)})) { if (p.moveToFirst() && !p.isNull(0)) other = p.getDouble(0); }
                Double difference = other == null || current == null ? null : current - other;
                String[] row = new String[header.length]; Arrays.fill(row, "");
                row[0]="SAMPLE"; row[1]=iso(time); row[2]=String.valueOf(time); row[3]=id; row[4]=name; row[5]=text(c,"bms_type"); row[6]=num(c,"connected")==null?"":(num(c,"connected")!=0?"1":"0");
                row[7]=fmt(voltage); row[8]=fmt(current); row[9]=fmt(soc);
                row[10]=fmt(cells[0]); row[11]=fmt(cells[1]); row[12]=fmt(cells[2]); row[13]=fmt(cells[3]);
                row[14]=fmt(num(c,"temp_battery_c")); row[15]=text(c,"temp_sensors_json"); row[16]=num(c,"charge_allowed")==null?"":(num(c,"charge_allowed")!=0?"1":"0"); row[17]=num(c,"discharge_allowed")==null?"":(num(c,"discharge_allowed")!=0?"1":"0");
                row[18]=text(c,"alarms_json"); row[19]=text(c,"protections_json"); row[20]=fmt(num(c,"remaining_ah")); row[21]=fmt(capacity); row[22]=text(c,"raw_frame_hex");
                row[23]=fmt(intervalCharge); row[24]=fmt(intervalDischarge); row[25]=fmt(intervalNet); row[26]=fmt(s.chargeAh); row[27]=fmt(s.dischargeAh); row[28]=fmt(s.chargeAh-s.dischargeAh);
                row[29]=fmt(socDelta); row[30]=fmt(expectedSocDelta); row[31]=fmt(socError); row[32]=fmt(other); row[33]=fmt(difference);
                row[34]=s.chargeSeconds>0?fmt(s.chargeAmpSeconds/s.chargeSeconds):""; row[35]=s.dischargeSeconds>0?fmt(s.dischargeAmpSeconds/s.dischargeSeconds):"";
                row[36]=fmt(s.minVoltage); row[37]=fmt(s.maxVoltage); row[38]=fmt(s.maxCellSpread); row[39]=valid?"1":"0";
                writeRow(out,row);
                s.prevElapsed=elapsed; s.prevCurrent=current; s.prevSoc=soc;
            }
        }
        try (Cursor c = db.rawQuery("SELECT battery_id,COALESCE(battery_name,''),time_ms,event_type,COALESCE(details,'') FROM events ORDER BY time_ms", null)) {
            while (c.moveToNext()) {
                String[] row = new String[header.length]; Arrays.fill(row, "");
                row[0]="EVENT"; row[1]=iso(c.getLong(2)); row[2]=String.valueOf(c.getLong(2)); row[3]=c.getString(0); row[4]=c.getString(1); row[40]=c.getString(3); row[41]=c.getString(4);
                writeRow(out,row);
            }
        }
        for (Map.Entry<String, Totals> item : totals.entrySet()) {
            Totals s=item.getValue(); String[] row=new String[header.length]; Arrays.fill(row,"");
            row[0]="SUMMARY"; row[3]=item.getKey(); row[4]=s.name; row[26]=fmt(s.chargeAh); row[27]=fmt(s.dischargeAh); row[28]=fmt(s.chargeAh-s.dischargeAh);
            row[34]=s.chargeSeconds>0?fmt(s.chargeAmpSeconds/s.chargeSeconds):""; row[35]=s.dischargeSeconds>0?fmt(s.dischargeAmpSeconds/s.dischargeSeconds):"";
            row[36]=fmt(s.minVoltage); row[37]=fmt(s.maxVoltage); row[38]=fmt(s.maxCellSpread); row[40]="Resumen acumulado desde la primera muestra válida";
            writeRow(out,row);
        }
        out.flush();
    }
}