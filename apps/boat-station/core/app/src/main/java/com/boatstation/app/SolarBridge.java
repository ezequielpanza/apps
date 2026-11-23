package com.boatstation.app;

import android.Manifest;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.*;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Passive Victron Instant Readout; key never leaves the native bridge. */
final class SolarBridge {
 private static final String ALIAS="boatstation.solar.v1", PREF="solar_native";
 private final BoatStationActivity activity; private final WebView view; private BluetoothLeScanner scanner; private byte[] key; private String address; private boolean scanning;
 SolarBridge(BoatStationActivity a,WebView w){activity=a;view=w;restore();}
 private SecretKey secret() throws Exception {KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);if(!ks.containsAlias(ALIAS)){KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();}return (SecretKey)ks.getKey(ALIAS,null);}
 private void restore(){try{android.content.SharedPreferences p=activity.getSharedPreferences(PREF,Context.MODE_PRIVATE);address=p.getString("address","");byte[] iv=Base64.decode(p.getString("iv",""),Base64.NO_WRAP),ct=Base64.decode(p.getString("key",""),Base64.NO_WRAP);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,secret(),new GCMParameterSpec(128,iv));key=c.doFinal(ct);}catch(Exception ignored){key=null;}}
 @JavascriptInterface public String configure(String mac,String hex){try{String m=mac.replaceAll("[^0-9A-Fa-f]","").toUpperCase(),h=hex.trim();if(!m.matches("[0-9A-F]{12}")||!h.matches("(?i)[0-9a-f]{32}"))return "Revisá la dirección y la clave de 32 caracteres.";byte[] k=new byte[16];for(int i=0;i<16;i++)k[i]=(byte)Integer.parseInt(h.substring(i*2,i*2+2),16);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,secret());byte[] encrypted=c.doFinal(k);boolean ok=activity.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString("address",m).putString("iv",Base64.encodeToString(c.getIV(),Base64.NO_WRAP)).putString("key",Base64.encodeToString(encrypted,Base64.NO_WRAP)).commit();if(!ok)return "No se pudo guardar la configuración.";key=k;address=m;start();return "";}catch(Exception e){return "No se pudo guardar la configuración segura.";}}
 @JavascriptInterface public boolean configured(){return key!=null&&address!=null&&!address.isEmpty();}
 @JavascriptInterface public void start(){activity.runOnUiThread(()->{if(scanning||!configured())return;try{if(Build.VERSION.SDK_INT>=31&&activity.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)!=PackageManager.PERMISSION_GRANTED){status("Falta permiso de Bluetooth");return;}if(Build.VERSION.SDK_INT<31&&activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){status("Falta permiso de ubicación para Bluetooth");return;}BluetoothManager bm=(BluetoothManager)activity.getSystemService(Context.BLUETOOTH_SERVICE);scanner=bm.getAdapter().getBluetoothLeScanner();if(scanner==null){status("Bluetooth no disponible");return;}scanner.startScan(null,new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_POWER).build(),callback);scanning=true;status("Buscando regulador");}catch(Exception e){status("No se pudo iniciar Bluetooth");}});}
 void stop(){try{if(scanner!=null&&scanning)scanner.stopScan(callback);}catch(Exception ignored){}scanning=false;}
 private void status(String s){try{JSONObject o=new JSONObject();o.put("status",s);send(o);}catch(Exception ignored){}}
 private void send(JSONObject o){view.post(()->view.evaluateJavascript("window.BoatStationSolar&&window.BoatStationSolar.receive("+o+")",null));}
 private final ScanCallback callback=new ScanCallback(){@Override public void onScanFailed(int e){scanning=false;status("Error de escaneo Bluetooth "+e);}@Override public void onScanResult(int type,ScanResult result){try{if(key==null||result.getScanRecord()==null||!result.getDevice().getAddress().replace(":","").equalsIgnoreCase(address))return;byte[] data=result.getScanRecord().getManufacturerSpecificData(0x02e1);if(data==null||data.length<18||data[0]!=0x10||data[1]!=0x02||data[4]!=0x01||(data[7]&255)!=(key[0]&255))return;byte[] iv=new byte[16];iv[0]=data[5];iv[1]=data[6];Cipher c=Cipher.getInstance("AES/CTR/NoPadding");c.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new IvParameterSpec(iv));byte[] d=c.doFinal(Arrays.copyOfRange(data,8,data.length));if(d.length<10)return;JSONObject o=new JSONObject();o.put("time",System.currentTimeMillis());o.put("status","Conectado");o.put("chargeState",d[0]&255);o.put("error",d[1]&255);int v=(d[2]&255)|((d[3]&255)<<8),a=(d[4]&255)|((d[5]&255)<<8),yield=(d[6]&255)|((d[7]&255)<<8),power=(d[8]&255)|((d[9]&255)<<8);if(v!=32767)o.put("voltage",(short)v/100.0);if(a!=32767)o.put("current",(short)a/10.0);if(yield!=65535)o.put("yieldWh",yield*10);if(power!=65535)o.put("power",power);send(o);}catch(Exception ignored){}}};
}
