package com.boatstation.app;

import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Native storage/backup capabilities used by the production Core. No UI is loaded here. */
public class MainActivityV100 extends MainActivity {
    private static final int REQ_FOLDER = 1100;
    private static final int REQ_EXPORT_ZIP = 1101;
    private static final int REQ_IMPORT_ZIP = 1102;
    private static final String PREFS = "boat_station";
    private static final String DATA_FOLDER = "data_folder_uri";
    private static final String LAST_BACKUP = "last_backup_time";
    private static final String BACKUP_NAME = "boat-station-config.json";
    private WebView appWebView;
    private String pendingExportJson = "";

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(Color.rgb(6,21,34));
        w.setNavigationBarColor(Color.rgb(6,21,34));
        if (Build.VERSION.SDK_INT >= 30) w.setDecorFitsSystemWindows(false);
        View root = findViewById(android.R.id.content);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top = Build.VERSION.SDK_INT >= 30 ? insets.getInsets(WindowInsets.Type.statusBars()).top : insets.getSystemWindowInsetTop();
            v.setPadding(0, top, 0, 0);
            return insets;
        });
        root.requestApplyInsets();
        appWebView = findWebView(root);
        if (appWebView != null) {
            appWebView.setPadding(0,0,0,0);
            appWebView.addJavascriptInterface(new StorageBridge(), "StorageBridge");
        }
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup g=(ViewGroup)view;
            for(int i=0;i<g.getChildCount();i++){WebView w=findWebView(g.getChildAt(i));if(w!=null)return w;}
        }
        return null;
    }

    private void chooseFolder() {
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(i,REQ_FOLDER);
    }
    private void chooseExportZip() {
        Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.setType("application/zip");
        i.putExtra(Intent.EXTRA_TITLE,"BoatStation-backup.zip");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(i,REQ_EXPORT_ZIP);
    }
    private void chooseImportZip() {
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.setType("application/zip");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(i,REQ_IMPORT_ZIP);
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(resultCode!=RESULT_OK||data==null||data.getData()==null)return;
        Uri uri=data.getData();
        if(requestCode==REQ_FOLDER){
            int flags=data.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try{getContentResolver().takePersistableUriPermission(uri,flags);}catch(Exception ignored){}
            getSharedPreferences(PREFS,MODE_PRIVATE).edit().putString(DATA_FOLDER,uri.toString()).apply();
            boolean has=findFile(treeDoc(uri),BACKUP_NAME)!=null;
            String label=folderLabel(uri);
            eval("window.BoatStation&&BoatStation.onDataFolderChanged&&BoatStation.onDataFolderChanged("+JSONObject.quote(label)+","+has+")");
        } else if(requestCode==REQ_EXPORT_ZIP){
            boolean ok=exportZipTo(uri,pendingExportJson);
            pendingExportJson="";
            eval("window.BoatStation&&BoatStation.onZipExported&&BoatStation.onZipExported("+ok+")");
        } else if(requestCode==REQ_IMPORT_ZIP){
            String config=importZipFrom(uri);
            eval("window.BoatStation&&BoatStation.onZipImported&&BoatStation.onZipImported("+JSONObject.quote(config)+")");
        }
    }

    private void eval(String js){if(appWebView!=null)appWebView.post(()->appWebView.evaluateJavascript(js,null));}
    private Uri folderUri(){String s=getSharedPreferences(PREFS,MODE_PRIVATE).getString(DATA_FOLDER,"");try{return s.isEmpty()?null:Uri.parse(s);}catch(Exception e){return null;}}
    private String folderLabel(Uri uri){try{String id=DocumentsContract.getTreeDocumentId(uri);int p=id.lastIndexOf(':');String x=p>=0?id.substring(p+1):id;return x==null||x.isEmpty()?"Documents":x;}catch(Exception e){return "Boat Station";}}
    private Uri treeDoc(Uri tree){return DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));}
    private Uri childList(Uri dir){return DocumentsContract.buildChildDocumentsUriUsingTree(dir,DocumentsContract.getDocumentId(dir));}
    private Uri findFile(Uri dir,String name){if(dir==null)return null;Cursor c=null;try{c=getContentResolver().query(childList(dir),new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null);if(c!=null)while(c.moveToNext())if(name.equals(c.getString(1)))return DocumentsContract.buildDocumentUriUsingTree(dir,c.getString(0));}catch(Exception ignored){}finally{if(c!=null)c.close();}return null;}
    private Uri ensureDir(Uri parent,String name){Uri x=findFile(parent,name);if(x!=null)return x;try{return DocumentsContract.createDocument(getContentResolver(),parent,DocumentsContract.Document.MIME_TYPE_DIR,name);}catch(Exception e){return null;}}
    private Uri ensureFile(Uri parent,String mime,String name){Uri x=findFile(parent,name);if(x!=null)return x;try{return DocumentsContract.createDocument(getContentResolver(),parent,mime,name);}catch(Exception e){return null;}}
    private boolean writeText(Uri file,String text,boolean append){try(OutputStream o=getContentResolver().openOutputStream(file,append?"wa":"wt")){if(o==null)return false;o.write(text.getBytes(StandardCharsets.UTF_8));o.flush();return true;}catch(Exception e){return false;}}
    private String readText(Uri file){StringBuilder s=new StringBuilder();try(BufferedReader r=new BufferedReader(new InputStreamReader(getContentResolver().openInputStream(file),StandardCharsets.UTF_8))){String l;while((l=r.readLine())!=null)s.append(l).append('\n');return s.toString();}catch(Exception e){return "";}}
    private byte[] readBytes(InputStream in)throws Exception{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[16384];int n;while((n=in.read(b))>0)out.write(b,0,n);return out.toByteArray();}
    private String f(double v,int n){return String.format(Locale.US,"%."+n+"f",v);}
    private String iso(long ms){return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX",Locale.US).format(new Date(ms));}

    private boolean exportZipTo(Uri target,String configJson){try(OutputStream raw=getContentResolver().openOutputStream(target,"wt"); ZipOutputStream zip=new ZipOutputStream(raw)){zip.putNextEntry(new ZipEntry("config/boat-station-config.json"));zip.write(configJson.getBytes(StandardCharsets.UTF_8));zip.closeEntry();Uri tree=folderUri();if(tree!=null)zipDirectory(zip,treeDoc(tree),"data/");zip.finish();return true;}catch(Exception e){return false;}}
    private void zipDirectory(ZipOutputStream zip,Uri dir,String prefix)throws Exception{Cursor c=null;try{c=getContentResolver().query(childList(dir),new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE},null,null,null);if(c==null)return;while(c.moveToNext()){Uri child=DocumentsContract.buildDocumentUriUsingTree(dir,c.getString(0));String name=c.getString(1),mime=c.getString(2);if(DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)){zipDirectory(zip,child,prefix+name+"/");}else{zip.putNextEntry(new ZipEntry(prefix+name));try(InputStream in=getContentResolver().openInputStream(child)){if(in!=null){byte[] b=new byte[16384];int n;while((n=in.read(b))>0)zip.write(b,0,n);}}zip.closeEntry();}}}finally{if(c!=null)c.close();}}
    private String importZipFrom(Uri source){String config="";Uri root=folderUri()==null?null:treeDoc(folderUri());try(InputStream raw=getContentResolver().openInputStream(source);ZipInputStream zin=new ZipInputStream(raw)){ZipEntry e;while((e=zin.getNextEntry())!=null){String n=e.getName();if(e.isDirectory()){zin.closeEntry();continue;}byte[] bytes=readBytes(zin);if("config/boat-station-config.json".equals(n)){config=new String(bytes,StandardCharsets.UTF_8);}else if(root!=null&&n.startsWith("data/")){writeImportedFile(root,n.substring(5),bytes);}zin.closeEntry();}}catch(Exception ignored){}return config;}
    private void writeImportedFile(Uri root,String relative,byte[] bytes){try{String[] parts=relative.split("/");Uri dir=root;for(int i=0;i<parts.length-1;i++){if(!parts[i].isEmpty())dir=ensureDir(dir,parts[i]);if(dir==null)return;}String name=parts[parts.length-1];if(name.isEmpty())return;Uri f=ensureFile(dir,name.endsWith(".csv")?"text/csv":"application/octet-stream",name);try(OutputStream o=getContentResolver().openOutputStream(f,"wt")){if(o!=null)o.write(bytes);}}catch(Exception ignored){}}

    public class StorageBridge {
        @JavascriptInterface public void chooseDataFolder(){runOnUiThread(MainActivityV100.this::chooseFolder);}
        @JavascriptInterface public boolean hasDataFolder(){return folderUri()!=null;}
        @JavascriptInterface public String getDataFolderLabel(){Uri u=folderUri();return u==null?"":folderLabel(u);}
        @JavascriptInterface public long getLastBackupTime(){return getSharedPreferences(PREFS,MODE_PRIVATE).getLong(LAST_BACKUP,0);}
        @JavascriptInterface public boolean saveBackup(String json){Uri tree=folderUri();if(tree==null)return false;Uri file=ensureFile(treeDoc(tree),"application/json",BACKUP_NAME);boolean ok=file!=null&&writeText(file,json,false);if(ok)getSharedPreferences(PREFS,MODE_PRIVATE).edit().putLong(LAST_BACKUP,System.currentTimeMillis()).apply();return ok;}
        @JavascriptInterface public String loadBackup(){Uri tree=folderUri();if(tree==null)return "";Uri file=findFile(treeDoc(tree),BACKUP_NAME);return file==null?"":readText(file);}
        @JavascriptInterface public void exportZip(String json){pendingExportJson=json==null?"":json;runOnUiThread(MainActivityV100.this::chooseExportZip);}
        @JavascriptInterface public void importZip(){runOnUiThread(MainActivityV100.this::chooseImportZip);}
        @JavascriptInterface public void restoreNativeConfig(String banks,String batteries){try{new JSONArray(banks);new JSONArray(batteries);getSharedPreferences(PREFS,MODE_PRIVATE).edit().putString("battery_banks_v1",banks).putString("battery_configs_v2",batteries).apply();}catch(Exception ignored){}}
        @JavascriptInterface public void restartApp(){runOnUiThread(()->{Intent i=getIntent();finish();startActivity(i);});}
        @JavascriptInterface public void appendBatteryLog(String payload){Uri tree=folderUri();if(tree==null)return;try{JSONObject p=new JSONObject(payload),b=p.getJSONObject("battery"),bank=p.optJSONObject("bank");Uri root=treeDoc(tree),logs=ensureDir(root,"logs"),bdir=logs==null?null:ensureDir(logs,"batteries");if(bdir==null)return;int id=b.optInt("id",0);long t=b.optLong("time",System.currentTimeMillis());String fileName="battery-"+id+".csv";Uri file=findFile(bdir,fileName);boolean fresh=file==null;if(fresh)file=ensureFile(bdir,"text/csv",fileName);if(file==null)return;StringBuilder row=new StringBuilder();if(fresh)row.append("timestamp;battery_id;bank_id;soc;remaining_ah;capacity_ah;voltage;current;power;temperature;connected\n");row.append(iso(t)).append(';').append(id).append(';').append(b.optInt("bankId",0)).append(';').append(f(b.optDouble("soc",0),2)).append(';').append(f(b.optDouble("remainingAh",0),3)).append(';').append(f(b.optDouble("totalAh",b.optDouble("capacityAh",0)),3)).append(';').append(f(b.optDouble("voltage",0),3)).append(';').append(f(b.optDouble("current",0),3)).append(';').append(f(b.optDouble("power",0),3)).append(';').append(f(b.optDouble("temperature",0),2)).append(';').append(b.optBoolean("connected",true)?"1":"0").append('\n');writeText(file,row.toString(),true);if(bank!=null){int bid=b.optInt("bankId",0);String bn="bank-"+bid+".csv";Uri bf=findFile(bdir,bn);boolean bfresh=bf==null;if(bfresh)bf=ensureFile(bdir,"text/csv",bn);if(bf!=null){StringBuilder br=new StringBuilder();if(bfresh)br.append("timestamp;bank_id;soc;remaining_ah;capacity_ah;voltage;current;power;connected;total\n");br.append(iso(t)).append(';').append(bid).append(';').append(f(bank.optDouble("soc",0),2)).append(';').append(f(bank.optDouble("remaining",0),3)).append(';').append(f(bank.optDouble("cap",0),3)).append(';').append(f(bank.optDouble("voltage",0),3)).append(';').append(f(bank.optDouble("current",0),3)).append(';').append(f(bank.optDouble("power",0),3)).append(';').append(bank.optInt("connected",0)).append(';').append(bank.optInt("total",0)).append('\n');writeText(bf,br.toString(),true);}}}catch(Exception ignored){}}
    }
}