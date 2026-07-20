package app.wandertravel.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Location;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

final class WanderLocationJournal {
    private static final String FILE_NAME = "wander-location-journal.jsonl";
    private static final String PREFERENCES = "wander-location-journal";
    private static final String NEXT_ID_KEY = "next-id";
    private static final long MAX_BYTES = 12L * 1024L * 1024L;
    private static final int RETAINED_ROWS = 40000;
    private static WanderLocationJournal instance;

    static synchronized WanderLocationJournal get(Context context) {
        if (instance == null) instance = new WanderLocationJournal(context.getApplicationContext());
        return instance;
    }

    private final File journalFile;
    private final SharedPreferences preferences;

    private WanderLocationJournal(Context context) {
        journalFile = new File(context.getFilesDir(), FILE_NAME);
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    synchronized long append(Location location, String permissionPrecision) {
        if (location == null) return -1;
        long id = preferences.getLong(NEXT_ID_KEY, 0) + 1;
        preferences.edit().putLong(NEXT_ID_KEY, id).apply();

        JSObject payload = new JSObject();
        payload.put("journalId", id);
        payload.put("latitude", location.getLatitude());
        payload.put("longitude", location.getLongitude());
        payload.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : null);
        payload.put("altitude", location.hasAltitude() ? location.getAltitude() : null);
        payload.put("heading", location.hasBearing() ? location.getBearing() : null);
        payload.put("speed", location.hasSpeed() ? location.getSpeed() : null);
        payload.put("provider", location.getProvider());
        payload.put("permissionPrecision", permissionPrecision);
        payload.put("timestamp", location.getTime() > 0 ? location.getTime() : System.currentTimeMillis());
        payload.put("replayed", true);

        try (BufferedWriter writer = writer(journalFile, true)) {
            writer.write(payload.toString());
            writer.newLine();
        } catch (IOException error) {
            return -1;
        }
        if (journalFile.length() > MAX_BYTES) retainLatest();
        return id;
    }

    synchronized JSArray pending(int requestedLimit) {
        int limit = Math.max(1, Math.min(1000, requestedLimit));
        JSArray result = new JSArray();
        if (!journalFile.exists()) return result;
        try (BufferedReader reader = reader(journalFile)) {
            String line;
            while (result.length() < limit && (line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                try { result.put(new JSONObject(line)); } catch (Exception ignored) {}
            }
        } catch (IOException ignored) {}
        return result;
    }

    synchronized int acknowledge(JSArray ids) {
        if (ids == null || ids.length() == 0 || !journalFile.exists()) return 0;
        Set<Long> acknowledged = new HashSet<>();
        for (int index = 0; index < ids.length(); index += 1) {
            try {
                long id = ids.getLong(index);
                if (id > 0) acknowledged.add(id);
            } catch (Exception ignored) {}
        }
        if (acknowledged.isEmpty()) return 0;

        File replacement = new File(journalFile.getParentFile(), FILE_NAME + ".next");
        int removed = 0;
        try (BufferedReader source = reader(journalFile); BufferedWriter target = writer(replacement, false)) {
            String line;
            while ((line = source.readLine()) != null) {
                boolean remove = false;
                try { remove = acknowledged.contains(new JSONObject(line).optLong("journalId", -1)); } catch (Exception ignored) {}
                if (remove) removed += 1;
                else {
                    target.write(line);
                    target.newLine();
                }
            }
        } catch (IOException error) {
            replacement.delete();
            return 0;
        }
        replace(replacement);
        return removed;
    }

    synchronized int count() {
        if (!journalFile.exists()) return 0;
        int total = 0;
        try (BufferedReader source = reader(journalFile)) {
            while (source.readLine() != null) total += 1;
        } catch (IOException ignored) {}
        return total;
    }

    synchronized long latestRecordedAt() {
        if (!journalFile.exists()) return 0;
        long latest = 0;
        try (BufferedReader source = reader(journalFile)) {
            String line;
            while ((line = source.readLine()) != null) {
                try { latest = Math.max(latest, new JSONObject(line).optLong("timestamp", 0)); } catch (Exception ignored) {}
            }
        } catch (IOException ignored) {}
        return latest;
    }

    private void retainLatest() {
        ArrayDeque<String> lines = new ArrayDeque<>(RETAINED_ROWS);
        try (BufferedReader source = reader(journalFile)) {
            String line;
            while ((line = source.readLine()) != null) {
                if (lines.size() >= RETAINED_ROWS) lines.removeFirst();
                lines.addLast(line);
            }
        } catch (IOException ignored) { return; }

        File replacement = new File(journalFile.getParentFile(), FILE_NAME + ".trim");
        try (BufferedWriter target = writer(replacement, false)) {
            for (String line : lines) {
                target.write(line);
                target.newLine();
            }
        } catch (IOException error) {
            replacement.delete();
            return;
        }
        replace(replacement);
    }

    private void replace(File replacement) {
        if (journalFile.exists() && !journalFile.delete()) {
            replacement.delete();
            return;
        }
        if (!replacement.renameTo(journalFile)) replacement.delete();
    }

    private BufferedReader reader(File file) throws IOException {
        return new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8));
    }

    private BufferedWriter writer(File file, boolean append) throws IOException {
        return new BufferedWriter(new OutputStreamWriter(new FileOutputStream(file, append), StandardCharsets.UTF_8));
    }
}
