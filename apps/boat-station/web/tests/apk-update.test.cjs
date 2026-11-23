const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 let starts=0,available=false;
 const win={BoatStationRuntime:{isNative:()=>true},CoreRuntimeBridge:{downloadApk(){starts++;return true}},addEventListener(){},BoatStation:{updatePhone(){}},CoreBridge:{getApkVersion:()=> '1.2.52'}};
 const doc={addEventListener(){},querySelector(){return null},querySelectorAll(){return []},getElementById(){return null}};
 const ctx={window:win,CoreBridge:win.CoreBridge,document:doc,URL,URLSearchParams,location:{search:'?mode=station'},fetch:async()=>({ok:true,json:async()=>({version:'1.2.53',available})}),setTimeout(){},setInterval(){},clearInterval(){},Date,console};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps/boat-station/web/apk-update.js','utf8'),ctx);
 assert.equal(win.BoatStationApkUpdate.downloadLatest(),false);assert.equal(starts,0);
 await win.BoatStationApkUpdate.check();assert.equal(win.BoatStationApkUpdate.downloadLatest(),false);assert.equal(starts,0);
 available=true;await win.BoatStationApkUpdate.check();assert.equal(win.BoatStationApkUpdate.downloadLatest(),true);assert.equal(starts,1);
 console.log('Download requires available verified release metadata');
})().catch(e=>{console.error(e);process.exitCode=1});
