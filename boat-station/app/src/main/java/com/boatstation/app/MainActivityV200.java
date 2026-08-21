package com.boatstation.app;

import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class MainActivityV200 extends MainActivityV100 {
    private static final int REQ_EXPORT_ZIP_V200 = 2201;
    private static final int REQ_EXPORT_GPX = 2202;
    private static final int REQ_IMPORT_GPX = 2203;
    private static final String PREFS = "boat_station";
    private static final String DATA_FOLDER = "data_folder_uri";
    private WebView webView;
    private String pendingZipJson = "";
    private String pendingGpx = "";

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView=findWebView(findViewById(android.R.id.content));
        if(webView!=null){
            webView.addJavascriptInterface(new V200Bridge(),"V200Bridge");
            webView.postDelayed(()->{
                try(InputStream in=getAssets().open("patch_v200.js")){
                    byte[] b=readBytes(in);
                    webView.evaluateJavascript(new String(b,StandardCharsets.UTF_8),null);
                }catch(Exception ignored){}
            },1200);
        }
    }

    private WebView findWebView(View v){
        if(v instanceof WebView)return (WebView)v;
        if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){WebView w=findWebView(g.getChildAt(i));if(w!=null)return w;}}
        return null;
    }
    private byte[] readBytes(InputStream in)throws Exception{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[16384];int n;while((n=in.read(b))>0)out.write(b,0,n);return out.toByteArray();}
    private void eval(String js){if(webView!=null)webView.post(()->webView.evaluateJavascript(js,null));}
    private String stamp(){return new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss",Locale.US).format(new Date());}

    private void chooseZip(){
        Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("application/zip");i.addCategory(Intent.CATEGORY_OPENABLE);i.putExtra(Intent.EXTRA_TITLE,"BoatStation-backup-"+stamp()+".zip");startActivityForResult(i,REQ_EXPORT_ZIP_V200);
    }
    private void chooseGpxExport(){
        Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("application/gpx+xml");i.addCategory(Intent.CATEGORY_OPENABLE);i.putExtra(Intent.EXTRA_TITLE,"BoatStation-route-"+stamp()+".gpx");startActivityForResult(i,REQ_EXPORT_GPX);
    }
    private void chooseGpxImport(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("*/*");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,REQ_IMPORT_GPX);}

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(resultCode!=RESULT_OK||data==null||data.getData()==null)return;Uri uri=data.getData();
        if(requestCode==REQ_EXPORT_ZIP_V200){boolean ok=exportZip(uri,pendingZipJson);pendingZipJson="";eval("window.BoatStationV200&&BoatStationV200.onZipExported("+ok+")");}
        else if(requestCode==REQ_EXPORT_GPX){boolean ok=write(uri,pendingGpx);pendingGpx="";if(!ok)eval("alert('No se pudo exportar el GPX')");}
        else if(requestCode==REQ_IMPORT_GPX){String raw=read(uri);eval("window.BoatStationV200&&BoatStationV200.onGpxImported("+ JSONObject.quote(raw)+")");}
    }

    private Uri folderUri(){String s=getSharedPreferences(PREFS,MODE_PRIVATE).getString(DATA_FOLDER,"");try{return s.isEmpty()?null:Uri.parse(s);}catch(Exception e){return null;}}
    private Uri treeDoc(Uri tree){return DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));}
    private Uri childList(Uri dir){return DocumentsContract.buildChildDocumentsUriUsingTree(dir,DocumentsContract.getDocumentId(dir));}
    private boolean write(Uri uri,String text){try(OutputStream o=getContentResolver().openOutputStream(uri,"wt")){if(o==null)return false;o.write((text==null?"":text).getBytes(StandardCharsets.UTF_8));o.flush();return true;}catch(Exception e){return false;}}
    private String read(Uri uri){try(InputStream in=getContentResolver().openInputStream(uri)){return in==null?"":new String(readBytes(in),StandardCharsets.UTF_8);}catch(Exception e){return "";}}
    private boolean exportZip(Uri target,String config){
        try(OutputStream raw=getContentResolver().openOutputStream(target,"wt");ZipOutputStream zip=new ZipOutputStream(raw)){
            zip.putNextEntry(new ZipEntry("config/boat-station-config.json"));zip.write((config==null?"":config).getBytes(StandardCharsets.UTF_8));zip.closeEntry();Uri tree=folderUri();if(tree!=null)zipDirectory(zip,treeDoc(tree),"data/");zip.finish();return true;
        }catch(Exception e){return false;}
    }
    private void zipDirectory(ZipOutputStream zip,Uri dir,String prefix)throws Exception{
        Cursor c=null;try{c=getContentResolver().query(childList(dir),new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE},null,null,null);if(c==null)return;while(c.moveToNext()){Uri child=DocumentsContract.buildDocumentUriUsingTree(dir,c.getString(0));String name=c.getString(1),mime=c.getString(2);if(DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)){zipDirectory(zip,child,prefix+name+"/");}else{zip.putNextEntry(new ZipEntry(prefix+name));try(InputStream in=getContentResolver().openInputStream(child)){if(in!=null){byte[] b=new byte[16384];int n;while((n=in.read(b))>0)zip.write(b,0,n);}}zip.closeEntry();}}}finally{if(c!=null)c.close();}}

    public class V200Bridge {
        @JavascriptInterface public String qrDataUrl(String payload){
            try{BitMatrix m=new MultiFormatWriter().encode(payload,BarcodeFormat.QR_CODE,640,640);Bitmap bmp=Bitmap.createBitmap(640,640,Bitmap.Config.ARGB_8888);for(int y=0;y<640;y++)for(int x=0;x<640;x++)bmp.setPixel(x,y,m.get(x)?0xFF000000:0xFFFFFFFF);ByteArrayOutputStream out=new ByteArrayOutputStream();bmp.compress(Bitmap.CompressFormat.PNG,100,out);return "data:image/png;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);}catch(Exception e){return "";}
        }
        @JavascriptInterface public void exportZip(String json){pendingZipJson=json==null?"":json;runOnUiThread(MainActivityV200.this::chooseZip);}
        @JavascriptInterface public void exportGpx(String gpx){pendingGpx=gpx==null?"":gpx;runOnUiThread(MainActivityV200.this::chooseGpxExport);}
        @JavascriptInterface public void importGpx(){runOnUiThread(MainActivityV200.this::chooseGpxImport);}
    }
}
