const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 let current=null,downloads=[],nativeState='none';
 const nodes={};for(const key of ['[data-apk-heading]','[data-apk-detail]','[data-core-apk-download]'])nodes[key]={textContent:'',disabled:false,addEventListener(_,fn){this.click=fn}};
 const inner={querySelector:k=>k==='[data-core-apk-update]'?current:null,appendChild(r){current=r},insertBefore(r){current=r}};
 const staticButton={textContent:'',disabled:false},status={textContent:''};const staticRow={hidden:false,querySelector:k=>k==='small'?status:staticButton};
 const win={BoatStationRuntime:{isClient:()=>true},BoatStation:{updatePhone(){}},addEventListener(){},CoreBridge:{getApkVersion:()=>'1.2.174',getApkDownloadState:()=>nativeState,getApkDownloadVersion:()=>'1.2.176',startApkDownload(url,version){downloads.push({url,version});nativeState='downloading';return true}}};
 const doc={addEventListener(){},querySelector(k){return k==='#menuSheet .sheet-inner'?inner:k==='[data-server-apk-download]'?staticRow:null},querySelectorAll(){return current?[current]:[]},getElementById(){return null},createElement(){return {dataset:{},style:{},querySelector:k=>nodes[k],remove(){current=null}}}};
 const ctx={window:win,CoreBridge:win.CoreBridge,document:doc,URL,URLSearchParams,location:{search:'?mode=client'},fetch:async()=>({ok:true,text:async()=>'1.2.176'}),setTimeout(){},setInterval(){return 1},clearInterval(){},Date,console};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps/boat-station/web/apk-update.js','utf8'),ctx);await win.BoatStationApkUpdate.check();
 assert.equal(win.BoatStationApkUpdate.getInstalled(),'1.2.174');win.BoatStation.updatePhone({version:'1.2.176'});
 assert.equal(win.BoatStationApkUpdate.getInstalled(),'1.2.174','remote server version must not overwrite client version');assert.ok(current,'download remains available');assert.match(nodes['[data-apk-detail]'].textContent,/Instalada: 1\.2\.174 · Disponible: 1\.2\.176/);
 nodes['[data-core-apk-download]'].click({preventDefault(){},stopPropagation(){}});assert.equal(downloads.length,1);assert.equal(downloads[0].version,'1.2.176');assert.match(downloads[0].url,/BoatStation-LastVersion\.apk$/);
 console.log('Client update uses local version and starts the native download');
})().catch(e=>{console.error(e);process.exitCode=1});
