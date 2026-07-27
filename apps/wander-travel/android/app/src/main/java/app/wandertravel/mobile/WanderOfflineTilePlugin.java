package app.wandertravel.mobile;

import android.content.SharedPreferences;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "WanderOfflineTiles")
public class WanderOfflineTilePlugin extends Plugin {
    private static final String CACHE_DIRECTORY = "osm-tile-cache-v1";
    private static final String TILE_TEMPLATE = "https://tile.openstreetmap.org/%d/%d/%d.png";
    private static final String USER_AGENT = "WanderTravel/0.10.0 (+https://wander-travel.pages.dev)";
    private static final String PREFS_NAME = "wander_offline_tiles";
    private static final String RETENTION_KEY = "retention_days";
    private static final int DEFAULT_RETENTION_DAYS = 90;
    private static final int MAX_ZOOM = 19;
    private static final int MAX_TILE_COUNT = 4000;
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 12000;
    private static final int MAX_TILE_BYTES = 1024 * 1024;
    private static final ExecutorService IO_EXECUTOR = Executors.newFixedThreadPool(4);

    private File cacheRoot() {
        File root = new File(getContext().getFilesDir(), CACHE_DIRECTORY);
        if (!root.exists()) root.mkdirs();
        return root;
    }

    private File tileFile(int z, int x, int y) {
        return new File(new File(new File(cacheRoot(), String.valueOf(z)), String.valueOf(x)), y + ".png");
    }

    private int normalizeRetentionDays(Integer value) {
        if (value == null) return DEFAULT_RETENTION_DAYS;
        int days = value;
        return days == 0 || days == 7 || days == 30 || days == 90 || days == 180 || days == 365
            ? days
            : DEFAULT_RETENTION_DAYS;
    }

