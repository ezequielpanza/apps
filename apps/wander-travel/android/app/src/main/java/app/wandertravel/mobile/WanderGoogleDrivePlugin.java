package app.wandertravel.mobile;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.common.Scopes;
import com.google.android.gms.common.api.Scope;

import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "WanderGoogleDrive")
public class WanderGoogleDrivePlugin extends Plugin {
    private static final int PICK_STORAGE_REQUEST_CODE = 41936;
    private static final List<Scope> DRIVE_FILE_SCOPES = Collections.singletonList(new Scope(Scopes.DRIVE_FILE));

    private static WanderGoogleDrivePlugin activeInstance;
    private PluginCall pendingPickerCall;

    @Override
    public void load() {
        activeInstance = this;
    }

    private AuthorizationClient authorizationClient() {
        return Identity.getAuthorizationClient(getActivity());
    }

    private AuthorizationRequest driveFileRequest(boolean picker) {
        AuthorizationRequest.Builder builder = AuthorizationRequest.builder()
            .setRequestedScopes(DRIVE_FILE_SCOPES)
            .setOptOutIncludingGrantedScopes(true);

        if (picker) {
            builder
                .setPrompt(AuthorizationRequest.Prompt.CONSENT | AuthorizationRequest.Prompt.SELECT_ACCOUNT)
                .addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_OAUTH_TRIGGER, "true")
                .addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_ALLOW_FOLDER_SELECTION, "true")
                .addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_ALLOW_MULTIPLE, "false")
                .addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_MIMETYPES, "application/vnd.google-apps.folder");
        }
        return builder.build();
    }

    @PluginMethod
    public void pickStorageFolder(PluginCall call) {
        if (pendingPickerCall != null) {
            call.reject("A Google Drive folder selection is already in progress.", "PICKER_BUSY");
            return;
        }

        authorizationClient().authorize(driveFileRequest(true))
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    PendingIntent pendingIntent = result.getPendingIntent();
                    if (pendingIntent == null) {
                        call.reject("Google authorization did not provide a picker resolution.", "PICKER_UNAVAILABLE");
                        return;
                    }
                    pendingPickerCall = call;
                    try {
                        getActivity().startIntentSenderForResult(
                            pendingIntent.getIntentSender(),
                            PICK_STORAGE_REQUEST_CODE,
                            null,
                            0,
                            0,
                            0
                        );
                    } catch (Exception error) {
                        pendingPickerCall = null;
                        call.reject("Could not open the Google Drive folder picker.", "PICKER_OPEN_FAILED", error);
                    }
                    return;
                }
                resolveAuthorization(call, result, true);
            })
            .addOnFailureListener(error -> call.reject(
                "Google Drive authorization failed.",
                "AUTHORIZATION_FAILED",
                error
            ));
    }

    @PluginMethod
    public void getAccessToken(PluginCall call) {
        authorizationClient().authorize(driveFileRequest(false))
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    call.reject("Google Drive authorization requires user interaction.", "AUTH_REQUIRED");
                    return;
                }
                resolveAuthorization(call, result, false);
            })
            .addOnFailureListener(error -> call.reject(
                "Could not refresh Google Drive authorization.",
                "AUTHORIZATION_FAILED",
                error
            ));
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        RevokeAccessRequest request = RevokeAccessRequest.builder()
            .setScopes(DRIVE_FILE_SCOPES)
            .build();
        authorizationClient().revokeAccess(request)
            .addOnSuccessListener(ignored -> {
                JSObject result = new JSObject();
                result.put("disconnected", true);
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject(
                "Could not revoke Google Drive access.",
                "REVOKE_FAILED",
                error
            ));
    }

    private void resolveAuthorization(PluginCall call, AuthorizationResult result, boolean requireFolder) {
        String accessToken = result.getAccessToken();
        if (accessToken == null || accessToken.trim().isEmpty()) {
            call.reject("Google authorization returned no access token.", "TOKEN_UNAVAILABLE");
            return;
        }

        JSObject payload = new JSObject();
        payload.put("accessToken", accessToken);
        payload.put("scope", Scopes.DRIVE_FILE);
        payload.put("requiresInteraction", false);

        GoogleSignInAccount account = result.toGoogleSignInAccount();
        if (account != null) {
            if (account.getId() != null) payload.put("accountId", account.getId());
            if (account.getEmail() != null) payload.put("accountEmail", account.getEmail());
            if (account.getDisplayName() != null) payload.put("accountName", account.getDisplayName());
        }

        Bundle params = result.getTokenResponseParams();
        String pickedIds = params == null ? null : params.getString("picked_file_ids");
        if (pickedIds != null && !pickedIds.trim().isEmpty()) {
            String firstId = pickedIds.split(",")[0].trim();
            payload.put("pickedFileIds", pickedIds);
            payload.put("folderId", firstId);
        } else if (requireFolder) {
            call.reject("No Google Drive folder was selected.", "FOLDER_NOT_SELECTED");
            return;
        }

        call.resolve(payload);
    }

    public static boolean handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_STORAGE_REQUEST_CODE || activeInstance == null) return false;
        activeInstance.onPickerActivityResult(resultCode, data);
        return true;
    }

    private void onPickerActivityResult(int resultCode, Intent data) {
        PluginCall call = pendingPickerCall;
        pendingPickerCall = null;
        if (call == null) return;

        if (resultCode != Activity.RESULT_OK || data == null) {
            JSObject result = new JSObject();
            result.put("cancelled", true);
            call.resolve(result);
            return;
        }

        try {
            AuthorizationResult authorizationResult = authorizationClient().getAuthorizationResultFromIntent(data);
            resolveAuthorization(call, authorizationResult, true);
        } catch (Exception error) {
            call.reject("Could not read the Google Drive picker result.", "PICKER_RESULT_FAILED", error);
        }
    }
}
