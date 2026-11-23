const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 let current=null,nativeState='none',started=0,installed=0;
 const create=()=>{const nodes={};for(const key of ['[data-apk-heading]','[data-apk-detail]','[data-core-apk-download]'])nodes[key]={textContent:'',disabled:false,addEventListener(_,fn){this.click=fn}};return {dataset:{},style:{},querySelector:key=>nodes[key],remove(){if(current===this)current=null},nodes}};
 const inner={querySelector:key=>key==='[data-core-apk-update]'?current:null,appendChild(row){current=row},insertBefore(row){current=row}};
 const win={BoatStation:{updatePhone(){}},addEventListener(){},CoreBridge:{getApkVersion:()=>'1.2.172',getApkDownloadState:()=>nativeState,getApkDownloadVersion:()=>'1.2.173',startApkDownload(){started++;nativeState='downloading';return true},installDownloadedApk(){installed++;return true}}};
 const doc={addEventListener(){},querySelector(s){return s==='#menuSheet .sheet-inner'?inner:null},querySelectorAll(s){return s==='[data-core-apk-update]'&&current?[current]:[]},getElementById(){return null},createElement:create};
 const ctx={window:win,CoreBridge:win.CoreBridge,document:doc,URL,URLSearchParams,location:{search:'?mode=station'},fetch:async()=>({ok:true,json:async()=>({version:'1.2.173',available:true})}),setTimeout(){},setInterval(){return 1},clearInterval(){},Date,console};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps/boat-station/web/apk-update.js','utf8'),ctx);await win.BoatStationApkUpdate.check();
 assert.match(current.nodes['[data-apk-detail]'].textContent,/Instalada: 1\.2\.172 · Disponible: 1\.2\.173/);
 const row=current,button=row.nodes['[data-core-apk-download]'];win.BoatStation.updatePhone({version:'1.2.172'});assert.equal(current,row,'telemetry must not replace a button while being tapped');
 button.click({preventDefault(){},stopPropagation(){}});assert.equal(started,1);assert.equal(current,row);assert.equal(button.disabled,true);
 nativeState='ready';await win.BoatStationApkUpdate.check();assert.equal(button.textContent,'Instalar');button.click({preventDefault(){},stopPropagation(){}});assert.equal(installed,1);
 console.log('Versiones, descarga, actualización estable e instalación verificadas');
})().catch(e=>{console.error(e);process.exitCode=1});
