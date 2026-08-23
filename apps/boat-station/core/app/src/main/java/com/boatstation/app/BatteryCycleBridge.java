package com.boatstation.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Sequential BLE battery runtime.
 * Only one BMS is connected at a time: connect -> read -> disconnect -> next battery.
 */
public final class BatteryCycleBridge {
    private static final String PREFS="boat_station";
    private static final String BATTERY_CONFIGS="battery_configs_v2";
    private static final String BANK_CONFIGS="battery_banks_v1";
    private static final UUID CCCD=UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final UUID HUM_SERVICE=UUID.fromString("00000001-0000-1000-8000-00805f9b34fb");
    private static final UUID HUM_WRITE=UUID.fromString("00000002-0000-1000-8000-00805f9b34fb");
    private static final UUID HUM_NOTIFY=UUID.fromString("00000003-0000-1000-8000-00805f9b34fb");
    private static final long ROUND_MS=60000L;
    private static final long DATA_FRESH_MS=90000L;
    private static final long DEVICE_TIMEOUT_MS=10000L;

    private final BoatStationActivity activity;
    private final WebView webView;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothGatt activeGatt;
    private int activeId=-1;
    private int generation=0;
    private int retry=0;
    private final ByteArrayOutputStream rx=new ByteArrayOutputStream();
    private List<Integer> roundIds=new ArrayList<>();
    private int roundIndex=0;
    private boolean running=false;

    BatteryCycleBridge(BoatStationActivity activity, WebView webView){
        this.activity=activity;
        this.webView=webView;
        BluetoothManager bm=(BluetoothManager)activity.getSystemService(Context.BLUETOOTH_SERVICE);
        adapter=bm!=null?bm.getAdapter():null;
    }

