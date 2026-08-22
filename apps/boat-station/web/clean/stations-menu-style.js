const style=document.createElement('style');
style.textContent=`
#stationManagerRow{cursor:pointer!important;display:block!important;padding:18px 2px!important;border-bottom:1px solid var(--line,#17394f)!important}
#stationManagerRow>span{display:block!important;font-size:18px!important;line-height:1.25!important;font-weight:500!important;color:var(--text,#f4f8fb)!important}
#stationManagerRow .sub{display:block!important;margin-top:6px!important;font-size:13px!important;line-height:1.3!important;font-weight:400!important;color:var(--muted,#94a7b6)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
#stationManagerRow>.btn{display:none!important}
`;
document.head.appendChild(style);

function cleanStationMenu(){
  const row=document.getElementById('stationManagerRow');
  if(!row)return;
  const btn=row.querySelector(':scope > .btn');
  if(btn)btn.remove();
}
cleanStationMenu();
new MutationObserver(cleanStationMenu).observe(document.documentElement,{childList:true,subtree:true});
