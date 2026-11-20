package com.boatstation.app;

import android.content.Context;
import android.app.DownloadManager;
import android.database.Cursor;
import android.content.Intent;
import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.Environment;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;

import androidx.webkit.WebViewAssetLoader;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Stable native shell: Android/hardware access only. Boat Station itself lives in the PWA. */
public class MainActivityCore extends MainActivityV100 {
    private static final String CORE_VERSION = "1.2.0";
    private static final String WEB_ORIGIN = "https://appassets.androidplatform.net";
    private static final String WEB_URL = WEB_ORIGIN + "/assets/index.html?mode=station";
    private static final int REQ_EXPORT_GPX = 3101;
    private static final int REQ_EXPORT_DIAGNOSTICS_CSV = 3105;
    private static final int REQ_EXPORT_CHART_CSV = 3106;
    private static final int REQ_IMPORT_GPX = 3102;
    private static final int REQ_INSTALL_UNKNOWN_APPS = 3103;
    private static final long SENSOR_PUSH_MS = 250;
    private static final String APK_UPDATE_PREFS = "boat_station_apk_update";
    private static final String APK_DOWNLOAD_ID = "download_id";
    private static final String APK_DOWNLOAD_VERSION = "download_version";

    private WebView coreWebView;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private String pendingGpx = "";
    private String pendingChartCsv = "";
    private String pendingChartCsvName = "BoatStation-historico-baterias.csv";
    private String pendingDiagnosticsCsvName = "BoatStation-diagnostico-baterias.csv";
    private PermissionRequest pendingCameraRequest;
    private SensorManager coreSensorManager;
    private Sensor coreRotationSensor;
    private Sensor coreAccelSensor;
    private long lastSensorPush = 0;
    private float[] latestRotationMatrix = new float[9];
    private float latestHeading = 0f;
    private float latestRoll = 0f;
    private float latestPitch = 0f;
    private double latestMotion = 0d;
    private boolean haveHeading = false;
    private boolean haveAttitude = false;
    private boolean haveMotion = false;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        coreWebView = findWebView(getWindow().getDecorView());
        if (coreWebView == null) return;
        coreWebView.stopLoading();
        initTts();
        coreWebView.addJavascriptInterface(new CoreBridge(), "CoreBridge");
        coreWebView.addJavascriptInterface(new NativeToolsBridge(), "NativeToolsBridge");
        coreWebView.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(final PermissionRequest request){runOnUiThread(()->grantWebCameraPermission(request));}
        });
        WebSettings settings=coreWebView.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(true);settings.setAllowContentAccess(true);settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O)coreWebView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT,false);
        coreSensorManager=(SensorManager)getSystemService(Context.SENSOR_SERVICE);
        if(coreSensorManager!=null){coreRotationSensor=coreSensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);coreAccelSensor=coreSensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);}
        final WebViewAssetLoader assetLoader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        coreWebView.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return request==null?null:assetLoader.shouldInterceptRequest(request.getUrl());}
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return false;}
            @Override public void onPageFinished(WebView view,String url){super.onPageFinished(view,url);announceCore(view);pushSensorFrame(true);}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){super.onReceivedError(view,request,error);if(request!=null&&request.isForMainFrame())showOfflineShell(view);}
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){
                coreWebView=null;
                runOnUiThread(()->{try{view.destroy();}catch(Exception ignored){}try{Intent restart=new Intent(MainActivityCore.this,BoatStationActivity.class);restart.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_NEW_TASK);finish();startActivity(restart);}catch(Exception ignored){}});
                return true;
            }
        });
        coreWebView.loadUrl(WEB_URL);
    }

    private void grantWebCameraPermission(PermissionRequest request){
        boolean asksCamera=false;for(String resource:request.getResources())if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource))asksCamera=true;
        if(!asksCamera){request.deny();return;}
        if(Build.VERSION.SDK_INT<Build.VERSION_CODES.M||checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED){request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});return;}
        pendingCameraRequest=request;
        requestPermissions(new String[]{Manifest.permission.CAMERA},4101);
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==4101){PermissionRequest request=pendingCameraRequest;pendingCameraRequest=null;if(request==null)return;if(grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED)request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else request.deny();}}
    @Override protected void onResume(){super.onResume();if(coreSensorManager!=null){coreSensorManager.unregisterListener(this);if(coreRotationSensor!=null)coreSensorManager.registerListener(this,coreRotationSensor,SensorManager.SENSOR_DELAY_UI);if(coreAccelSensor!=null)coreSensorManager.registerListener(this,coreAccelSensor,SensorManager.SENSOR_DELAY_UI);}lastSensorPush=0;}
    @Override protected void onPause(){if(coreSensorManager!=null)coreSensorManager.unregisterListener(this);super.onPause();}
    @Override public void onSensorChanged(SensorEvent event){if(event==null||event.sensor==null)return;int type=event.sensor.getType();if(type==Sensor.TYPE_ROTATION_VECTOR){float[] r=new float[9],o=new float[3];try{SensorManager.getRotationMatrixFromVector(r,event.values);latestRotationMatrix=r.clone();SensorManager.getOrientation(r,o);float h=(float)Math.toDegrees(o[0]);if(h<0)h+=360f;latestHeading=h;latestPitch=(float)Math.toDegrees(o[1]);latestRoll=(float)Math.toDegrees(o[2]);haveHeading=true;haveAttitude=true;}catch(Exception ignored){}}else if(type==Sensor.TYPE_ACCELEROMETER){double m=Math.sqrt(event.values[0]*event.values[0]+event.values[1]*event.values[1]+event.values[2]*event.values[2]);latestMotion=Math.abs(m-SensorManager.GRAVITY_EARTH);haveMotion=true;}pushSensorFrame(false);}
    private void pushSensorFrame(boolean force){if(coreWebView==null)return;long now=SystemClock.elapsedRealtime();if(!force&&now-lastSensorPush<SENSOR_PUSH_MS)return;if(!haveHeading&&!haveMotion&&!haveAttitude)return;lastSensorPush=now;String heading=haveHeading?String.format(Locale.US,"%.1f",latestHeading):"null",motion=haveMotion?String.format(Locale.US,"%.3f",latestMotion):"null",roll=haveAttitude?String.format(Locale.US,"%.2f",latestRoll):"null",pitch=haveAttitude?String.format(Locale.US,"%.2f",latestPitch):"null";StringBuilder matrix=new StringBuilder("[");for(int i=0;i<9;i++){if(i>0)matrix.append(',');matrix.append(String.format(Locale.US,"%.8f",latestRotationMatrix[i]));}matrix.append(']');String js="(function(){var b=window.BoatStation;if(!b)return;if("+heading+"!==null&&b.updateCompass)b.updateCompass("+heading+");if("+roll+"!==null&&"+pitch+"!==null&&b.updateAttitude)b.updateAttitude({roll:"+roll+",pitch:"+pitch+",matrix:"+matrix+"});if("+motion+"!==null&&b.updateMotion)b.updateMotion("+motion+");window.__bsLastNativeSensor=Date.now();})();";WebView target=coreWebView;if(target!=null)target.post(()->{try{if(coreWebView==target)target.evaluateJavascript(js,null);}catch(Exception ignored){}});}
    private void announceCore(WebView view){view.evaluateJavascript("window.BoatStationCore={mode:'station',coreVersion:'"+CORE_VERSION+"',apkVersion:'"+BuildConfig.VERSION_NAME+"'};window.dispatchEvent(new CustomEvent('boatstation-core-ready',{detail:window.BoatStationCore}));",null);}
    private void showOfflineShell(WebView view){String html="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{margin:0;background:#061522;color:#f4f8fb;font-family:system-ui;display:grid;place-items:center;min-height:100vh}.c{max-width:360px;text-align:center;padding:24px}.b{border:1px solid #24516a;background:#102f45;color:white;border-radius:12px;padding:12px 18px;font-size:16px}</style></head><body><div class='c'><h2>Boat Station</h2><p>No se pudo cargar Boat Station ni una copia en caché.</p><button class='b' onclick=\"CoreBridge.reloadWeb()\">Reintentar</button></div></body></html>";view.loadDataWithBaseURL(WEB_ORIGIN+"/assets/",html,"text/html","UTF-8",null);}
    private android.content.SharedPreferences apkUpdatePreferences(){return getSharedPreferences(APK_UPDATE_PREFS,MODE_PRIVATE);}
    private boolean versionAtLeast(String current,String expected){if(expected==null||expected.trim().isEmpty())return false;String[] a=String.valueOf(current).split("\\."),b=expected.trim().split("\\.");for(int i=0;i<Math.max(a.length,b.length);i++){int x=i<a.length?parseVersionPart(a[i]):0,y=i<b.length?parseVersionPart(b[i]):0;if(x!=y)return x>y;}return true;}
    private int parseVersionPart(String part){String digits=part.replaceAll("[^0-9].*$","");try{return Integer.parseInt(digits);}catch(Exception ignored){return 0;}}
    private void clearApkDownload(){apkUpdatePreferences().edit().remove(APK_DOWNLOAD_ID).remove(APK_DOWNLOAD_VERSION).apply();}
    private String getApkDownloadState(){android.content.SharedPreferences prefs=apkUpdatePreferences();long id=prefs.getLong(APK_DOWNLOAD_ID,-1L);if(id<=0)return "none";String version=prefs.getString(APK_DOWNLOAD_VERSION,"");if(versionAtLeast(BuildConfig.VERSION_NAME,version)){clearApkDownload();return "none";}DownloadManager manager=getSystemService(DownloadManager.class);if(manager==null)return "failed";try(Cursor cursor=manager.query(new DownloadManager.Query().setFilterById(id))){if(cursor==null||!cursor.moveToFirst())return "failed";int column=cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);if(column<0)return "failed";int status=cursor.getInt(column);if(status==DownloadManager.STATUS_SUCCESSFUL)return "ready";if(status==DownloadManager.STATUS_FAILED)return "failed";return "downloading";}catch(Exception ignored){return "failed";}}
    private String getApkDownloadVersion(){return apkUpdatePreferences().getString(APK_DOWNLOAD_VERSION,"");}
    private boolean startApkDownload(String url,String version){try{Uri uri=Uri.parse(url==null?"":url.trim());if(!"https".equalsIgnoreCase(uri.getScheme())||!"boat-station.pages.dev".equalsIgnoreCase(uri.getHost()))return false;DownloadManager manager=getSystemService(DownloadManager.class);if(manager==null)return false;String target=version==null?"":version.trim();String savedVersion=getApkDownloadVersion();String state=getApkDownloadState();if(("downloading".equals(state)||"ready".equals(state))&&target.equals(savedVersion))return true;long previous=apkUpdatePreferences().getLong(APK_DOWNLOAD_ID,-1L);if(previous>0)try{manager.remove(previous);}catch(Exception ignored){}String safe=target.isEmpty()?"latest":target.replaceAll("[^A-Za-z0-9._-]","_");DownloadManager.Request request=new DownloadManager.Request(uri).setTitle("Boat Station "+(target.isEmpty()?"APK":target)).setDescription("Descargando la actualización de Boat Station").setMimeType("application/vnd.android.package-archive").setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);request.setDestinationInExternalFilesDir(this,Environment.DIRECTORY_DOWNLOADS,"BoatStation-"+safe+"-"+System.currentTimeMillis()+".apk");long id=manager.enqueue(request);if(id<=0)return false;apkUpdatePreferences().edit().putLong(APK_DOWNLOAD_ID,id).putString(APK_DOWNLOAD_VERSION,target).apply();return true;}catch(Exception ignored){return false;}}
    private void dispatchApkInstallError(){WebView target=coreWebView;if(target!=null)target.post(()->target.evaluateJavascript("window.dispatchEvent(new Event('boatstation-apk-install-error'));",null));}
    private void openDownloadedApk(){
        try{
            long id=apkUpdatePreferences().getLong(APK_DOWNLOAD_ID,-1L);
            DownloadManager manager=getSystemService(DownloadManager.class);
            if(id<=0||manager==null){dispatchApkInstallError();return;}
            Uri uri=manager.getUriForDownloadedFile(id);
            if(uri==null){dispatchApkInstallError();return;}
            if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O&&!getPackageManager().canRequestPackageInstalls()){
                Intent settings=new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName()));
                startActivityForResult(settings,REQ_INSTALL_UNKNOWN_APPS);
                return;
            }
            Intent install=new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri,"application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(install);
        }catch(Exception ignored){dispatchApkInstallError();}
    }
    private void initTts(){tts=new TextToSpeech(this,status->{if(status==TextToSpeech.SUCCESS&&tts!=null){int result=tts.setLanguage(new Locale("es","AR"));if(result==TextToSpeech.LANG_MISSING_DATA||result==TextToSpeech.LANG_NOT_SUPPORTED)tts.setLanguage(Locale.getDefault());ttsReady=true;applyTtsSettings();WebView target=coreWebView;if(target!=null)target.post(()->target.evaluateJavascript("window.dispatchEvent(new Event('boatstation-tts-voices'));",null));}});}
    private void applyTtsSettings(){if(tts==null)return;try{android.content.SharedPreferences prefs=getSharedPreferences("boat_station_core",MODE_PRIVATE);String selected=prefs.getString("ttsVoice","");float rate=Math.max(.5f,Math.min(2f,prefs.getFloat("ttsRate",1f)));tts.setSpeechRate(rate);if(!selected.isEmpty()&&tts.getVoices()!=null){for(Voice voice:tts.getVoices())if(selected.equals(voice.getName())){tts.setVoice(voice);return;}}tts.setLanguage(new Locale("es","AR"));}catch(Exception ignored){}}
    private String getTtsVoiceList(){JSONArray list=new JSONArray();try{if(tts!=null&&tts.getVoices()!=null)for(Voice voice:tts.getVoices()){if(voice.getLocale()==null||!"es".equalsIgnoreCase(voice.getLocale().getLanguage()))continue;JSONObject item=new JSONObject();item.put("id",voice.getName());item.put("name",voice.getName());item.put("language",voice.getLocale().toLanguageTag());list.put(item);}}catch(Exception ignored){}return list.toString();}
    private void saveTtsSettings(String voice,float rate){String selected=voice==null?"":voice.trim();float speed=Math.max(.5f,Math.min(2f,rate));getSharedPreferences("boat_station_core",MODE_PRIVATE).edit().putString("ttsVoice",selected).putFloat("ttsRate",speed).apply();runOnUiThread(this::applyTtsSettings);}
    private void toneFallback(){try{ToneGenerator tone=new ToneGenerator(AudioManager.STREAM_ALARM,100);tone.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD,1200);new Handler(Looper.getMainLooper()).postDelayed(tone::release,1500);}catch(Exception ignored){}}
    private WebView findWebView(View view){if(view instanceof WebView)return(WebView)view;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){WebView found=findWebView(group.getChildAt(i));if(found!=null)return found;}}return null;}
    private byte[] readBytes(InputStream in)throws Exception{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[16384];int n;while((n=in.read(b))>0)out.write(b,0,n);return out.toByteArray();}
    private void chooseGpxExport(){Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("application/gpx+xml");i.addCategory(Intent.CATEGORY_OPENABLE);i.putExtra(Intent.EXTRA_TITLE,"BoatStation-route.gpx");startActivityForResult(i,REQ_EXPORT_GPX);}
    private void chooseDiagnosticsCsvExport(){Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("text/csv");i.addCategory(Intent.CATEGORY_OPENABLE);i.putExtra(Intent.EXTRA_TITLE,pendingDiagnosticsCsvName);startActivityForResult(i,REQ_EXPORT_DIAGNOSTICS_CSV);}
    private void chooseChartCsvExport(){Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("text/csv");i.addCategory(Intent.CATEGORY_OPENABLE);i.putExtra(Intent.EXTRA_TITLE,pendingChartCsvName);startActivityForResult(i,REQ_EXPORT_CHART_CSV);}
    private void chooseGpxImport(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("*/*");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,REQ_IMPORT_GPX);}
    private boolean write(Uri uri,String text){try(OutputStream o=getContentResolver().openOutputStream(uri,"wt")){if(o==null)return false;o.write((text==null?"":text).getBytes(StandardCharsets.UTF_8));o.flush();return true;}catch(Exception e){return false;}}
    private void exportChartCsv(Uri uri){final String csv=pendingChartCsv;pendingChartCsv="";new Thread(()->{boolean ok=write(uri,csv);runOnUiThread(()->{if(coreWebView!=null)coreWebView.evaluateJavascript("window.dispatchEvent(new CustomEvent('boatstation-chart-csv-exported',{detail:{ok:"+ok+"}}));",null);});},"battery-history-csv-export").start();}
    private void exportDiagnosticsCsv(Uri uri){new Thread(()->{boolean ok=false;try(OutputStream output=getContentResolver().openOutputStream(uri,"wt")){if(output!=null){BatteryDiagnosticsStore.get(getApplicationContext()).exportCsv(output);output.flush();ok=true;}}catch(Exception ignored){}final boolean success=ok;runOnUiThread(()->{if(coreWebView!=null)coreWebView.evaluateJavascript("window.dispatchEvent(new CustomEvent('boatstation-csv-exported',{detail:{ok:"+success+"}}));",null);});},"battery-diagnostics-csv-export").start();}
    private String read(Uri uri){try(InputStream in=getContentResolver().openInputStream(uri)){return in==null?"":new String(readBytes(in),StandardCharsets.UTF_8);}catch(Exception e){return"";}}
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        IntentResult qr=IntentIntegrator.parseActivityResult(requestCode,resultCode,data);
        if(qr!=null){
            String value=qr.getContents()==null?"":qr.getContents();
            WebView target=coreWebView;
            if(target!=null)target.post(()->target.evaluateJavascript("window.dispatchEvent(new CustomEvent('boatstation-qr-scanned',{detail:{value:"+JSONObject.quote(value)+"}}));",null));
            return;
        }
        if(requestCode==REQ_INSTALL_UNKNOWN_APPS){
            if(Build.VERSION.SDK_INT<Build.VERSION_CODES.O||getPackageManager().canRequestPackageInstalls())openDownloadedApk();
            else dispatchApkInstallError();
            return;
        }
        if(requestCode==REQ_EXPORT_DIAGNOSTICS_CSV&&(resultCode!=RESULT_OK||data==null||data.getData()==null)){pendingDiagnosticsCsvName="BoatStation-diagnostico-baterias.csv";return;}
        if(requestCode==REQ_EXPORT_CHART_CSV&&(resultCode!=RESULT_OK||data==null||data.getData()==null)){pendingChartCsv="";pendingChartCsvName="BoatStation-historico-baterias.csv";return;}
        if(resultCode!=RESULT_OK||data==null||data.getData()==null)return;
        Uri uri=data.getData();
        if(requestCode==REQ_EXPORT_DIAGNOSTICS_CSV){exportDiagnosticsCsv(uri);pendingDiagnosticsCsvName="BoatStation-diagnostico-baterias.csv";}
        else if(requestCode==REQ_EXPORT_CHART_CSV){exportChartCsv(uri);pendingChartCsvName="BoatStation-historico-baterias.csv";}
        else if(requestCode==REQ_EXPORT_GPX){boolean ok=write(uri,pendingGpx);pendingGpx="";if(coreWebView!=null)coreWebView.evaluateJavascript("window.dispatchEvent(new CustomEvent('boatstation-gpx-exported',{detail:{ok:"+ok+"}}));",null);}
        else if(requestCode==REQ_IMPORT_GPX){String raw=read(uri);if(coreWebView!=null)coreWebView.evaluateJavascript("window.dispatchEvent(new CustomEvent('boatstation-gpx-imported',{detail:{gpx:"+JSONObject.quote(raw)+"}}));",null);}
    }

    public class CoreBridge {
        @JavascriptInterface public String getCoreVersion(){return CORE_VERSION;}
        @JavascriptInterface public String getApkVersion(){return BuildConfig.VERSION_NAME;}
        @JavascriptInterface public String getMode(){return"station";}
        @JavascriptInterface public void downloadApk(final String url){if(url==null||url.trim().isEmpty())return;runOnUiThread(()->{try{Intent i=new Intent(Intent.ACTION_VIEW,Uri.parse(url));i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(i);}catch(Exception ignored){}});}
        @JavascriptInterface public boolean startApkDownload(final String url,final String version){return MainActivityCore.this.startApkDownload(url,version);}
        @JavascriptInterface public String getApkDownloadState(){return MainActivityCore.this.getApkDownloadState();}
        @JavascriptInterface public String getApkDownloadVersion(){return MainActivityCore.this.getApkDownloadVersion();}
        @JavascriptInterface public boolean installDownloadedApk(){runOnUiThread(MainActivityCore.this::openDownloadedApk);return true;}
        @JavascriptInterface public String getCapabilities(){try{JSONObject o=new JSONObject();o.put("location",true);o.put("bluetooth",true);o.put("sensors",true);o.put("storage",true);o.put("camera",true);o.put("microphone",true);o.put("notifications",true);o.put("wifi",true);o.put("usb",true);o.put("nfc",true);o.put("tts",true);o.put("wakeLock",true);o.put("background",true);o.put("qr",true);o.put("gpx",true);return o.toString();}catch(Exception e){return"{}";}}
        @JavascriptInterface public void shareText(final String subject,final String text){runOnUiThread(()->{try{Intent send=new Intent(Intent.ACTION_SEND);send.setType("text/plain");send.putExtra(Intent.EXTRA_SUBJECT,subject==null?"Boat Station":subject);send.putExtra(Intent.EXTRA_TEXT,text==null?"":text);startActivity(Intent.createChooser(send,"Compartir Boat Station"));}catch(Exception ignored){}});}
        @JavascriptInterface public boolean isTtsReady(){return ttsReady;}
        @JavascriptInterface public String getTtsVoices(){return getTtsVoiceList();}
        @JavascriptInterface public void setTtsSettings(final String voice,final float rate){saveTtsSettings(voice,rate);}
        @JavascriptInterface public void restartSensors(){runOnUiThread(()->{if(coreSensorManager==null)return;coreSensorManager.unregisterListener(MainActivityCore.this);if(coreRotationSensor!=null)coreSensorManager.registerListener(MainActivityCore.this,coreRotationSensor,SensorManager.SENSOR_DELAY_UI);if(coreAccelSensor!=null)coreSensorManager.registerListener(MainActivityCore.this,coreAccelSensor,SensorManager.SENSOR_DELAY_UI);lastSensorPush=0;pushSensorFrame(true);});}
        @JavascriptInterface public void speak(final String text){runOnUiThread(()->{if(tts!=null&&ttsReady&&text!=null&&!text.trim().isEmpty()){applyTtsSettings();tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,"boat-station-tts");}});}
        @JavascriptInterface public void alarm(final String text){runOnUiThread(()->{if(tts!=null&&ttsReady&&text!=null&&!text.trim().isEmpty()){applyTtsSettings();tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,"boat-station-alarm");}else toneFallback();});}
        @JavascriptInterface public void stopSpeaking(){runOnUiThread(()->{if(tts!=null)tts.stop();});}
        @JavascriptInterface public void reloadWeb(){runOnUiThread(()->{if(coreWebView!=null){coreWebView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);coreWebView.loadUrl(WEB_URL+"&t="+System.currentTimeMillis());}});}
    }
    public class NativeToolsBridge {
        @JavascriptInterface public String qrDataUrl(String payload){try{BitMatrix m=new MultiFormatWriter().encode(payload,BarcodeFormat.QR_CODE,640,640);Bitmap bmp=Bitmap.createBitmap(640,640,Bitmap.Config.ARGB_8888);for(int y=0;y<640;y++)for(int x=0;x<640;x++)bmp.setPixel(x,y,m.get(x,y)?0xFF000000:0xFFFFFFFF);ByteArrayOutputStream out=new ByteArrayOutputStream();bmp.compress(Bitmap.CompressFormat.PNG,100,out);return"data:image/png;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);}catch(Exception e){return"";}}
        @JavascriptInterface public String appVersion(){return BuildConfig.VERSION_NAME;}
        @JavascriptInterface public void scanQr(){runOnUiThread(()->{try{IntentIntegrator scanner=new IntentIntegrator(MainActivityCore.this);scanner.setDesiredBarcodeFormats(IntentIntegrator.QR_CODE);scanner.setPrompt("Escaneá el QR de Boat Station");scanner.setBeepEnabled(false);scanner.setOrientationLocked(true);scanner.initiateScan();}catch(Exception ignored){}});}
        @JavascriptInterface public void exportGpx(String gpx){pendingGpx=gpx==null?"":gpx;runOnUiThread(MainActivityCore.this::chooseGpxExport);}
        @JavascriptInterface public void exportBatteryDiagnosticsCsv(String filename){String name=filename==null?"BoatStation-diagnostico-baterias.csv":filename.trim().replaceAll("[^A-Za-z0-9._-]","_");pendingDiagnosticsCsvName=name.toLowerCase(java.util.Locale.ROOT).endsWith(".csv")?name:name+".csv";runOnUiThread(MainActivityCore.this::chooseDiagnosticsCsvExport);}
        @JavascriptInterface public void exportCsvText(String filename,String csv){String name=filename==null?"BoatStation-historico-baterias.csv":filename.trim().replaceAll("[^A-Za-z0-9._-]","_");pendingChartCsvName=name.toLowerCase(java.util.Locale.ROOT).endsWith(".csv")?name:name+".csv";pendingChartCsv=csv==null?"":csv;runOnUiThread(MainActivityCore.this::chooseChartCsvExport);}
        @JavascriptInterface public void importGpx(){runOnUiThread(MainActivityCore.this::chooseGpxImport);}
    }
    @Override protected void onDestroy(){if(coreSensorManager!=null)coreSensorManager.unregisterListener(this);if(tts!=null){tts.stop();tts.shutdown();}coreWebView=null;super.onDestroy();}
}
