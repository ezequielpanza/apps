package com.boatstation.app;

import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.database.Cursor;
import android.provider.Settings;
import android.widget.Toast;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageInstaller.Session;
import android.content.pm.PackageInstaller.SessionParams;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.InputStream;
import java.io.OutputStream;

public class BoatStationActivity extends MainActivityCore {
    private String lastRemoteConfig="";
    private String lastClientConfig="";
    private boolean clientSyncClearSent=false;
    private BatteryScannerBridge batteryScannerBridge;
    private static final String UPDATE_PREFS="boatstation_update", UPDATE_ID="download_id";
    private static final String INSTALL_SESSION_ID=PackageInstallStatusReceiver.INSTALL_SESSION_ID;
    private static final String PENDING_CONFIRMATION_URI=PackageInstallStatusReceiver.PENDING_CONFIRMATION_URI;
    private static final String PENDING_SESSION_ID=PackageInstallStatusReceiver.PENDING_SESSION_ID;
    private static volatile boolean activityVisible=false;
    private static volatile boolean installInProgress=false;
    private boolean waitingForInstallPermission=false;
    private final BroadcastReceiver updateReceiver=new BroadcastReceiver(){public void onReceive(Context c,Intent i){if(i!=null&&DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(i.getAction())&&i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1)==getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE).getLong(UPDATE_ID,-1)&&activityVisible)checkUpdateDownload();}};
    private final BroadcastReceiver installUiReceiver=new BroadcastReceiver(){public void onReceive(Context c,Intent i){if(i!=null&&PackageInstallStatusReceiver.ACTION_USER_CONFIRMATION.equals(i.getAction())){Intent confirmation=i.getParcelableExtra(Intent.EXTRA_INTENT);if(confirmation!=null&&activityVisible)launchInstallConfirmation(confirmation);}}};

    public static boolean isActivityVisible(){return activityVisible;}

    private boolean launchPendingInstallConfirmation(){
        String uri=getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE).getString(PENDING_CONFIRMATION_URI,null);
        if(uri==null||uri.isEmpty())return false;
        try{launchInstallConfirmation(Intent.parseUri(uri,Intent.URI_INTENT_SCHEME));return true;}
        catch(Exception e){Toast.makeText(this,"Android necesita confirmar la actualización. Abrí Boat Station para continuar.",Toast.LENGTH_LONG).show();return false;}
    }

    private void launchInstallConfirmation(Intent confirmation){
        try{
            SharedPreferences prefs=getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE);
            int sessionId=prefs.getInt(PENDING_SESSION_ID,-1);
            startActivity(confirmation);
            prefs.edit().remove(PENDING_CONFIRMATION_URI).apply();
            NotificationManager manager=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
            if(manager!=null&&sessionId>=0)manager.cancel(sessionId);
        }catch(Exception e){
            SharedPreferences prefs=getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE);
            int sessionId=prefs.getInt(PENDING_SESSION_ID,-1);
            PackageInstallStatusReceiver.notifyUser(this,"Boat Station","Android necesita confirmar la actualización.",sessionId,confirmation);
            Toast.makeText(this,"No se pudo abrir la confirmación de Android. Intentá desde la notificación de Boat Station.",Toast.LENGTH_LONG).show();
        }
    }

    private void checkUpdateDownload(){
        SharedPreferences prefs=getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE);
        if(installInProgress||prefs.getInt(INSTALL_SESSION_ID,-1)>=0)return;
        long id=prefs.getLong(UPDATE_ID,-1);if(id<0)return;
        DownloadManager dm=(DownloadManager)getSystemService(Context.DOWNLOAD_SERVICE);if(dm==null)return;
        try(Cursor c=dm.query(new DownloadManager.Query().setFilterById(id))){
            if(c==null||!c.moveToFirst())return;
            int status=c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if(status==DownloadManager.STATUS_FAILED){prefs.edit().remove(UPDATE_ID).apply();Toast.makeText(this,"No se pudo descargar la actualización",Toast.LENGTH_LONG).show();return;}
            if(status!=DownloadManager.STATUS_SUCCESSFUL)return;
            Uri uri=dm.getUriForDownloadedFile(id);if(uri==null)return;
            if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O&&!getPackageManager().canRequestPackageInstalls()){
                waitingForInstallPermission=true;
                Toast.makeText(this,"Permití instalar aplicaciones desde Boat Station",Toast.LENGTH_LONG).show();
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())));
                return;
            }
            long size=c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            beginPackageInstallerSession(uri,id,size);
        }catch(Exception e){Toast.makeText(this,"No se pudo iniciar la instalación. La APK sigue en Descargas.",Toast.LENGTH_LONG).show();}
    }

    private void beginPackageInstallerSession(Uri uri,long downloadId,long totalBytes){
        if(installInProgress)return;
        installInProgress=true;
        new Thread(()->{
            int sessionId=-1;
            boolean committed=false;
            SharedPreferences prefs=getSharedPreferences(UPDATE_PREFS,MODE_PRIVATE);
            try{
                PackageInstaller installer=getPackageManager().getPackageInstaller();
                SessionParams params=new SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(getPackageName());
                if(totalBytes>0)params.setSize(totalBytes);
                if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.S)params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                sessionId=installer.createSession(params);
                prefs.edit().putInt(INSTALL_SESSION_ID,sessionId).apply();
                try(Session session=installer.openSession(sessionId);
                    InputStream input=getContentResolver().openInputStream(uri)){
                    if(input==null)throw new IllegalStateException("No se pudo leer la APK descargada");
                    OutputStream output=session.openWrite("BoatStation.apk",0,totalBytes>0?totalBytes:-1);
                    try{
                        byte[] buffer=new byte[65536];
                        int count;
                        while((count=input.read(buffer))!=-1)output.write(buffer,0,count);
                        session.fsync(output);
                    }finally{output.close();}
                    session.commit(createInstallStatusPendingIntent(sessionId).getIntentSender());
                    committed=true;
                }
                prefs.edit().remove(UPDATE_ID).apply();
            }catch(Exception e){
                if(sessionId>=0&&!committed){try{getPackageManager().getPackageInstaller().abandonSession(sessionId);}catch(Exception ignored){}}
                prefs.edit().remove(INSTALL_SESSION_ID).remove(UPDATE_ID).apply();
                final int failedSession=sessionId;
                runOnUiThread(()->{
                    installInProgress=false;
                    String message="No se pudo preparar la instalación automática. La APK quedó en Descargas.";
                    if(activityVisible)Toast.makeText(BoatStationActivity.this,message,Toast.LENGTH_LONG).show();
                    else PackageInstallStatusReceiver.notifyUser(BoatStationActivity.this,"Boat Station",message,failedSession,null);
                });
                return;
            }
            runOnUiThread(()->installInProgress=false);
        },"boatstation-apk-install").start();
    }

    private PendingIntent createInstallStatusPendingIntent(int sessionId){
        Intent statusIntent=new Intent(this,PackageInstallStatusReceiver.class)
                .setAction(PackageInstallStatusReceiver.ACTION_INSTALL_STATUS)
                .putExtra(PackageInstaller.EXTRA_SESSION_ID,sessionId);
        int flags=PendingIntent.FLAG_UPDATE_CURRENT;
        if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.S)flags|=PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getBroadcast(this,sessionId,statusIntent,flags);
    }

    @Override protected void onResume(){
        super.onResume();
        activityVisible=true;
        if(waitingForInstallPermission){
            waitingForInstallPermission=false;
            if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O&&!getPackageManager().canRequestPackageInstalls())return;
        }
        if(!launchPendingInstallConfirmation())checkUpdateDownload();
    }
    @Override protected void onPause(){activityVisible=false;super.onPause();}

    @Override protected void onCreate(Bundle savedInstanceState){
        super.onCreate(savedInstanceState);IntentFilter updateFilter=new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);if(Build.VERSION.SDK_INT>=33)registerReceiver(updateReceiver,updateFilter,Context.RECEIVER_EXPORTED);else registerReceiver(updateReceiver,updateFilter);IntentFilter installUiFilter=new IntentFilter(PackageInstallStatusReceiver.ACTION_USER_CONFIRMATION);if(Build.VERSION.SDK_INT>=33)registerReceiver(installUiReceiver,installUiFilter,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(installUiReceiver,installUiFilter);startCoreService();WebView webView=findWebView(getWindow().getDecorView());if(webView!=null){webView.addJavascriptInterface(new CoreRuntimeBridge(),"CoreRuntimeBridge");batteryScannerBridge=new BatteryScannerBridge(this,webView);webView.addJavascriptInterface(batteryScannerBridge,"BatteryScannerBridge");}
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
    @Override protected void onDestroy(){try{unregisterReceiver(updateReceiver);}catch(Exception ignored){}try{unregisterReceiver(installUiReceiver);}catch(Exception ignored){}activityVisible=false;try{if(batteryScannerBridge!=null)batteryScannerBridge.stopBatteryScan();}catch(Exception ignored){}batteryScannerBridge=null;super.onDestroy();}
}
