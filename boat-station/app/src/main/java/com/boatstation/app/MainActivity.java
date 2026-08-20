package com.boatstation.app;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class MainActivity extends Activity implements LocationListener, SensorEventListener {
    private static final int REQ_LOCATION=1001, REQ_BLUETOOTH=1002;
    private static final String PREFS="boat_station", BATTERY_CONFIGS="battery_configs_v2", BANK_CONFIGS="battery_banks_v1";
    private static final UUID CCCD=UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final UUID HUM_SERVICE=UUID.fromString("00000001-0000-1000-8000-00805f9b34fb");
    private static final UUID HUM_WRITE=UUID.fromString("00000002-0000-1000-8000-00805f9b34fb");
    private static final UUID HUM_NOTIFY=UUID.fromString("00000003-0000-1000-8000-00805f9b34fb");

    private WebView webView; private LocationManager locationManager; private SensorManager sensorManager;
    private Sensor accelSensor, magneticSensor; private final float[] gravity=new float[3], geomagnetic=new float[3];
    private boolean hasGravity=false,hasGeomagnetic=false,scanning=false;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private BluetoothAdapter bluetoothAdapter; private BluetoothLeScanner bleScanner;
    private final Map<Integer,BluetoothGatt> batteryGatts=new HashMap<>();
    private final Map<Integer,Boolean> humDetected=new HashMap<>();
    private final Map<Integer,ByteArrayOutputStream> rxBuffers=new HashMap<>();

    private final Runnable statusTicker=new Runnable(){@Override public void run(){pushPhoneStatus();pollAllBatteries();handler.postDelayed(this,5000);}};

    @Override protected void onCreate(Bundle b){super.onCreate(b);webView=new WebView(this);setContentView(webView);webView.setWebViewClient(new WebViewClient());webView.setWebChromeClient(new WebChromeClient());webView.getSettings().setJavaScriptEnabled(true);webView.getSettings().setDomStorageEnabled(true);webView.getSettings().setAllowFileAccess(true);webView.getSettings().setAllowContentAccess(true);webView.addJavascriptInterface(new NativeBridge(),"NativeBridge");webView.setBackgroundColor(0xFF061522);
        locationManager=(LocationManager)getSystemService(Context.LOCATION_SERVICE);sensorManager=(SensorManager)getSystemService(Context.SENSOR_SERVICE);accelSensor=sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);magneticSensor=sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        BluetoothManager bm=(BluetoothManager)getSystemService(Context.BLUETOOTH_SERVICE);bluetoothAdapter=bm!=null?bm.getAdapter():null;bleScanner=bluetoothAdapter!=null?bluetoothAdapter.getBluetoothLeScanner():null;
        migrateBatteryStructure();webView.loadUrl("file:///android_asset/index.html");webView.postDelayed(()->{requestLocationIfNeeded();requestBluetoothIfNeeded();pushPhoneStatus();connectSavedBatteries();},800);
    }

    private SharedPreferences prefs(){return getSharedPreferences(PREFS,MODE_PRIVATE);} private JSONArray readArr(String key){try{return new JSONArray(prefs().getString(key,"[]"));}catch(Exception e){return new JSONArray();}} private void writeArr(String key,JSONArray a){prefs().edit().putString(key,a.toString()).apply();}
    private JSONArray banksArr(){return readArr(BANK_CONFIGS);} private JSONArray batArr(){return readArr(BATTERY_CONFIGS);}
    private int nextId(JSONArray a){int m=0;for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null)m=Math.max(m,o.optInt("id",0));}return m+1;}
    private JSONObject byId(JSONArray a,int id){for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&o.optInt("id",-1)==id)return o;}return null;}

    private void migrateBatteryStructure(){
        JSONArray bats=batArr(),banks=banksArr();
        if(bats.length()==0){JSONArray legacy=new JSONArray();for(int s=1;s<=2;s++){String addr=prefs().getString("battery_"+s+"_address","");if(addr==null||addr.isEmpty())continue;try{JSONObject o=new JSONObject();o.put("id",s);o.put("name",prefs().getString("battery_"+s+"_name","Batería "+s));o.put("address",addr);o.put("capacityAh",prefs().getInt("battery_"+s+"_capacity",0));o.put("bmsType","auto");o.put("bank","");legacy.put(o);}catch(Exception ignored){}}if(legacy.length()>0){bats=legacy;writeArr(BATTERY_CONFIGS,bats);}}
        if(bats.length()>0&&banks.length()==0){try{JSONObject bank=new JSONObject();bank.put("id",1);bank.put("name","Banco 1");banks.put(bank);writeArr(BANK_CONFIGS,banks);}catch(Exception ignored){}}
        if(bats.length()>0){boolean changed=false;for(int i=0;i<bats.length();i++){JSONObject o=bats.optJSONObject(i);if(o==null)continue;if(!o.has("bankId")||o.optInt("bankId",0)<=0){int target=1;String old=o.optString("bank","").trim();if(!old.isEmpty()){JSONObject match=null;for(int j=0;j<banks.length();j++){JSONObject bk=banks.optJSONObject(j);if(bk!=null&&old.equalsIgnoreCase(bk.optString("name")))match=bk;}if(match==null){try{int nid=nextId(banks);match=new JSONObject();match.put("id",nid);match.put("name",old);banks.put(match);}catch(Exception ignored){}}if(match!=null)target=match.optInt("id",1);}try{o.put("bankId",target);o.remove("bank");changed=true;}catch(Exception ignored){}}}if(changed){writeArr(BATTERY_CONFIGS,bats);writeArr(BANK_CONFIGS,banks);}}
    }

    private int addBankInternal(String name){JSONArray a=banksArr();int id=nextId(a);try{JSONObject o=new JSONObject();o.put("id",id);o.put("name",name==null||name.trim().isEmpty()?"Banco "+id:name.trim());a.put(o);writeArr(BANK_CONFIGS,a);}catch(Exception ignored){}return id;}
    private void updateBankInternal(int id,String name){JSONArray a=banksArr();JSONObject o=byId(a,id);if(o!=null)try{o.put("name",name==null||name.trim().isEmpty()?"Banco "+id:name.trim());}catch(Exception ignored){}writeArr(BANK_CONFIGS,a);}
    private boolean bankHasBatteries(int id){JSONArray a=batArr();for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&o.optInt("bankId",0)==id)return true;}return false;}
    private boolean deleteBankInternal(int id){if(bankHasBatteries(id))return false;JSONArray a=banksArr(),out=new JSONArray();for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&o.optInt("id",-1)!=id)out.put(o);}writeArr(BANK_CONFIGS,out);return true;}

    private int addBatteryInternal(int bankId,String name,int capacityAh,String bmsType){JSONArray a=batArr();int id=nextId(a);try{JSONObject o=new JSONObject();o.put("id",id);o.put("bankId",bankId);o.put("name",name==null||name.trim().isEmpty()?"Batería "+id:name.trim());o.put("address","");o.put("capacityAh",Math.max(0,capacityAh));o.put("bmsType",bmsType==null||bmsType.isEmpty()?"auto":bmsType);a.put(o);writeArr(BATTERY_CONFIGS,a);}catch(Exception ignored){}return id;}
    private JSONObject batteryConfig(int id){return byId(batArr(),id);} private void updateBatteryInternal(int id,int bankId,String name,int capacityAh,String bmsType,String address){JSONArray a=batArr();JSONObject o=byId(a,id);if(o!=null)try{if(bankId>0)o.put("bankId",bankId);if(name!=null)o.put("name",name.trim().isEmpty()?"Batería "+id:name.trim());if(capacityAh>=0)o.put("capacityAh",capacityAh);if(bmsType!=null)o.put("bmsType",bmsType);if(address!=null)o.put("address",address);}catch(Exception ignored){}writeArr(BATTERY_CONFIGS,a);}
    private void deleteBatteryInternal(int id){JSONArray a=batArr(),out=new JSONArray();for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&o.optInt("id",-1)!=id)out.put(o);}writeArr(BATTERY_CONFIGS,out);BluetoothGatt g=batteryGatts.remove(id);if(g!=null)try{g.close();}catch(Exception ignored){}humDetected.remove(id);rxBuffers.remove(id);}

    private JSONArray savedBanksJson(){return banksArr();} private JSONArray savedBatteriesJson(){JSONArray a=batArr();for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null)try{o.put("connected",batteryGatts.containsKey(o.optInt("id")));o.put("detectedBms",Boolean.TRUE.equals(humDetected.get(o.optInt("id")))?"Humsienk":"");}catch(Exception ignored){}}return a;}

    private void requestLocationIfNeeded(){if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},REQ_LOCATION);else startLocationUpdates();}
    private boolean hasBt(){if(Build.VERSION.SDK_INT<31)return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;return checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;}
    private void requestBluetoothIfNeeded(){if(!hasBt()&&Build.VERSION.SDK_INT>=31)requestPermissions(new String[]{Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT},REQ_BLUETOOTH);}
    @Override public void onRequestPermissionsResult(int r,String[] p,int[] g){super.onRequestPermissionsResult(r,p,g);if(r==REQ_LOCATION&&g.length>0&&g[0]==PackageManager.PERMISSION_GRANTED)startLocationUpdates();if(r==REQ_BLUETOOTH&&hasBt()){refreshScanner();connectSavedBatteries();}}
    private void startLocationUpdates(){if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)return;try{locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,2000,0.5f,this);Location l=locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);if(l!=null)onLocationChanged(l);}catch(Exception ignored){}}
    @Override public void onLocationChanged(Location l){try{JSONObject o=new JSONObject();o.put("lat",l.getLatitude());o.put("lon",l.getLongitude());o.put("accuracy",l.hasAccuracy()?l.getAccuracy():-1);o.put("speedKts",l.hasSpeed()?l.getSpeed()*1.94384449:0);o.put("bearing",l.hasBearing()?l.getBearing():0);o.put("altitude",l.hasAltitude()?l.getAltitude():0);o.put("time",l.getTime());eval("window.BoatStation&&BoatStation.updateGPS("+o+")");}catch(Exception ignored){}}
    private void pushPhoneStatus(){try{Intent b=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));int level=0,temp=0;boolean charging=false;if(b!=null){int raw=b.getIntExtra(BatteryManager.EXTRA_LEVEL,-1),scale=b.getIntExtra(BatteryManager.EXTRA_SCALE,100);level=scale>0?Math.round(raw*100f/scale):raw;temp=b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE,0);int st=b.getIntExtra(BatteryManager.EXTRA_STATUS,-1);charging=st==BatteryManager.BATTERY_STATUS_CHARGING||st==BatteryManager.BATTERY_STATUS_FULL;}JSONObject o=new JSONObject();o.put("battery",level);o.put("batteryTemp",temp/10.0);o.put("charging",charging);o.put("network",getNetworkLabel());o.put("model",Build.MANUFACTURER+" "+Build.MODEL);o.put("android",Build.VERSION.RELEASE);o.put("version","0.0.12");eval("window.BoatStation&&BoatStation.updatePhone("+o+")");}catch(Exception ignored){}}
    private String getNetworkLabel(){try{ConnectivityManager cm=(ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);Network n=cm.getActiveNetwork();if(n==null)return"Offline";NetworkCapabilities c=cm.getNetworkCapabilities(n);if(c!=null&&c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return"Wi-Fi";if(c!=null&&c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR))return"Datos móviles";return"Online";}catch(Exception e){return"Desconocida";}}

    private void refreshScanner(){if(bluetoothAdapter!=null)bleScanner=bluetoothAdapter.getBluetoothLeScanner();}
    private final ScanCallback scanCallback=new ScanCallback(){@Override public void onScanResult(int t,ScanResult r){try{BluetoothDevice d=r.getDevice();String name=r.getScanRecord()!=null?r.getScanRecord().getDeviceName():null;if((name==null||name.isEmpty())&&(Build.VERSION.SDK_INT<31||checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED))name=d.getName();JSONObject o=new JSONObject();o.put("name",name==null?"":name);o.put("address",d.getAddress());o.put("rssi",r.getRssi());eval("window.BoatStation&&BoatStation.onBleScanResult("+o+")");}catch(Exception ignored){}}};
    private void startScan(){if(!hasBt()){requestBluetoothIfNeeded();return;}refreshScanner();if(bleScanner==null||bluetoothAdapter==null||!bluetoothAdapter.isEnabled())return;try{if(scanning)bleScanner.stopScan(scanCallback);scanning=true;bleScanner.startScan(scanCallback);handler.postDelayed(this::stopScan,10000);}catch(Exception ignored){}}
    private void stopScan(){if(!scanning||bleScanner==null||!hasBt())return;try{bleScanner.stopScan(scanCallback);}catch(Exception ignored){}scanning=false;}
    private void connectSavedBatteries(){if(!hasBt()||bluetoothAdapter==null||!bluetoothAdapter.isEnabled())return;JSONArray a=batArr();for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&!o.optString("address","").isEmpty())connectBattery(o.optInt("id"));}}
    private void connectBattery(int id){if(!hasBt()||bluetoothAdapter==null)return;JSONObject c=batteryConfig(id);if(c==null)return;String addr=c.optString("address","");if(addr.isEmpty())return;try{BluetoothGatt old=batteryGatts.remove(id);if(old!=null)old.close();BluetoothDevice d=bluetoothAdapter.getRemoteDevice(addr);BluetoothGatt g=d.connectGatt(this,true,new BatteryGattCallback(id));batteryGatts.put(id,g);pushConnection(id,false);}catch(Exception ignored){}}
    private void pushConnection(int id,boolean connected){JSONObject c=batteryConfig(id);if(c==null)return;try{JSONObject o=new JSONObject(c.toString());o.put("connected",connected);o.put("detectedBms",Boolean.TRUE.equals(humDetected.get(id))?"Humsienk":"");eval("window.BoatStation&&BoatStation.onBatteryConnection("+o+")");}catch(Exception ignored){}}

    private static byte[] frame(int cmd){int cs=cmd;return new byte[]{(byte)0xAA,(byte)cmd,0,(byte)(cs&255),(byte)((cs>>8)&255)};}
    private static int i32le(byte[] b,int o){return(b[o]&255)|((b[o+1]&255)<<8)|((b[o+2]&255)<<16)|(b[o+3]<<24);} private static long u32le(byte[] b,int o){return((long)b[o]&255)|(((long)b[o+1]&255)<<8)|(((long)b[o+2]&255)<<16)|(((long)b[o+3]&255)<<24);} private static int u16le(byte[] b,int o){return(b[o]&255)|((b[o+1]&255)<<8);}
    private boolean validFrame(byte[] f){if(f==null||f.length<5||(f[0]&255)!=0xAA)return false;int n=f[2]&255;if(f.length<5+n)return false;int expect=0;for(int i=1;i<3+n;i++)expect=(expect+(f[i]&255))&0xffff;int actual=(f[3+n]&255)|((f[4+n]&255)<<8);return expect==actual;}
    private void acceptChunk(int id,byte[] chunk){if(chunk==null||chunk.length==0)return;ByteArrayOutputStream out=rxBuffers.get(id);if(out==null){out=new ByteArrayOutputStream();rxBuffers.put(id,out);}try{if(out.size()==0&&chunk[0]!=(byte)0xAA)return;out.write(chunk);byte[] all=out.toByteArray();if(all.length<3)return;int total=(all[2]&255)+5;if(all.length<total)return;byte[] f=new byte[total];System.arraycopy(all,0,f,0,total);out.reset();if(all.length>total)out.write(all,total,all.length-total);if(validFrame(f))parseHumFrame(id,f);}catch(Exception e){out.reset();}}
    private void parseHumFrame(int id,byte[] f){int cmd=f[1]&255,n=f[2]&255;if(cmd!=0x21||n<26)return;int p=3;try{double volts=i32le(f,p)/1000.0,amps=i32le(f,p+4)/1000.0;int soc=f[p+8]&255,soh=f[p+9]&255;double rem=u32le(f,p+10)/1000.0,total=u32le(f,p+14)/1000.0;int cycles=u16le(f,p+18);int t1=f[p+20];JSONObject o=new JSONObject();o.put("id",id);o.put("voltage",volts);o.put("current",amps);o.put("power",volts*amps);o.put("soc",soc);o.put("soh",soh);o.put("remainingAh",rem);o.put("totalAh",total);o.put("cycles",cycles);o.put("temperature",t1);o.put("time",System.currentTimeMillis());o.put("bmsType","Humsienk");eval("window.BoatStation&&BoatStation.onBatteryData("+o+")");JSONObject cfg=batteryConfig(id);if(cfg!=null&&cfg.optInt("capacityAh",0)<=0&&total>0&&total<5000)updateBatteryInternal(id,-1,null,(int)Math.round(total),null,null);}catch(Exception ignored){}}
    private void subscribeHum(BluetoothGatt g,BluetoothGattCharacteristic c){if(!hasBt())return;try{g.setCharacteristicNotification(c,true);BluetoothGattDescriptor d=c.getDescriptor(CCCD);if(d!=null){d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);g.writeDescriptor(d);}}catch(Exception ignored){}}
    private void sendHum(int id,int cmd){BluetoothGatt g=batteryGatts.get(id);if(g==null||!Boolean.TRUE.equals(humDetected.get(id))||!hasBt())return;try{BluetoothGattService s=g.getService(HUM_SERVICE);BluetoothGattCharacteristic w=s!=null?s.getCharacteristic(HUM_WRITE):null;if(w==null)return;w.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);w.setValue(frame(cmd));g.writeCharacteristic(w);}catch(Exception ignored){}}
    private void pollBatteryInternal(int id){sendHum(id,0x21);} private void pollAllBatteries(){for(Integer id:new ArrayList<>(batteryGatts.keySet()))pollBatteryInternal(id);}

    private class BatteryGattCallback extends BluetoothGattCallback{private final int id;BatteryGattCallback(int id){this.id=id;}@Override public void onConnectionStateChange(BluetoothGatt g,int status,int ns){boolean con=ns==BluetoothProfile.STATE_CONNECTED;if(con){batteryGatts.put(id,g);pushConnection(id,true);try{if(hasBt())g.requestMtu(247);}catch(Exception ignored){}try{if(hasBt())g.discoverServices();}catch(Exception ignored){}}else{batteryGatts.remove(id);humDetected.remove(id);rxBuffers.remove(id);pushConnection(id,false);}}@Override public void onServicesDiscovered(BluetoothGatt g,int status){try{BluetoothGattService s=g.getService(HUM_SERVICE);BluetoothGattCharacteristic w=s!=null?s.getCharacteristic(HUM_WRITE):null,n=s!=null?s.getCharacteristic(HUM_NOTIFY):null;if(w!=null&&n!=null){humDetected.put(id,true);rxBuffers.put(id,new ByteArrayOutputStream());subscribeHum(g,n);pushConnection(id,true);handler.postDelayed(()->sendHum(id,0x00),500);handler.postDelayed(()->pollBatteryInternal(id),1200);}}catch(Exception ignored){}}@Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c){if(HUM_NOTIFY.equals(c.getUuid()))acceptChunk(id,c.getValue());}}

    public class NativeBridge{
        @JavascriptInterface public void startBatteryScan(){runOnUiThread(MainActivity.this::startScan);}
        @JavascriptInterface public void stopBatteryScan(){runOnUiThread(MainActivity.this::stopScan);}
        @JavascriptInterface public String getSavedBanks(){return savedBanksJson().toString();}
        @JavascriptInterface public String getSavedBatteries(){return savedBatteriesJson().toString();}
        @JavascriptInterface public int addBank(String name){return addBankInternal(name);}
        @JavascriptInterface public void updateBank(int id,String name){runOnUiThread(()->updateBankInternal(id,name));}
        @JavascriptInterface public boolean deleteBank(int id){return deleteBankInternal(id);}
        @JavascriptInterface public int addBattery(int bankId,String name,int capacityAh,String bmsType){return addBatteryInternal(bankId,name,capacityAh,bmsType);}
        @JavascriptInterface public void updateBattery(int id,int bankId,String name,int capacityAh,String bmsType){runOnUiThread(()->{updateBatteryInternal(id,bankId,name,Math.max(0,capacityAh),bmsType,null);pushConnection(id,batteryGatts.containsKey(id));});}
        @JavascriptInterface public void setBatteryAddress(int id,String address){runOnUiThread(()->{updateBatteryInternal(id,-1,null,-1,null,address);connectBattery(id);});}
        @JavascriptInterface public void deleteBattery(int id){runOnUiThread(()->deleteBatteryInternal(id));}
        @JavascriptInterface public void pollBattery(int id){runOnUiThread(()->pollBatteryInternal(id));}
        @JavascriptInterface public void reconnectBatteries(){runOnUiThread(MainActivity.this::connectSavedBatteries);}
    }

    @Override protected void onResume(){super.onResume();if(accelSensor!=null)sensorManager.registerListener(this,accelSensor,SensorManager.SENSOR_DELAY_UI);if(magneticSensor!=null)sensorManager.registerListener(this,magneticSensor,SensorManager.SENSOR_DELAY_UI);handler.removeCallbacks(statusTicker);handler.post(statusTicker);if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED)startLocationUpdates();handler.postDelayed(this::connectSavedBatteries,800);}
    @Override protected void onPause(){super.onPause();sensorManager.unregisterListener(this);handler.removeCallbacks(statusTicker);stopScan();try{locationManager.removeUpdates(this);}catch(Exception ignored){}}
    @Override protected void onDestroy(){super.onDestroy();for(BluetoothGatt g:batteryGatts.values())try{g.close();}catch(Exception ignored){}batteryGatts.clear();}
    @Override public void onSensorChanged(SensorEvent e){if(e.sensor.getType()==Sensor.TYPE_ACCELEROMETER){System.arraycopy(e.values,0,gravity,0,3);hasGravity=true;double m=Math.sqrt(e.values[0]*e.values[0]+e.values[1]*e.values[1]+e.values[2]*e.values[2]);double motion=Math.abs(m-SensorManager.GRAVITY_EARTH);eval("window.BoatStation&&BoatStation.updateMotion("+String.format(java.util.Locale.US,"%.3f",motion)+")");}else if(e.sensor.getType()==Sensor.TYPE_MAGNETIC_FIELD){System.arraycopy(e.values,0,geomagnetic,0,3);hasGeomagnetic=true;}if(hasGravity&&hasGeomagnetic){float[]R=new float[9],I=new float[9];if(SensorManager.getRotationMatrix(R,I,gravity,geomagnetic)){float[]o=new float[3];SensorManager.getOrientation(R,o);double a=Math.toDegrees(o[0]);if(a<0)a+=360;eval("window.BoatStation&&BoatStation.updateCompass("+String.format(java.util.Locale.US,"%.1f",a)+")");}}}
    @Override public void onAccuracyChanged(Sensor s,int a){} @Override public void onProviderEnabled(String p){} @Override public void onProviderDisabled(String p){} @Override public void onStatusChanged(String p,int s,Bundle e){}
    private void eval(String js){if(webView!=null)webView.post(()->webView.evaluateJavascript(js,null));}
    @Override public void onBackPressed(){if(webView!=null&&webView.canGoBack())webView.goBack();else super.onBackPressed();}
}
