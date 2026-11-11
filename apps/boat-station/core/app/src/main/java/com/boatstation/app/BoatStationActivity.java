package com.boatstation.app;

import android.app.DownloadManager;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.database.Cursor;
import android.provider.Settings;
import android.widget.Toast;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public class BoatStationActivity extends MainActivityCore {
    private String lastRemoteConfig="";
    private String lastClientConfig="";
    private boolean clientSyncClearSent=false;
    private BatteryScannerBridge batteryScannerBridge;
    private static final String UPDATE_PREFS="boatstation_update", UPDATE_ID="download_id";
    private boolean activityVisible=false,waitingForInstallPermission=false;
    private final BroadcastReceiver updateReceiver=new BroadcastReceiver(){public void onReceive(Context c,Intent i){if(i!=null&&DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(i.getAction())&&i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1)==getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE).getLong(UPDATE_ID,-1)&&activityVisible)checkUpdateDownload();}};
    private void checkUpdateDownload(){
        long id=getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE).getLong(UPDATE_ID,-1);if(id<0)return;
        DownloadManager dm=(DownloadManager)getSystemService(Context.DOWNLOAD_SERVICE);if(dm==null)return;
        try(Cursor c=dm.query(new DownloadManager.Query().setFilterById(id))){
            if(c==null||!c.moveToFirst())return;int status=c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if(status==DownloadManager.STATUS_FAILED){getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE).edit().remove(UPDATE_ID).apply();Toast.makeText(this,"No se pudo descargar la actualización",Toast.LENGTH_LONG).show();return;}
            if(status!=DownloadManager.STATUS_SUCCESSFUL)return;Uri uri=dm.getUriForDownloadedFile(id);if(uri==null)return;
            if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O&&!getPackageManager().canRequestPackageInstalls()){waitingForInstallPermission=true;Toast.makeText(this,"Permití instalar aplicaciones desde Boat Station",Toast.LENGTH_LONG).show();startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())));return;}
            Intent install=new Intent(Intent.ACTION_VIEW);install.setDataAndType(uri,"application/vnd.android.package-archive");install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(install);getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE).edit().remove(UPDATE_ID).apply();
        }catch(Exception e){Toast.makeText(this,"Abrí la APK desde Descargas para instalarla",Toast.LENGTH_LONG).show();}
    }
    @Override protected void onResume(){super.onResume();activityVisible=true;if(waitingForInstallPermission){waitingForInstallPermission=false;if(Build.VERSION.SDK_INT>=26&&!getPackageManager().canRequestPackageInstalls())return;}checkUpdateDownload();}
    @Override protected void onPause(){activityVisible=false;super.onPause();}

    @Override protected void onCreate(Bundle savedInstanceState){
        super.onCreate(savedInstanceState);IntentFilter updateFilter=new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);if(Build.VERSION.SDK_INT>=33)registerReceiver(updateReceiver,updateFilter,Context.RECEIVER_EXPORTED);else registerReceiver(updateReceiver,updateFilter);startCoreService();WebView webView=findWebView(getWindow().getDecorView());if(webView!=null){webView.addJavascriptInterface(new CoreRuntimeBridge(),"CoreRuntimeBridge");batteryScannerBridge=new BatteryScannerBridge(this,webView);webView.addJavascriptInterface(batteryScannerBridge,"BatteryScannerBridge");}
    }
    private void startCoreService(){startCoreServiceIntent(new Intent(this,BoatStationCoreService.class).setAction(BoatStationCoreService.ACTION_START));}
    private void startCoreServiceIntent(Intent intent){if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O)startForegroundService(intent);else startService(intent);}
    private WebView findWebView(View view){if(view instanceof WebView)return(WebView)view;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){WebView found=findWebView(group.getChildAt(i));if(found!=null)return found;}}return null;}

    public final class CoreRuntimeBridge {
        @JavascriptInterface public synchronized void configureRemoteStation(String stationId,String token,String backend,String stationName){String key=String.valueOf(stationId)+"|"+String.valueOf(token)+"|"+String.valueOf(backend)+"|"+String.valueOf(stationName);if(key.equals(lastRemoteConfig))return;lastRemoteConfig=key;lastClientConfig="";clientSyncClearSent=true;Intent intent=new Intent(BoatStationActivity.this,BoatStationCoreService.class).setAction(BoatStationCoreService.ACTION_CONFIGURE_REMOTE).putExtra(BoatStationCoreService.EXTRA_STATION_ID,stationId).putExtra(BoatStationCoreService.EXTRA_TOKEN,token).putExtra(BoatStationCoreService.EXTRA_BACKEND,backend).putExtra(BoatStationCoreService.EXTRA_STATION_NAME,stationName);startCoreServiceIntent(intent);}
        @JavascriptInterface public synchronized void configureRemoteClient(String stationId,String token,String backend,String clientName,String clientId){String key=String.valueOf(stationId)+"|"+String.valueOf(token)+"|"+String.valueOf(backend)+"|"+String.valueOf(clientName)+"|"+String.valueOf(clientId);if(key.equals(lastClientConfig))return;lastClientConfig=key;lastRemoteConfig="";clientSyncClearSent=false;Intent intent=new Intent(BoatStationActivity.this,BoatStationCoreService.class).setAction(BoatStationCoreService.ACTION_CONFIGURE_CLIENT).putExtra(BoatStationCoreService.EXTRA_STATION_ID,stationId).putExtra(BoatStationCoreService.EXTRA_TOKEN,token).putExtra(BoatStationCoreService.EXTRA_BACKEND,backend).putExtra(BoatStationCoreService.EXTRA_STATION_NAME,clientName).putExtra(BoatStationCoreService.EXTRA_CLIENT_ID,clientId);startCoreServiceIntent(intent);}
        @JavascriptInterface public void publishStationSnapshot(String snapshot){BoatStationCoreService.updateStationSnapshot(snapshot);}
        @JavascriptInterface public String getLatestRemoteState(){return BoatStationCoreService.getLatestRemoteState();}
        @JavascriptInterface public synchronized void clearRemoteClient(){if(clientSyncClearSent)return;clientSyncClearSent=true;lastClientConfig="";lastRemoteConfig="";Intent intent=new Intent(BoatStationActivity.this,BoatStationCoreService.class).setAction(BoatStationCoreService.ACTION_CLEAR_REMOTE_SYNC);startCoreServiceIntent(intent);}
        @JavascriptInterface public boolean downloadApk(String url,String version){if(url==null||url.trim().isEmpty())return false;try{String v=version==null||version.trim().isEmpty()?"update":version.trim(),fileName="BoatStation-"+v+"-"+System.currentTimeMillis()+".apk";DownloadManager.Request request=new DownloadManager.Request(Uri.parse(url));request.setTitle("Boat Station "+v);request.setDescription("Descargando actualización");request.setMimeType("application/vnd.android.package-archive");request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);request.setAllowedOverMetered(true);request.setAllowedOverRoaming(true);request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,fileName);DownloadManager dm=(DownloadManager)getSystemService(Context.DOWNLOAD_SERVICE);if(dm==null)return false;long downloadId=dm.enqueue(request);getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE).edit().putLong(UPDATE_ID,downloadId).apply();return true;}catch(Exception ignored){return false;}}
    }
    @Override protected void onDestroy(){try{unregisterReceiver(updateReceiver);}catch(Exception ignored){}try{if(batteryScannerBridge!=null)batteryScannerBridge.stopBatteryScan();}catch(Exception ignored){}batteryScannerBridge=null;super.onDestroy();}
}
