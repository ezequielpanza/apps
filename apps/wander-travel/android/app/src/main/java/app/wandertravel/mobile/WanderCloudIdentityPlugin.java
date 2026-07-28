package app.wandertravel.mobile;

import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@CapacitorPlugin(name = "WanderCloudIdentity")
public class WanderCloudIdentityPlugin extends Plugin {
    private static final String DOMAIN = "wander-cloud-backup-v1";

    private String sha256(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder output = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) output.append(String.format("%02x", item & 0xff));
        return output.toString();
    }

    @PluginMethod
    public void getIdentity(PluginCall call) {
        try {
            String androidId = Settings.Secure.getString(
                getContext().getContentResolver(),
                Settings.Secure.ANDROID_ID
            );
            if (androidId == null || androidId.trim().isEmpty()) {
                call.reject("Android did not provide a stable device identifier.", "IDENTITY_UNAVAILABLE");
                return;
            }

            String packageName = getContext().getPackageName();
            String deviceKey = sha256(DOMAIN + "|" + packageName + "|" + androidId.trim());
            JSObject result = new JSObject();
            result.put("deviceKey", deviceKey);
            result.put("deviceLabel", deviceKey.substring(0, 8).toUpperCase());
            result.put("source", "android_id_scoped");
            result.put("recoverableAfterReinstall", true);
            result.put("schemaVersion", 1);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not create the cloud backup identity.", "IDENTITY_ERROR", error);
        }
    }
}
