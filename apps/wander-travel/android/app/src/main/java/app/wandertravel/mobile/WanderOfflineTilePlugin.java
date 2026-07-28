package app.wandertravel.mobile;

import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.os.Build;
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
    private static final String OSM_TILE_TEMPLATE = "https://tile.openstreetmap.org/%d/%d/%d.png";
    private static final String ESRI_TILE_TEMPLATE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%d/%d/%d";
    private static final String USER_AGENT = "WanderTravel/0.11.3 (+https://wander-travel.pages.dev)";
    private static final String PREFS_NAME = "wander_offline_tiles";
    private static final String RETENTION_KEY = "retention_days";
    private static final int DEFAULT_RETENTION_DAYS = 90;
    private static final int MAX_ZOOM = 19;
    private static final int MAX_TILE_COUNT = 6000;
    private static final int MAX_FALLBACK_DEPTH = 4;
    private static final int WARM_ANCESTOR_DEPTH = 2;
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 12000;
    private static final int MAX_TILE_BYTES = 2 * 1024 * 1024;
    private static final ExecutorService IO_EXECUTOR = Executors.newFixedThreadPool(4);

    private static final class CachedAncestor {
        final File file;
        final int depth;
        final int cropX;
        final int cropY;

        CachedAncestor(File file, int depth, int cropX, int cropY) {
            this.file = file;
            this.depth = depth;
            this.cropX = cropX;
            this.cropY = cropY;
        }
    }

    private File cacheRoot() {
        File root = new File(getContext().getFilesDir(), CACHE_DIRECTORY);
        if (!root.exists()) root.mkdirs();
        return root;
    }

    private String normalizeSource(String value) {
        String source = value == null ? "osm" : value.trim().toLowerCase();
        if (source.equals("satellite") || source.equals("esri")) return "esri";
        return "osm";
    }

    private File tileFile(String source, int z, int x, int y) {
        if ("osm".equals(source)) {
            return new File(new File(new File(cacheRoot(), String.valueOf(z)), String.valueOf(x)), y + ".png");
        }
        return new File(new File(new File(new File(cacheRoot(), source), String.valueOf(z)), String.valueOf(x)), y + ".tile");
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

    private boolean networkAvailable() {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network network = manager.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            return capabilities != null
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        }
        NetworkInfo info = manager.getActiveNetworkInfo();
        return info != null && info.isConnected();
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

    private URL tileUrl(String source, int z, int x, int y) throws IOException {
        String value = "esri".equals(source)
            ? String.format(ESRI_TILE_TEMPLATE, z, y, x)
            : String.format(OSM_TILE_TEMPLATE, z, x, y);
        return new URL(value);
    }

    private byte[] downloadTile(String source, int z, int x, int y) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) tileUrl(source, z, x, y).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setRequestProperty("Accept", "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8");
        connection.setUseCaches(true);
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) throw new IOException("Map tile HTTP " + status);
            String contentType = connection.getContentType();
            if (contentType == null || !contentType.toLowerCase().startsWith("image/")) {
                throw new IOException("Unexpected map tile content type");
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

    private String mimeType(String source) {
        return "esri".equals(source) ? "image/jpeg" : "image/png";
    }

    private JSObject tileResponse(byte[] bytes, boolean cached, boolean stale, String source, int z, int x, int y) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("cached", cached);
        result.put("stale", stale);
        result.put("fallback", false);
        result.put("source", source);
        result.put("z", z);
        result.put("x", x);
        result.put("y", y);
        result.put("bytes", bytes.length);
        result.put("dataUrl", "data:" + mimeType(source) + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
        return result;
    }

    private JSObject fallbackTileResponse(byte[] bytes, boolean stale, String source, int z, int x, int y, CachedAncestor ancestor) {
        JSObject result = tileResponse(bytes, true, stale, source, z, x, y);
        result.put("fallback", true);
        result.put("fallbackDepth", ancestor.depth);
        result.put("cropX", ancestor.cropX);
        result.put("cropY", ancestor.cropY);
        result.put("scale", 1 << ancestor.depth);
        return result;
    }

    private JSObject unavailableResponse(String source, int z, int x, int y, String message) {
        JSObject result = new JSObject();
        result.put("ok", false);
        result.put("cached", false);
        result.put("offline", true);
        result.put("source", source);
        result.put("z", z);
        result.put("x", x);
        result.put("y", y);
        result.put("message", message == null ? "Tile unavailable" : message);
        return result;
    }

    private CachedAncestor findCachedAncestor(String source, int z, int x, int y) {
        int maximum = Math.min(MAX_FALLBACK_DEPTH, z);
        for (int depth = 1; depth <= maximum; depth++) {
            int scale = 1 << depth;
            int parentZ = z - depth;
            int parentX = x / scale;
            int parentY = y / scale;
            File parent = tileFile(source, parentZ, parentX, parentY);
            if (parent.isFile() && parent.length() > 0) {
                return new CachedAncestor(parent, depth, x % scale, y % scale);
            }
        }
        return null;
    }

    private JSObject resolveAncestor(String source, int z, int x, int y, int days) {
        CachedAncestor ancestor = findCachedAncestor(source, z, x, y);
        if (ancestor == null) return null;
        try {
            boolean fresh = days > 0 && System.currentTimeMillis() - ancestor.file.lastModified() <= retentionMs(days);
            byte[] bytes = readBytes(ancestor.file);
            ancestor.file.setLastModified(System.currentTimeMillis());
            return fallbackTileResponse(bytes, !fresh, source, z, x, y, ancestor);
        } catch (Exception error) {
            ancestor.file.delete();
            return null;
        }
    }

    private void warmAncestorTiles(String source, int z, int x, int y, int days) {
        if (days <= 0 || !networkAvailable()) return;
        int maximum = Math.min(WARM_ANCESTOR_DEPTH, z);
        for (int depth = 1; depth <= maximum; depth++) {
            int scale = 1 << depth;
            int parentZ = z - depth;
            int parentX = x / scale;
            int parentY = y / scale;
            File parent = tileFile(source, parentZ, parentX, parentY);
            if (parent.isFile() && parent.length() > 0) continue;
            try {
                writeAtomically(parent, downloadTile(source, parentZ, parentX, parentY));
            } catch (Exception ignored) {}
        }
    }

    @PluginMethod
    public void getTile(PluginCall call) {
        Integer z = call.getInt("z");
        Integer x = call.getInt("x");
        Integer y = call.getInt("y");
        String source = normalizeSource(call.getString("source", "osm"));
        if (z == null || x == null || y == null || !validCoordinates(z, x, y)) {
            call.reject("Invalid tile coordinates", "INVALID_TILE");
            return;
        }

        IO_EXECUTOR.execute(() -> {
            File file = tileFile(source, z, x, y);
            int days = retentionDays();
            boolean hasCached = file.isFile() && file.length() > 0;
            boolean fresh = hasCached && days > 0 && System.currentTimeMillis() - file.lastModified() <= retentionMs(days);

            if (hasCached) {
                try {
                    byte[] bytes = readBytes(file);
                    file.setLastModified(System.currentTimeMillis());
                    call.resolve(tileResponse(bytes, true, !fresh, source, z, x, y));
                    if (!fresh && days > 0 && networkAvailable()) {
                        try {
                            writeAtomically(file, downloadTile(source, z, x, y));
                            pruneIfNeeded(days);
                        } catch (Exception ignored) {}
                    }
                    return;
                } catch (Exception error) {
                    file.delete();
                }
            }

            if (!networkAvailable()) {
                JSObject fallback = resolveAncestor(source, z, x, y, days);
                call.resolve(fallback != null ? fallback : unavailableResponse(source, z, x, y, "No cached tile and no validated network"));
                return;
            }

            try {
                byte[] bytes = downloadTile(source, z, x, y);
                if (days > 0) {
                    writeAtomically(file, bytes);
                    pruneIfNeeded(days);
                }
                call.resolve(tileResponse(bytes, false, false, source, z, x, y));
                warmAncestorTiles(source, z, x, y, days);
                pruneIfNeeded(days);
            } catch (Exception error) {
                JSObject fallback = resolveAncestor(source, z, x, y, days);
                call.resolve(fallback != null ? fallback : unavailableResponse(source, z, x, y, error.getMessage()));
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
            else {
                String name = child.getName().toLowerCase();
                if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".tile")) output.add(child);
            }
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
        result.put("source", "viewed-map-cache");
        result.put("streets", true);
        result.put("satellite", true);
        result.put("zoomFallback", true);
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
