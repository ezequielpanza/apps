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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class MainActivity extends Activity implements LocationListener, SensorEventListener {
    private static final int REQ_LOCATION = 1001;
    private static final int REQ_BLUETOOTH = 1002;
    private static final String PREFS = "boat_station";
    private static final String BATTERY_CONFIGS = "battery_configs_v2";
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final UUID HUMSIENK_SERVICE = UUID.fromString("00000001-0000-1000-8000-00805f9b34fb");
    private static final UUID HUMSIENK_WRITE = UUID.fromString("00000002-0000-1000-8000-00805f9b34fb");
    private static final UUID HUMSIENK_NOTIFY = UUID.fromString("00000003-0000-1000-8000-00805f9b34fb");
    private static final byte[] HUMSIENK_INFO = new byte[]{(byte)0xAA,0x21,0x00,0x21,0x00};

    private WebView webView;
    private LocationManager locationManager;
    private SensorManager sensorManager;
    private Sensor accelSensor;
    private Sensor magneticSensor;
    private final float[] gravity = new float[3];
    private final float[] geomagnetic = new float[3];
    private boolean hasGravity = false;
    private boolean hasGeomagnetic = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bleScanner;
    private boolean scanning = false;
    private final Map<Integer, BluetoothGatt> batteryGatts = new HashMap<>();
    private final Map<Integer, Boolean> humsienkDetected = new HashMap<>();

    private final Runnable statusTicker = new Runnable() {
        @Override public void run() {
            pushPhoneStatus();
            pollAllBatteries();
            handler.postDelayed(this, 5000);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.addJavascriptInterface(new NativeBridge(), "NativeBridge");
        webView.setBackgroundColor(0xFF061522);

        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        accelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        magneticSensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        BluetoothManager bluetoothManager = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        bluetoothAdapter = bluetoothManager != null ? bluetoothManager.getAdapter() : null;
        bleScanner = bluetoothAdapter != null ? bluetoothAdapter.getBluetoothLeScanner() : null;

        migrateLegacyBatteries();
        webView.loadUrl("file:///android_asset/index.html");
        webView.postDelayed(() -> {
            requestLocationIfNeeded();
            requestBluetoothIfNeeded();
            pushPhoneStatus();
            connectSavedBatteries();
        }, 800);
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, MODE_PRIVATE); }

    private JSONArray getBatteryConfigsArray() {
        try { return new JSONArray(prefs().getString(BATTERY_CONFIGS, "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    private void saveBatteryConfigsArray(JSONArray arr) { prefs().edit().putString(BATTERY_CONFIGS, arr.toString()).apply(); }

    private void migrateLegacyBatteries() {
        JSONArray current = getBatteryConfigsArray();
        if (current.length() > 0) return;
        JSONArray migrated = new JSONArray();
        try {
            for (int slot=1; slot<=2; slot++) {
                String address = prefs().getString("battery_"+slot+"_address", "");
                if (address == null || address.isEmpty()) continue;
                JSONObject o = new JSONObject();
                o.put("id", slot);
                o.put("name", prefs().getString("battery_"+slot+"_name", "Batería "+slot));
                o.put("bank", "");
                o.put("address", address);
                o.put("capacityAh", prefs().getInt("battery_"+slot+"_capacity", 0));
                o.put("bmsType", "auto");
                migrated.put(o);
            }
        } catch (Exception ignored) {}
        if (migrated.length() > 0) saveBatteryConfigsArray(migrated);
    }

    private JSONObject batteryConfig(int id) {
        JSONArray arr = getBatteryConfigsArray();
        for (int i=0;i<arr.length();i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null && o.optInt("id",-1)==id) return o;
        }
        return null;
    }

    private int nextBatteryId() {
        JSONArray arr = getBatteryConfigsArray(); int max=0;
        for(int i=0;i<arr.length();i++) max=Math.max(max,arr.optJSONObject(i)!=null?arr.optJSONObject(i).optInt("id",0):0);
        return max+1;
    }

    private int addBatteryConfig(String name,String bank,int capacityAh,String bmsType) {
        int id = nextBatteryId();
        try {
            JSONArray arr=getBatteryConfigsArray(); JSONObject o=new JSONObject();
            o.put("id",id); o.put("name",name==null||name.trim().isEmpty()?"Batería":name.trim());
            o.put("bank",bank==null?"":bank.trim()); o.put("address",""); o.put("capacityAh",Math.max(0,capacityAh));
            o.put("bmsType",bmsType==null||bmsType.isEmpty()?"auto":bmsType); arr.put(o); saveBatteryConfigsArray(arr);
        } catch(Exception ignored) {}
        return id;
    }

    private void updateBatteryConfig(int id,String name,String bank,int capacityAh,String bmsType,String address) {
        JSONArray arr=getBatteryConfigsArray();
        for(int i=0;i<arr.length();i++) {
            JSONObject o=arr.optJSONObject(i); if(o==null||o.optInt("id",-1)!=id) continue;
            try {
                if(name!=null) o.put("name",name.trim().isEmpty()?"Batería":name.trim());
                if(bank!=null) o.put("bank",bank.trim());
                if(capacityAh>=0) o.put("capacityAh",capacityAh);
                if(bmsType!=null) o.put("bmsType",bmsType);
                if(address!=null) o.put("address",address);
            } catch(Exception ignored) {}
            break;
        }
        saveBatteryConfigsArray(arr);
    }

    private void deleteBatteryConfig(int id) {
        JSONArray arr=getBatteryConfigsArray(), out=new JSONArray();
        for(int i=0;i<arr.length();i++) { JSONObject o=arr.optJSONObject(i); if(o!=null&&o.optInt("id",-1)!=id) out.put(o); }
        saveBatteryConfigsArray(out);
        BluetoothGatt g=batteryGatts.remove(id); if(g!=null) try{g.close();}catch(Exception ignored){}
        humsienkDetected.remove(id);
    }

    private void requestLocationIfNeeded() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
        else startLocationUpdates();
    }

    private boolean hasBluetoothPermissions() {
        if (Build.VERSION.SDK_INT < 31) return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        return checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestBluetoothIfNeeded() {
        if (!hasBluetoothPermissions() && Build.VERSION.SDK_INT >= 31) requestPermissions(new String[]{Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}, REQ_BLUETOOTH);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOCATION && grantResults.length>0 && grantResults[0]==PackageManager.PERMISSION_GRANTED) startLocationUpdates();
        if (requestCode == REQ_BLUETOOTH && hasBluetoothPermissions()) { refreshScanner(); connectSavedBatteries(); }
    }

    private void startLocationUpdates() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 0.5f, this);
            Location last=locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER); if(last!=null) onLocationChanged(last);
        } catch(Exception ignored) {}
    }

    @Override public void onLocationChanged(Location location) {
        try {
            JSONObject o=new JSONObject(); o.put("lat",location.getLatitude()); o.put("lon",location.getLongitude()); o.put("accuracy",location.hasAccuracy()?location.getAccuracy():-1);
            o.put("speedKts",location.hasSpeed()?location.getSpeed()*1.94384449:0); o.put("bearing",location.hasBearing()?location.getBearing():0); o.put("altitude",location.hasAltitude()?location.getAltitude():0); o.put("time",location.getTime());
            eval("window.BoatStation&&BoatStation.updateGPS("+o+")");
        } catch(Exception ignored) {}
    }

    private void pushPhoneStatus() {
        try {
            Intent battery=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED)); int level=0,tempTenths=0; boolean charging=false;
            if(battery!=null){int raw=battery.getIntExtra(BatteryManager.EXTRA_LEVEL,-1),scale=battery.getIntExtra(BatteryManager.EXTRA_SCALE,100); level=scale>0?Math.round(raw*100f/scale):raw; tempTenths=battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE,0); int status=battery.getIntExtra(BatteryManager.EXTRA_STATUS,-1); charging=status==BatteryManager.BATTERY_STATUS_CHARGING||status==BatteryManager.BATTERY_STATUS_FULL;}
            long chargeTimeMs=-1; if(Build.VERSION.SDK_INT>=28){BatteryManager bm=(BatteryManager)getSystemService(Context.BATTERY_SERVICE); if(bm!=null) chargeTimeMs=bm.computeChargeTimeRemaining();}
            JSONObject o=new JSONObject(); o.put("battery",level); o.put("batteryTemp",tempTenths/10.0); o.put("charging",charging); o.put("network",getNetworkLabel()); o.put("model",Build.MANUFACTURER+" "+Build.MODEL); o.put("android",Build.VERSION.RELEASE); o.put("version","0.0.8"); o.put("chargeTimeMs",Math.max(0,chargeTimeMs));
            eval("window.BoatStation&&BoatStation.updatePhone("+o+")");
        } catch(Exception ignored) {}
    }

    private String getNetworkLabel(){try{ConnectivityManager cm=(ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);Network n=cm.getActiveNetwork();if(n==null)return"Offline";NetworkCapabilities c=cm.getNetworkCapabilities(n);if(c==null)return"Online";if(c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return"Wi-Fi";if(c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR))return"Datos móviles";return"Online";}catch(Exception e){return"Desconocida";}}

    private void refreshScanner(){if(bluetoothAdapter!=null)bleScanner=bluetoothAdapter.getBluetoothLeScanner();}
    private final ScanCallback scanCallback=new ScanCallback(){@Override public void onScanResult(int callbackType,ScanResult result){try{BluetoothDevice d=result.getDevice();String name=result.getScanRecord()!=null?result.getScanRecord().getDeviceName():null;if((name==null||name.isEmpty())&&(Build.VERSION.SDK_INT<31||checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED))name=d.getName();JSONObject o=new JSONObject();o.put("name",name==null?"":name);o.put("address",d.getAddress());o.put("rssi",result.getRssi());eval("window.BoatStation&&BoatStation.onBleScanResult("+o+")");}catch(Exception ignored){}}};
    private void startBatteryScanInternal(){if(!hasBluetoothPermissions()){requestBluetoothIfNeeded();return;}refreshScanner();if(bleScanner==null||bluetoothAdapter==null||!bluetoothAdapter.isEnabled())return;try{if(scanning)bleScanner.stopScan(scanCallback);scanning=true;bleScanner.startScan(scanCallback);handler.postDelayed(this::stopBatteryScanInternal,10000);}catch(Exception ignored){}}
    private void stopBatteryScanInternal(){if(!scanning||bleScanner==null||!hasBluetoothPermissions())return;try{bleScanner.stopScan(scanCallback);}catch(Exception ignored){}scanning=false;}

    private JSONArray savedBatteryJson(){JSONArray arr=getBatteryConfigsArray();for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o!=null)try{o.put("connected",batteryGatts.containsKey(o.optInt("id")));o.put("detectedBms",Boolean.TRUE.equals(humsienkDetected.get(o.optInt("id")))?"Humsienk":"");}catch(Exception ignored){}}return arr;}

    private void connectSavedBatteries(){if(!hasBluetoothPermissions()||bluetoothAdapter==null||!bluetoothAdapter.isEnabled())return;JSONArray arr=getBatteryConfigsArray();for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o!=null&& !o.optString("address","").isEmpty())connectBattery(o.optInt("id"));}}
    private void connectBattery(int id){if(!hasBluetoothPermissions()||bluetoothAdapter==null)return;JSONObject c=batteryConfig(id);if(c==null)return;String address=c.optString("address","");if(address.isEmpty())return;try{BluetoothGatt old=batteryGatts.remove(id);if(old!=null)old.close();BluetoothDevice device=bluetoothAdapter.getRemoteDevice(address);BluetoothGatt g=device.connectGatt(this,true,new BatteryGattCallback(id));batteryGatts.put(id,g);pushBatteryConnection(id,false);}catch(Exception ignored){}}
    private void pushBatteryConnection(int id,boolean connected){JSONObject c=batteryConfig(id);if(c==null)return;try{JSONObject o=new JSONObject(c.toString());o.put("connected",connected);o.put("detectedBms",Boolean.TRUE.equals(humsienkDetected.get(id))?"Humsienk":"");eval("window.BoatStation&&BoatStation.onBatteryConnection("+o+")");}catch(Exception ignored){}}

    private static String hex(byte[] data){if(data==null)return"";StringBuilder sb=new StringBuilder();for(byte b:data){if(sb.length()>0)sb.append(' ');sb.append(String.format(java.util.Locale.US,"%02X",b&0xFF));}return sb.toString();}
    private static long u32le(byte[] b,int o){return((long)b[o]&255)|(((long)b[o+1]&255)<<8)|(((long)b[o+2]&255)<<16)|(((long)b[o+3]&255)<<24);}
    private static int i32le(byte[] b,int o){return(b[o]&255)|((b[o+1]&255)<<8)|((b[o+2]&255)<<16)|(b[o+3]<<24);}
    private static int u16le(byte[] b,int o){return(b[o]&255)|((b[o+1]&255)<<8);}

    private void parseHumsienkInfo(int id, byte[] v){
        if(v==null||v.length<21|| (v[0]&255)!=0xAA || (v[1]&255)!=0x21)return;
        try{
            double volts=u16le(v,3)/1000.0; double amps=i32le(v,7)/1000.0; int soc=v[11]&255;
            double remainingAh=u32le(v,13)/1000.0; double totalAh=u32le(v,17)/1000.0;
            JSONObject o=new JSONObject();o.put("id",id);o.put("voltage",volts);o.put("current",amps);o.put("power",volts*amps);o.put("soc",soc);o.put("remainingAh",remainingAh);o.put("totalAh",totalAh);o.put("time",System.currentTimeMillis());o.put("bmsType","Humsienk");
            eval("window.BoatStation&&BoatStation.onBatteryData("+o+")");
            JSONObject cfg=batteryConfig(id); if(cfg!=null && cfg.optInt("capacityAh",0)<=0 && totalAh>0 && totalAh<5000) updateBatteryConfig(id,null,null,(int)Math.round(totalAh),null,null);
        }catch(Exception ignored){}
    }

    private void subscribe(BluetoothGatt g,BluetoothGattCharacteristic c){if(!hasBluetoothPermissions())return;try{g.setCharacteristicNotification(c,true);BluetoothGattDescriptor d=c.getDescriptor(CCCD);if(d!=null){d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);g.writeDescriptor(d);}}catch(Exception ignored){}}
    private void pollBattery(int id){BluetoothGatt g=batteryGatts.get(id);if(g==null||!Boolean.TRUE.equals(humsienkDetected.get(id))||!hasBluetoothPermissions())return;try{BluetoothGattService s=g.getService(HUMSIENK_SERVICE);if(s==null)return;BluetoothGattCharacteristic w=s.getCharacteristic(HUMSIENK_WRITE);if(w==null)return;w.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);w.setValue(HUMSIENK_INFO);g.writeCharacteristic(w);}catch(Exception ignored){}}
    private void pollAllBatteries(){for(Integer id:new ArrayList<>(batteryGatts.keySet()))pollBattery(id);}

    private class BatteryGattCallback extends BluetoothGattCallback{
        private final int id; BatteryGattCallback(int id){this.id=id;}
        @Override public void onConnectionStateChange(BluetoothGatt g,int status,int newState){boolean connected=newState==BluetoothProfile.STATE_CONNECTED;if(connected){batteryGatts.put(id,g);pushBatteryConnection(id,true);if(hasBluetoothPermissions())try{g.discoverServices();}catch(Exception ignored){}}else{batteryGatts.remove(id);humsienkDetected.remove(id);pushBatteryConnection(id,false);}}
        @Override public void onServicesDiscovered(BluetoothGatt g,int status){try{JSONArray services=new JSONArray();for(BluetoothGattService s:g.getServices()){JSONObject so=new JSONObject();so.put("uuid",s.getUuid().toString());JSONArray chars=new JSONArray();for(BluetoothGattCharacteristic c:s.getCharacteristics()){JSONObject co=new JSONObject();co.put("uuid",c.getUuid().toString());co.put("propertiesMask",c.getProperties());chars.put(co);}so.put("characteristics",chars);services.put(so);}JSONObject d=new JSONObject();d.put("id",id);d.put("services",services);eval("window.BoatStation&&BoatStation.onBatteryServices("+d+")");BluetoothGattService hs=g.getService(HUMSIENK_SERVICE);if(hs!=null&&hs.getCharacteristic(HUMSIENK_WRITE)!=null&&hs.getCharacteristic(HUMSIENK_NOTIFY)!=null){humsienkDetected.put(id,true);subscribe(g,hs.getCharacteristic(HUMSIENK_NOTIFY));pushBatteryConnection(id,true);handler.postDelayed(()->pollBattery(id),1200);}}catch(Exception ignored){}}
        @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c){byte[] v=c.getValue();try{JSONObject o=new JSONObject();o.put("id",id);o.put("characteristic",c.getUuid().toString());o.put("hex",hex(v));eval("window.BoatStation&&BoatStation.onBatteryRaw("+o+")");}catch(Exception ignored){}if(HUMSIENK_NOTIFY.equals(c.getUuid()))parseHumsienkInfo(id,v);}
    }

    public class NativeBridge{
        @JavascriptInterface public void startBatteryScan(){runOnUiThread(MainActivity.this::startBatteryScanInternal);}
        @JavascriptInterface public void stopBatteryScan(){runOnUiThread(MainActivity.this::stopBatteryScanInternal);}
        @JavascriptInterface public String getSavedBatteries(){return savedBatteryJson().toString();}
        @JavascriptInterface public int addBattery(String name,String bank,int capacityAh,String bmsType){return addBatteryConfig(name,bank,capacityAh,bmsType);}
        @JavascriptInterface public void updateBattery(int id,String name,String bank,int capacityAh,String bmsType){runOnUiThread(()->{updateBatteryConfig(id,name,bank,Math.max(0,capacityAh),bmsType,null);pushBatteryConnection(id,batteryGatts.containsKey(id));});}
        @JavascriptInterface public void setBatteryAddress(int id,String address){runOnUiThread(()->{updateBatteryConfig(id,null,null,-1,null,address);connectBattery(id);});}
        @JavascriptInterface public void deleteBattery(int id){runOnUiThread(()->deleteBatteryConfig(id));}
        @JavascriptInterface public void reconnectBatteries(){runOnUiThread(MainActivity.this::connectSavedBatteries);}
        @JavascriptInterface public void pollBattery(int id){runOnUiThread(()->MainActivity.this.pollBattery(id));}
    }

    @Override protected void onResume(){super.onResume();if(accelSensor!=null)sensorManager.registerListener(this,accelSensor,SensorManager.SENSOR_DELAY_UI);if(magneticSensor!=null)sensorManager.registerListener(this,magneticSensor,SensorManager.SENSOR_DELAY_UI);handler.removeCallbacks(statusTicker);handler.post(statusTicker);if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED)startLocationUpdates();handler.postDelayed(this::connectSavedBatteries,800);}
    @Override protected void onPause(){super.onPause();sensorManager.unregisterListener(this);handler.removeCallbacks(statusTicker);stopBatteryScanInternal();try{locationManager.removeUpdates(this);}catch(Exception ignored){}}
    @Override protected void onDestroy(){super.onDestroy();for(BluetoothGatt g:batteryGatts.values())try{g.close();}catch(Exception ignored){}batteryGatts.clear();}

    @Override public void onSensorChanged(SensorEvent event){if(event.sensor.getType()==Sensor.TYPE_ACCELEROMETER){System.arraycopy(event.values,0,gravity,0,3);hasGravity=true;double magnitude=Math.sqrt(event.values[0]*event.values[0]+event.values[1]*event.values[1]+event.values[2]*event.values[2]);double motion=Math.abs(magnitude-SensorManager.GRAVITY_EARTH);eval("window.BoatStation&&BoatStation.updateMotion("+String.format(java.util.Locale.US,"%.3f",motion)+")");}else if(event.sensor.getType()==Sensor.TYPE_MAGNETIC_FIELD){System.arraycopy(event.values,0,geomagnetic,0,3);hasGeomagnetic=true;}if(hasGravity&&hasGeomagnetic){float[]R=new float[9],I=new float[9];if(SensorManager.getRotationMatrix(R,I,gravity,geomagnetic)){float[]orientation=new float[3];SensorManager.getOrientation(R,orientation);double azimuth=Math.toDegrees(orientation[0]);if(azimuth<0)azimuth+=360;eval("window.BoatStation&&BoatStation.updateCompass("+String.format(java.util.Locale.US,"%.1f",azimuth)+")");}}}
    @Override public void onAccuracyChanged(Sensor sensor,int accuracy){}
    @Override public void onProviderEnabled(String provider){}
    @Override public void onProviderDisabled(String provider){}
    @Override public void onStatusChanged(String provider,int status,Bundle extras){}
    private void eval(String js){if(webView!=null)webView.post(()->webView.evaluateJavascript(js,null));}
    @Override public void onBackPressed(){if(webView!=null&&webView.canGoBack())webView.goBack();else super.onBackPressed();}
}