    private int retentionDays() {
        SharedPreferences preferences = getContext().getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE);
        return normalizeRetentionDays(preferences.getInt(RETENTION_KEY, DEFAULT_RETENTION_DAYS));
    }

    private void saveRetentionDays(int days) {
        getContext().getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
            .edit()
            .putInt(RETENTION_KEY, normalizeRetentionDays(days))
            .apply();
    }

    private long retentionMs(int days) {
        return Math.max(0, days) * 24L * 60L * 60L * 1000L;
    }

    private boolean validCoordinates(int z, int x, int y) {
        if (z < 0 || z > MAX_ZOOM) return false;
        int edge = 1 << z;
        return x >= 0 && y >= 0 && x < edge && y < edge;
    }

    private byte[] readBytes(File file) throws IOException {
        try (InputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                output.write(buffer, 0, count);
                if (output.size() > MAX_TILE_BYTES) throw new IOException("Tile exceeds maximum size");
            }
            return output.toByteArray();
        }
    }

    private byte[] downloadTile(int z, int x, int y) throws IOException {
        URL url = new URL(String.format(TILE_TEMPLATE, z, x, y));
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setRequestProperty("Accept", "image/png,image/*;q=0.8");
        connection.setUseCaches(true);
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) throw new IOException("OSM tile HTTP " + status);
            String contentType = connection.getContentType();
            if (contentType == null || !contentType.toLowerCase().startsWith("image/")) {
                throw new IOException("Unexpected OSM tile content type");
            }
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[16384];
                int count;
                while ((count = input.read(buffer)) >= 0) {
                    output.write(buffer, 0, count);
                    if (output.size() > MAX_TILE_BYTES) throw new IOException("Tile exceeds maximum size");
                }
                return output.toByteArray();
            }
        } finally {
            connection.disconnect();
        }
    }

    private void writeAtomically(File destination, byte[] bytes) throws IOException {
        File parent = destination.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("Could not create tile cache directory");
        File temporary = new File(destination.getAbsolutePath() + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(bytes);
            output.flush();
        }
        if (destination.exists() && !destination.delete()) throw new IOException("Could not replace cached tile");
        if (!temporary.renameTo(destination)) throw new IOException("Could not commit cached tile");
        destination.setLastModified(System.currentTimeMillis());
    }

    private JSObject tileResponse(byte[] bytes, boolean cached, boolean stale, int z, int x, int y) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("cached", cached);
        result.put("stale", stale);
        result.put("z", z);
        result.put("x", x);
        result.put("y", y);
        result.put("bytes", bytes.length);
        result.put("dataUrl", "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
        return result;
    }

    @PluginMethod
    public void getTile(PluginCall call) {
        Integer z = call.getInt("z");
        Integer x = call.getInt("x");
        Integer y = call.getInt("y");
        if (z == null || x == null || y == null || !validCoordinates(z, x, y)) {
            call.reject("Invalid tile coordinates", "INVALID_TILE");
            return;
        }

        IO_EXECUTOR.execute(() -> {
            File file = tileFile(z, x, y);
            int days = retentionDays();
            boolean hasCached = file.isFile() && file.length() > 0;
            boolean fresh = hasCached && days > 0 && System.currentTimeMillis() - file.lastModified() <= retentionMs(days);
            try {
                if (fresh) {
                    file.setLastModified(System.currentTimeMillis());
                    call.resolve(tileResponse(readBytes(file), true, false, z, x, y));
                    return;
                }

                byte[] bytes = downloadTile(z, x, y);
                if (days > 0) {
                    writeAtomically(file, bytes);
                    pruneIfNeeded(days);
                }
                call.resolve(tileResponse(bytes, false, false, z, x, y));
            } catch (Exception error) {
                if (hasCached) {
                    try {
                        file.setLastModified(System.currentTimeMillis());
                        call.resolve(tileResponse(readBytes(file), true, true, z, x, y));
                        return;
                    } catch (Exception ignored) {}
                }
                JSObject result = new JSObject();
                result.put("ok", false);
                result.put("cached", false);
                result.put("offline", true);
                result.put("z", z);
                result.put("x", x);
                result.put("y", y);
                result.put("message", error.getMessage() == null ? "Tile unavailable" : error.getMessage());
                call.resolve(result);
            }
        });
    }

    private List<File> allTiles() {
        List<File> files = new ArrayList<>();
        collectTiles(cacheRoot(), files);
        return files;
    }

    private void collectTiles(File directory, List<File> output) {
        File[] children = directory.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) collectTiles(child, output);
            else if (child.getName().endsWith(".png")) output.add(child);
        }
    }

    private long totalBytes(List<File> files) {
        long total = 0;
        for (File file : files) total += Math.max(0, file.length());
        return total;
    }

    private void pruneIfNeeded(int days) {
        List<File> files = allTiles();
        long cutoff = days > 0 ? System.currentTimeMillis() - retentionMs(days) : Long.MIN_VALUE;
        if (days > 0) {
            for (File file : new ArrayList<>(files)) {
                if (file.lastModified() < cutoff) file.delete();
            }
            files = allTiles();
        }
        if (files.size() <= MAX_TILE_COUNT) return;
        files.sort(Comparator.comparingLong(File::lastModified));
        int removeCount = files.size() - MAX_TILE_COUNT;
        for (int index = 0; index < removeCount; index++) files.get(index).delete();
    }

    private JSObject statsPayload() {
        List<File> files = allTiles();
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("available", true);
        result.put("native", true);
        result.put("count", files.size());
        result.put("tileCount", files.size());
        result.put("bytes", totalBytes(files));
        result.put("maxEntries", MAX_TILE_COUNT);
        result.put("maxTileCount", MAX_TILE_COUNT);
        result.put("retentionDays", retentionDays());
        result.put("source", "openstreetmap-view-cache");
        return result;
    }

    @PluginMethod
    public void getStats(PluginCall call) {
        IO_EXECUTOR.execute(() -> call.resolve(statsPayload()));
    }

    @PluginMethod
    public void configure(PluginCall call) {
        int days = normalizeRetentionDays(call.getInt("retentionDays"));
        saveRetentionDays(days);
        IO_EXECUTOR.execute(() -> {
            if (days == 0) deleteRecursively(cacheRoot());
            else pruneIfNeeded(days);
            cacheRoot().mkdirs();
            call.resolve(statsPayload());
        });
    }

    private boolean deleteRecursively(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        return !file.exists() || file.delete();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        IO_EXECUTOR.execute(() -> {
            boolean cleared = deleteRecursively(cacheRoot());
            cacheRoot().mkdirs();
            JSObject result = statsPayload();
            result.put("cleared", cleared);
            call.resolve(result);
        });
    }
}
