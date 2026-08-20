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
import java.util.Set;

@CapacitorPlugin(name = "WanderGoogleDrive")
public class WanderGoogleDrivePlugin extends Plugin {
    private static final int PICK_STORAGE_REQUEST_CODE = 41936;
    private static final List<Scope> DRIVE_FILE_SCOPES = Collections.singletonList(new Scope(Scopes.DRIVE_FILE));
    private static final String FOLDER_MIME = "application/vnd.google-apps.folder";
    private static final String SHEET_MIME = "application/vnd.google-apps.spreadsheet";

    private static WanderGoogleDrivePlugin activeInstance;
    private PluginCall pendingPickerCall;
    private boolean pendingPickerRequiresSelection;
    private boolean pendingPickerMultiple;
    private String pendingPickerMimeTypes;
    private String pendingPickerFileIds;
    private int pendingPickerAttempt;

    @Override
    public void load() {
        activeInstance = this;
    }

    private AuthorizationClient authorizationClient() {
        return Identity.getAuthorizationClient(getActivity());
    }

    private AuthorizationRequest tokenRequest() {
        return AuthorizationRequest.builder()
            .setRequestedScopes(DRIVE_FILE_SCOPES)
            .setOptOutIncludingGrantedScopes(true)
            .build();
    }

    private AuthorizationRequest pickerRequest(
        boolean multiple,
        String mimeTypes,
        String fileIds,
        boolean selectAccount,
        GoogleSignInAccount account
    ) {
        int prompt = AuthorizationRequest.Prompt.CONSENT;
        if (selectAccount) prompt |= AuthorizationRequest.Prompt.SELECT_ACCOUNT;

        AuthorizationRequest.Builder builder = AuthorizationRequest.builder()
            .setRequestedScopes(DRIVE_FILE_SCOPES)
            .setOptOutIncludingGrantedScopes(true)
            .setPrompt(prompt)
            .addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_OAUTH_TRIGGER, "true")
            .addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_ALLOW_FOLDER_SELECTION, "true")
            .addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_ALLOW_MULTIPLE, multiple ? "true" : "false");

        if (account != null && account.getAccount() != null) builder.setAccount(account.getAccount());
        if (mimeTypes != null && !mimeTypes.trim().isEmpty()) {
            builder.addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_MIMETYPES, mimeTypes.trim());
        }
        if (fileIds != null && !fileIds.trim().isEmpty()) {
            builder.addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_FILE_IDS, fileIds.trim());
        }
        return builder.build();
    }

    private void savePendingPicker(
        PluginCall call,
        boolean requireSelection,
        boolean multiple,
        String mimeTypes,
        String fileIds,
        int attempt
    ) {
        pendingPickerCall = call;
        pendingPickerRequiresSelection = requireSelection;
        pendingPickerMultiple = multiple;
        pendingPickerMimeTypes = mimeTypes;
        pendingPickerFileIds = fileIds;
        pendingPickerAttempt = attempt;
    }

    private boolean launchResolution(
        PluginCall call,
        AuthorizationResult result,
        boolean requireSelection,
        boolean multiple,
        String mimeTypes,
        String fileIds,
        int attempt
    ) {
        if (result == null || !result.hasResolution()) return false;
        PendingIntent pendingIntent = result.getPendingIntent();
        if (pendingIntent == null) {
            call.reject("Google authorization did not provide a picker resolution.", "PICKER_UNAVAILABLE");
            return true;
        }

        savePendingPicker(call, requireSelection, multiple, mimeTypes, fileIds, attempt);
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
            clearPendingPicker();
            call.reject("Could not open the Google Drive picker.", "PICKER_OPEN_FAILED", error);
        }
        return true;
    }

    private void authorizePicker(
        PluginCall call,
        boolean requireSelection,
        boolean multiple,
        String mimeTypes,
        String fileIds,
        boolean selectAccount,
        GoogleSignInAccount account,
        int attempt
    ) {
        authorizationClient().authorize(pickerRequest(multiple, mimeTypes, fileIds, selectAccount, account))
            .addOnSuccessListener(result -> {
                if (launchResolution(call, result, requireSelection, multiple, mimeTypes, fileIds, attempt)) return;
                finishOrContinuePicker(call, result, requireSelection, multiple, mimeTypes, fileIds, attempt);
            })
            .addOnFailureListener(error -> call.reject(
                "Google Drive authorization failed: " + safeMessage(error),
                "AUTHORIZATION_FAILED",
                error
            ));
    }

    private void launchFreshPicker(
        PluginCall call,
        boolean requireSelection,
        boolean multiple,
        String mimeTypes,
        String fileIds
    ) {
        if (pendingPickerCall != null) {
            call.reject("A Google Drive selection is already in progress.", "PICKER_BUSY");
            return;
        }

        // A stale drive.file grant can cause Google Play services to complete the
        // account step without entering One Pick. Revoke only Wander's drive.file
        // grant before a user-initiated selection so every connection starts from
        // the documented consent + Picker path.
        RevokeAccessRequest revoke = RevokeAccessRequest.builder().setScopes(DRIVE_FILE_SCOPES).build();
        authorizationClient().revokeAccess(revoke)
            .addOnCompleteListener(ignored -> authorizePicker(
                call,
                requireSelection,
                multiple,
                mimeTypes,
                fileIds,
                true,
                null,
                0
            ));
    }

    @PluginMethod
    public void pickStorageFolder(PluginCall call) {
        launchFreshPicker(call, true, false, null, null);
    }

    @PluginMethod
    public void pickExistingStorageItems(PluginCall call) {
        String fileIds = call.getString("fileIds", "");
        String mimeTypes = FOLDER_MIME + "," + SHEET_MIME;
        launchFreshPicker(call, true, true, mimeTypes, fileIds);
    }

    @PluginMethod
    public void getAccessToken(PluginCall call) {
        authorizationClient().authorize(tokenRequest())
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    call.reject("Google Drive authorization requires user interaction.", "AUTH_REQUIRED");
                    return;
                }
                resolveAuthorization(call, result, false);
            })
            .addOnFailureListener(error -> call.reject(
                "Could not refresh Google Drive authorization: " + safeMessage(error),
                "AUTHORIZATION_FAILED",
                error
            ));
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        RevokeAccessRequest request = RevokeAccessRequest.builder().setScopes(DRIVE_FILE_SCOPES).build();
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

    private String pickedIds(AuthorizationResult result) {
        Bundle params = result == null ? null : result.getTokenResponseParams();
        String pickedIds = params == null ? null : params.getString("picked_file_ids");
        return pickedIds == null ? null : pickedIds.trim();
    }

    private void finishOrContinuePicker(
        PluginCall call,
        AuthorizationResult result,
        boolean requireSelection,
        boolean multiple,
        String mimeTypes,
        String fileIds,
        int attempt
    ) {
        String selectedIds = pickedIds(result);
        if (!requireSelection || (selectedIds != null && !selectedIds.isEmpty())) {
            resolveAuthorization(call, result, requireSelection);
            return;
        }

        // On some devices the first resolution is only account selection. Continue
        // with the account returned by Google and force consent/One Pick again.
        if (attempt < 2) {
            GoogleSignInAccount account = result == null ? null : result.toGoogleSignInAccount();
            int nextAttempt = attempt + 1;
            getActivity().getWindow().getDecorView().postDelayed(() -> authorizePicker(
                call,
                true,
                multiple,
                mimeTypes,
                fileIds,
                false,
                account,
                nextAttempt
            ), nextAttempt == 1 ? 250 : 700);
            return;
        }

        JSObject details = diagnosticPayload(result, attempt);
        call.reject(
            "Google autorizó la cuenta pero no abrió el selector de Drive. Revisá Google Picker API y el cliente OAuth Android.",
            "PICKER_NOT_RETURNED",
            null,
            details
        );
    }

    private JSObject diagnosticPayload(AuthorizationResult result, int attempt) {
        JSObject details = new JSObject();
        details.put("attempt", attempt);
        details.put("hasResolution", result != null && result.hasResolution());
        details.put("hasAccessToken", result != null && result.getAccessToken() != null && !result.getAccessToken().trim().isEmpty());
        GoogleSignInAccount account = result == null ? null : result.toGoogleSignInAccount();
        if (account != null && account.getEmail() != null) details.put("accountEmail", account.getEmail());
        Bundle params = result == null ? null : result.getTokenResponseParams();
        if (params != null) {
            Set<String> keys = params.keySet();
            details.put("tokenResponseKeys", String.join(",", keys));
            String ids = params.getString("picked_file_ids");
            if (ids != null) details.put("pickedFileIds", ids);
        }
        return details;
    }

    private void resolveAuthorization(PluginCall call, AuthorizationResult result, boolean requireSelection) {
        String accessToken = result == null ? null : result.getAccessToken();
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

        String selectedIds = pickedIds(result);
        if (selectedIds != null && !selectedIds.isEmpty()) {
            payload.put("pickedFileIds", selectedIds);
            payload.put("folderId", selectedIds.split(",")[0].trim());
        } else if (requireSelection) {
            call.reject("No Google Drive item was selected.", "ITEM_NOT_SELECTED");
            return;
        }

        call.resolve(payload);
    }

    private String safeMessage(Exception error) {
        if (error == null || error.getMessage() == null || error.getMessage().trim().isEmpty()) return "unknown error";
        return error.getMessage();
    }

    private void clearPendingPicker() {
        pendingPickerCall = null;
        pendingPickerRequiresSelection = false;
        pendingPickerMultiple = false;
        pendingPickerMimeTypes = null;
        pendingPickerFileIds = null;
        pendingPickerAttempt = 0;
    }

    public static boolean handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_STORAGE_REQUEST_CODE || activeInstance == null) return false;
        activeInstance.onPickerActivityResult(resultCode, data);
        return true;
    }

    private void onPickerActivityResult(int resultCode, Intent data) {
        PluginCall call = pendingPickerCall;
        boolean requireSelection = pendingPickerRequiresSelection;
        boolean multiple = pendingPickerMultiple;
        String mimeTypes = pendingPickerMimeTypes;
        String fileIds = pendingPickerFileIds;
        int attempt = pendingPickerAttempt;
        clearPendingPicker();
        if (call == null) return;

        if (resultCode != Activity.RESULT_OK || data == null) {
            JSObject result = new JSObject();
            result.put("cancelled", true);
            result.put("resultCode", resultCode);
            result.put("attempt", attempt);
            call.resolve(result);
            return;
        }

        try {
            AuthorizationResult authorizationResult = authorizationClient().getAuthorizationResultFromIntent(data);
            if (launchResolution(call, authorizationResult, requireSelection, multiple, mimeTypes, fileIds, attempt)) return;
            finishOrContinuePicker(call, authorizationResult, requireSelection, multiple, mimeTypes, fileIds, attempt);
        } catch (Exception error) {
            call.reject("Could not read the Google Drive picker result: " + safeMessage(error), "PICKER_RESULT_FAILED", error);
        }
    }
}