    private SharedPreferences prefs(){return activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    private JSONArray readArr(String key){try{return new JSONArray(prefs().getString(key,"[]"));}catch(Exception e){return new JSONArray();}}
    private void writeArr(String key,JSONArray a){prefs().edit().putString(key,a.toString()).apply();}
    private JSONArray batteries(){return readArr(BATTERY_CONFIGS);}
    private JSONArray banks(){return readArr(BANK_CONFIGS);}
    private JSONObject byId(JSONArray a,int id){for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&o.optInt("id",-1)==id)return o;}return null;}
    private int nextId(JSONArray a){int max=0;for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null)max=Math.max(max,o.optInt("id",0));}return max+1;}
    private long lastData(int id){return prefs().getLong("battery_cycle_last_"+id,0L);}
    private void setLastData(int id,long t){prefs().edit().putLong("battery_cycle_last_"+id,t).apply();}
    private boolean fresh(int id){long t=lastData(id);return t>0&&System.currentTimeMillis()-t<DATA_FRESH_MS;}

    private boolean hasBt(){
        if(Build.VERSION.SDK_INT<31)return activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;
        return activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;
    }
    private void eval(String js){if(webView!=null)webView.post(()->webView.evaluateJavascript(js,null));}
    private JSONObject config(int id){return byId(batteries(),id);}

    private void emitConnection(int id,boolean connected){
        JSONObject c=config(id);if(c==null)return;
        try{
            JSONObject o=new JSONObject(c.toString());
            o.put("connected",connected);
            o.put("cycleManaged",true);
            long t=lastData(id);if(t>0)o.put("lastDataTime",t);
            eval("window.BoatStation&&BoatStation.onBatteryConnection("+o+")");
        }catch(Exception ignored){}
    }

    private void closeActive(){
        generation++;
        BluetoothGatt g=activeGatt;activeGatt=null;activeId=-1;rx.reset();
        if(g!=null){try{g.disconnect();}catch(Exception ignored){}try{g.close();}catch(Exception ignored){}}
    }

    private void beginRound(){
        if(!running)return;
        closeActive();
        roundIds=new ArrayList<>();
        JSONArray a=batteries();
        for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&!o.optString("address","").isEmpty())roundIds.add(o.optInt("id"));}
        roundIndex=0;
        if(roundIds.isEmpty()){handler.postDelayed(this::beginRound,ROUND_MS);return;}
        beginCurrent();
    }

    private void beginCurrent(){
        if(!running)return;
        if(roundIndex>=roundIds.size()){
            closeActive();
            handler.postDelayed(this::beginRound,ROUND_MS);
            return;
        }
        int id=roundIds.get(roundIndex);
        connect(id,0);
    }

    private void connect(int id,int attempt){
        closeActive();
        retry=attempt;
        JSONObject c=config(id);if(c==null){advance();return;}
        String address=c.optString("address","");
        if(address.isEmpty()||adapter==null||!adapter.isEnabled()||!hasBt()){emitConnection(id,false);advance();return;}
        final int mine=++generation;
        activeId=id;
        try{
            BluetoothDevice device=adapter.getRemoteDevice(address);
            BluetoothGattCallback cb=new GattCb(id,mine);
            activeGatt=device.connectGatt(activity,false,cb,BluetoothDevice.TRANSPORT_LE);
            handler.postDelayed(()->{
                if(mine!=generation||activeId!=id)return;
                if(retry<1){connect(id,retry+1);}else{emitConnection(id,false);advance();}
            },DEVICE_TIMEOUT_MS);
        }catch(Exception e){
            if(attempt<1)handler.postDelayed(()->connect(id,1),1200);else{emitConnection(id,false);advance();}
        }
    }

    private void advance(){
        closeActive();
        roundIndex++;
        handler.postDelayed(this::beginCurrent,500);
    }

    private static byte[] frame(int cmd){int cs=cmd;return new byte[]{(byte)0xAA,(byte)cmd,0,(byte)(cs&255),(byte)((cs>>8)&255)};}
    private static int i32le(byte[] b,int o){return(b[o]&255)|((b[o+1]&255)<<8)|((b[o+2]&255)<<16)|(b[o+3]<<24);}
    private static long u32le(byte[] b,int o){return((long)b[o]&255)|(((long)b[o+1]&255)<<8)|(((long)b[o+2]&255)<<16)|(((long)b[o+3]&255)<<24);}
    private static int u16le(byte[] b,int o){return(b[o]&255)|((b[o+1]&255)<<8);}
    private boolean validFrame(byte[] f){if(f==null||f.length<5||(f[0]&255)!=0xAA)return false;int n=f[2]&255;if(f.length<5+n)return false;int expect=0;for(int i=1;i<3+n;i++)expect=(expect+(f[i]&255))&0xffff;int actual=(f[3+n]&255)|((f[4+n]&255)<<8);return expect==actual;}

    private void accept(int id,int mine,byte[] chunk){
        if(mine!=generation||id!=activeId||chunk==null||chunk.length==0)return;
        try{
            if(rx.size()==0&&chunk[0]!=(byte)0xAA)return;
            rx.write(chunk);byte[] all=rx.toByteArray();if(all.length<3)return;
            int total=(all[2]&255)+5;if(all.length<total)return;
            byte[] f=new byte[total];System.arraycopy(all,0,f,0,total);rx.reset();
            if(validFrame(f)&&parse(id,f)){handler.postDelayed(this::advance,350);}
        }catch(Exception e){rx.reset();}
    }

    private boolean parse(int id,byte[] f){
        int cmd=f[1]&255,n=f[2]&255;if(cmd!=0x21||n<26)return false;
        int p=3;
        try{
            double volts=i32le(f,p)/1000.0,amps=i32le(f,p+4)/1000.0;
            int soc=f[p+8]&255,soh=f[p+9]&255;
            double rem=u32le(f,p+10)/1000.0,total=u32le(f,p+14)/1000.0;
            int cycles=u16le(f,p+18),temp=f[p+20];long now=System.currentTimeMillis();
            setLastData(id,now);
            JSONObject o=new JSONObject();
            o.put("id",id);o.put("voltage",volts);o.put("current",amps);o.put("power",volts*amps);
            o.put("soc",soc);o.put("soh",soh);o.put("remainingAh",rem);o.put("totalAh",total);
            o.put("cycles",cycles);o.put("temperature",temp);o.put("time",now);o.put("lastDataTime",now);
            o.put("connected",true);o.put("cycleManaged",true);o.put("bmsType","Humsienk");
            eval("window.BoatStation&&BoatStation.onBatteryData("+o+")");
            emitConnection(id,true);
            JSONObject c=config(id);
            if(c!=null&&c.optInt("capacityAh",0)<=0&&total>0&&total<5000){
                JSONArray a=batteries();JSONObject x=byId(a,id);if(x!=null){x.put("capacityAh",(int)Math.round(total));writeArr(BATTERY_CONFIGS,a);}
            }
            return true;
        }catch(Exception ignored){return false;}
    }

    private void send(BluetoothGatt g,int mine){
        if(mine!=generation||g!=activeGatt||!hasBt())return;
        try{BluetoothGattService s=g.getService(HUM_SERVICE);BluetoothGattCharacteristic w=s!=null?s.getCharacteristic(HUM_WRITE):null;if(w==null)return;w.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);w.setValue(frame(0x21));g.writeCharacteristic(w);}catch(Exception ignored){}
    }

    private final class GattCb extends BluetoothGattCallback{
        private final int id,mine;GattCb(int id,int mine){this.id=id;this.mine=mine;}
        private boolean live(BluetoothGatt g){return mine==generation&&id==activeId&&g==activeGatt;}
        @Override public void onConnectionStateChange(BluetoothGatt g,int status,int state){
            if(!live(g))return;
            if(status==BluetoothGatt.GATT_SUCCESS&&state==BluetoothProfile.STATE_CONNECTED){
                try{if(!g.requestMtu(247))g.discoverServices();}catch(Exception e){try{g.discoverServices();}catch(Exception ignored){}}
            }else if(state==BluetoothProfile.STATE_DISCONNECTED){if(retry<1)handler.postDelayed(()->connect(id,1),700);else{emitConnection(id,false);advance();}}
        }
        @Override public void onMtuChanged(BluetoothGatt g,int mtu,int status){if(live(g))try{g.discoverServices();}catch(Exception ignored){}}
        @Override public void onServicesDiscovered(BluetoothGatt g,int status){
            if(!live(g)||status!=BluetoothGatt.GATT_SUCCESS)return;
            try{
                BluetoothGattService s=g.getService(HUM_SERVICE);BluetoothGattCharacteristic n=s!=null?s.getCharacteristic(HUM_NOTIFY):null;
                if(n==null){emitConnection(id,false);advance();return;}
                g.setCharacteristicNotification(n,true);BluetoothGattDescriptor d=n.getDescriptor(CCCD);
                if(d==null){emitConnection(id,false);advance();return;}
                d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);g.writeDescriptor(d);
            }catch(Exception e){emitConnection(id,false);advance();}
        }
        @Override public void onDescriptorWrite(BluetoothGatt g,BluetoothGattDescriptor d,int status){if(live(g)&&status==BluetoothGatt.GATT_SUCCESS)handler.postDelayed(()->send(g,mine),180);}
        @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c){if(live(g)&&HUM_NOTIFY.equals(c.getUuid()))accept(id,mine,c.getValue());}
    }

    void start(){if(running)return;running=true;handler.removeCallbacksAndMessages(null);handler.post(this::beginRound);}
    void stop(){running=false;handler.removeCallbacksAndMessages(null);closeActive();}
    void refreshSoon(){if(!running)return;handler.removeCallbacksAndMessages(null);handler.postDelayed(this::beginRound,400);}

    @JavascriptInterface public String getSavedBanks(){return banks().toString();}
    @JavascriptInterface public String getSavedBatteries(){
        JSONArray a=batteries();long now=System.currentTimeMillis();
        for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o==null)continue;try{int id=o.optInt("id");long t=lastData(id);o.put("connected",t>0&&now-t<DATA_FRESH_MS);o.put("cycleManaged",true);if(t>0)o.put("lastDataTime",t);}catch(Exception ignored){}}
        return a.toString();
    }
    @JavascriptInterface public int addBank(String name){JSONArray a=banks();int id=nextId(a);try{JSONObject o=new JSONObject();o.put("id",id);o.put("name",name==null||name.trim().isEmpty()?"Banco "+id:name.trim());a.put(o);writeArr(BANK_CONFIGS,a);}catch(Exception ignored){}return id;}
    @JavascriptInterface public int addBattery(int bankId,String name,int capacityAh,String bmsType){JSONArray a=batteries();int id=nextId(a);try{JSONObject o=new JSONObject();o.put("id",id);o.put("bankId",bankId);o.put("name",name==null||name.trim().isEmpty()?"Batería "+id:name.trim());o.put("address","");o.put("capacityAh",Math.max(0,capacityAh));o.put("bmsType",bmsType==null?"auto":bmsType);a.put(o);writeArr(BATTERY_CONFIGS,a);}catch(Exception ignored){}return id;}
    @JavascriptInterface public void setBatteryAddress(int id,String address){activity.runOnUiThread(()->{JSONArray a=batteries();JSONObject o=byId(a,id);if(o!=null)try{o.put("address",address==null?"":address);}catch(Exception ignored){}writeArr(BATTERY_CONFIGS,a);refreshSoon();});}
    @JavascriptInterface public void deleteBattery(int id){activity.runOnUiThread(()->{JSONArray a=batteries(),out=new JSONArray();for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&o.optInt("id",-1)!=id)out.put(o);}writeArr(BATTERY_CONFIGS,out);prefs().edit().remove("battery_cycle_last_"+id).apply();if(activeId==id)advance();refreshSoon();});}
    @JavascriptInterface public void reconnectBatteries(){activity.runOnUiThread(this::refreshSoon);}
    @JavascriptInterface public void pollBattery(int id){activity.runOnUiThread(()->{roundIds=new ArrayList<>();roundIds.add(id);roundIndex=0;beginCurrent();});}
}
