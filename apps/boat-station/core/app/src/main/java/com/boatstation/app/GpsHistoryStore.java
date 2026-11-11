package com.boatstation.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

public final class GpsHistoryStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "boat_station_gps_history.db";
    private static final int DB_VERSION = 1;
    private static final String TABLE = "gps_points";
    private static volatile GpsHistoryStore instance;

    public static GpsHistoryStore get(Context context) {
        GpsHistoryStore current = instance;
        if (current == null) {
            synchronized (GpsHistoryStore.class) {
                current = instance;
                if (current == null) instance = current = new GpsHistoryStore(context.getApplicationContext());
            }
        }
        return current;
    }

    private GpsHistoryStore(Context context) { super(context, DB_NAME, null, DB_VERSION); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE " + TABLE + " (time INTEGER PRIMARY KEY, lat REAL NOT NULL, lon REAL NOT NULL)");
        db.execSQL("CREATE INDEX gps_points_time_idx ON " + TABLE + "(time)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    public synchronized void append(long time, double lat, double lon, int retentionHours) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues values = new ContentValues();
        values.put("time", time);
        values.put("lat", lat);
        values.put("lon", lon);
        db.insertWithOnConflict(TABLE, null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public synchronized JSONArray recentJson(int retentionHours) {
        return sinceJson(0L, retentionHours);
    }

    public synchronized JSONArray sinceJson(long afterTime, int retentionHours) {
        SQLiteDatabase db = getWritableDatabase();
        long cutoff = timeCutoff(retentionHours);
        JSONArray result = new JSONArray();
        try (Cursor cursor = db.query(TABLE, new String[]{"time", "lat", "lon"},
                "time >= ? AND time > ?", new String[]{String.valueOf(cutoff), String.valueOf(afterTime)},
                null, null, "time ASC")) {
            while (cursor.moveToNext()) {
                JSONObject point = new JSONObject();
                point.put("time", cursor.getLong(0));
                point.put("lat", cursor.getDouble(1));
                point.put("lon", cursor.getDouble(2));
                result.put(point);
            }
        } catch (Exception ignored) {}
        return result;
    }

    public synchronized void pruneOlderThan(int retentionHours) {
        prune(getWritableDatabase(), timeCutoff(retentionHours));
    }

    public synchronized void clear() {
        getWritableDatabase().delete(TABLE, null, null);
    }

    private void prune(SQLiteDatabase db, long cutoff) {
        db.delete(TABLE, "time < ?", new String[]{String.valueOf(cutoff)});
    }

    private long timeCutoff(int retentionHours) {
        int hours = retentionHours == 3 || retentionHours == 6 || retentionHours == 12 || retentionHours == 24
                ? retentionHours : 6;
        return System.currentTimeMillis() - hours * 60L * 60L * 1000L;
    }
}
