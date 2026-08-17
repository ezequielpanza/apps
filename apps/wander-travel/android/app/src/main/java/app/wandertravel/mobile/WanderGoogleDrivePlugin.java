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
    private static final String FOLDER_MIME = "application/vnd.google-apps.folder";
    private static final String SHEET_MIME = "application/vnd.google-apps.spreadsheet";

    private static WanderGoogleDrivePlugin activeInstance;
    private PluginCall pendingPickerCall;
    private boolean pendingPickerRequiresSelection;
    private boolean pendingPickerMultiple;
    private String pendingPickerMimeTypes;
    private String pendingPickerFileIds;
    private boolean pendingPickerCanRetry;

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

        if (account != null && account.getAccount() != null) {
            builder.setAccount(account.getAccount());
        }
        if (mimeTypes != null && !mimeTypes.trim().isEmpty()) {
            builder.addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_MIMETYPES, mimeTypes.trim());
        }
        if (fileIds != null && !fileIds.trim().isEmpty()) {
            builder.addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_FILE_IDS, fileIds.trim());
        }
        return builder.build();
    }

    private void launchPicker(
        PluginCall call,
        AuthorizationRequest request,
        boolean requireSelection,
        boolean multiple,
        String mimeTypes,
        String fileIds,
        boolean canRetry
    ) {
        if (pendingPickerCall != null) {
            call.reject("A Google Drive selection is already in progress.", "PICKER_BUSY");
            return;
        }
        authorizationClient().authorize(request)
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    PendingIntent pendingIntent = result.getPendingIntent();
                    if (pendingIntent == null) {
                        call.reject("Google authorization did not provide a picker resolution.", "PICKER_UNAVAILABLE");
                        return;
                    }
                    pendingPickerCall = call;
                    pendingPickerRequiresSelection = requireSelection;
                    pendingPickerMultiple = multiple;
                    pendingPickerMimeTypes = mimeTypes;
                    pendingPickerFileIds = fileIds;
                    pendingPickerCanRetry = canRetry;
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
                    return;
                }
                resolveAuthorizationOrRetry(
                    call,
                    result,
                    requireSelection,
                    multiple,
                    mimeTypes,
                    fileIds,
                    canRetry
                );
            })
            .addOnFailureListener(error -> call.reject(
                "Google Drive authorization failed.",
                "AUTHORIZATION_FAILED",
                error
            ));
    }

    @PluginMethod
    public void pickStorageFolder(PluginCall call) {
        launchPicker(
            call,
            pickerRequest(false, FOLDER_MIME, null, true, null),
            true,
            false,
            FOLDER_MIME,
            null,
            true
        );
    }

    @PluginMethod
    public void pickExistingStorageItems(PluginCall call) {
        String fileIds = call.getString("fileIds", "");
        String mimeTypes = FOLDER_MIME + "," + SHEET_MIME;
        launchPicker(
            call,
            pickerRequest(true, mimeTypes, fileIds, true, null),
            true,
            true,
            mimeTypes,
            fileIds,
            true
        );
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

    private String pickedIds(AuthorizationResult result) {
        Bundle params = result == null ? null : result.getTokenResponseParams();
        String pickedIds = params == null ? null : params.getString("picked_file_ids");
        return pickedIds == null ? null : pickedIds.trim();
    }

    private void resolveAuthorizationOrRetry(
        PluginCall call,
        AuthorizationResult result,
        boolean requireSelection,
        boolean multiple,
        String mimeTypes,
        String fileIds,
        boolean canRetry
    ) {
        String selectedIds = pickedIds(result);
        if (requireSelection && (selectedIds == null || selectedIds.isEmpty()) && canRetry) {
            GoogleSignInAccount account = result == null ? null : result.toGoogleSignInAccount();
            launchPicker(
                call,
                pickerRequest(multiple, mimeTypes, fileIds, false, account),
                true,
                multiple,
                mimeTypes,
                fileIds,
                false
            );
            return;
        }
        resolveAuthorization(call, result, requireSelection);
    }

    private void resolveAuthorization(PluginCall call, AuthorizationResult result, boolean requireSelection) {
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

    private void clearPendingPicker() {
        pendingPickerCall = null;
        pendingPickerRequiresSelection = false;
        pendingPickerMultiple = false;
        pendingPickerMimeTypes = null;
        pendingPickerFileIds = null;
        pendingPickerCanRetry = false;
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
        boolean canRetry = pendingPickerCanRetry;
        clearPendingPicker();
        if (call == null) return;

        if (resultCode != Activity.RESULT_OK || data == null) {
            JSObject result = new JSObject();
            result.put("cancelled", true);
            call.resolve(result);
            return;
        }

        try {
            AuthorizationResult authorizationResult = authorizationClient().getAuthorizationResultFromIntent(data);
            resolveAuthorizationOrRetry(
                call,
                authorizationResult,
                requireSelection,
                multiple,
                mimeTypes,
                fileIds,
                canRetry
            );
        } catch (Exception error) {
            call.reject("Could not read the Google Drive picker result.", "PICKER_RESULT_FAILED", error);
        }
    }
}
