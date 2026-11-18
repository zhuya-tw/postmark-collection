'use strict';
(() => {
 const $=id=>document.getElementById(id), types={offices:'郵局',mailboxes:'郵筒',lockers:'i郵箱'},colors={offices:'#336b5a',mailboxes:'#bd624b',lockers:'#426ab0'};
 let items=[], filtered=[], limit=30, position=null, map=null, layer=null, userMarker=null, sequence=0, pending=false, selected=null;
 const norm=s=>String(s||'').normalize('NFKC').replaceAll('台','臺').toLowerCase();
 const distance=(a,b)=>{const rad=x=>x*Math.PI/180, dl=rad(b.lat-a.lat),dn=rad(b.lon-a.lon);const h=Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));};
 const point=i=>Number.isFinite(i.lat)&&Number.isFinite(i.lon);
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 function controls(){ $('find-nearby').disabled=pending;$('find-nearby').textContent=pending?'正在取得位置…':'依我的位置找附近據點';$('clear-nearby').hidden=!position&&!pending; }
 function updateUser(){if(!map)return;if(userMarker){userMarker.remove();userMarker=null;}if(position)userMarker=L.circleMarker([position.lat,position.lon],{radius:8,color:'#233c4d',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(map).bindTooltip('我的位置');}
 function showOnMap(item){selected=item.id;if(!point(item))return;if(!map){$('map-hint').textContent='請先按「載入互動地圖」，或直接使用導航連結。';$('postal-map').scrollIntoView({behavior:'smooth',block:'center'});return;}map.setView([item.lat,item.lon],16,{animate:false});drawMarkers();}
 function card(item){
  const c=el('article',undefined,'place-card');c.dataset.id=item.id;
  c.append(el('span',types[item.kind]+(position&&point(item)?' · 約 '+(distance(position,item)<1?Math.round(distance(position,item)*1000)+' 公尺':distance(position,item).toFixed(1)+' 公里'):''),'place-tag '+item.kind),el('h3',item.name),el('p',item.address));
  for(const [key,label] of [['landmark','位置'],['service_office','服務單位'],['hours',item.kind==='offices'?'郵務時間':'開放時間'],['note','備註']])if(item[key])c.append(el('p',label+'：'+item[key]));
  if(item.phone)c.append(el('p','聯絡電話：'+item.phone));
  const actions=el('div',undefined,'actions');
  if(point(item)){const b=el('button','在地圖查看','action');b.type='button';b.addEventListener('click',()=>showOnMap(item));actions.append(b);}else c.append(el('p','官方資料未提供有效座標，請依地址確認位置。'));
  const a=el('a','開啟導航 ↗','action');a.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(point(item)?item.lat+','+item.lon:item.address);a.target='_blank';a.rel='noopener noreferrer';actions.append(a);c.append(actions);return c;
 }
 function drawMarkers(){if(!map||!layer)return;layer.clearLayers();const bounds=map.getBounds();const visible=filtered.filter(i=>point(i)&&bounds.contains([i.lat,i.lon]));
  // Prioritize the selected point even when hundreds of points overlap in a city.
  if(selected)visible.sort((a,b)=>(b.id===selected?1:0)-(a.id===selected?1:0));
  for(const item of visible.slice(0,500)){const marker=L.circleMarker([item.lat,item.lon],{radius:map.getZoom()<10?4:7,color:colors[item.kind],weight:1,fillColor:colors[item.kind],fillOpacity:.85}).addTo(layer);marker.bindPopup(()=>{const box=el('div');box.append(card(item));return box;},{maxWidth:320,minWidth:220,maxHeight:140,offset:[0,40],autoPan:false});if(item.id===selected)marker.openPopup();}
  $('map-hint').textContent=visible.length>500?'目前範圍據點較多，先顯示 500 個標記；放大地圖或篩選縣市可看得更清楚。':'地圖顯示篩選結果中有座標的據點。綠：郵局 · 橘：郵筒 · 藍：i郵箱。';
 }
 function drawList(){const list=$('place-list');list.replaceChildren();if(!filtered.length)list.append(el('p','沒有符合條件的據點，試試其他關鍵字或勾選分類。','empty-state'));else list.append(...filtered.slice(0,limit).map(card));$('more-places').hidden=filtered.length<=limit;$('places-status').textContent='找到 '+filtered.length.toLocaleString()+' 個據點'+(position?' · 依直線距離由近至遠':' · 依縣市與名稱排列')+'，已顯示 '+Math.min(limit,filtered.length)+' 個。';}
 function filter(fit=false){limit=30;selected=null;const query=norm($('place-query').value.trim()),county=$('place-county').value, enabled=new Set([...$('place-types').querySelectorAll('input:checked')].map(i=>i.value));filtered=items.filter(i=>enabled.has(i.kind)&&(!county||i.county===county)&&(!query||i.search.includes(query)));
  filtered.sort((a,b)=>position?(point(a)?distance(position,a):Infinity)-(point(b)?distance(position,b):Infinity)||a.name.localeCompare(b.name,'zh-Hant'):a.county.localeCompare(b.county,'zh-Hant')||a.name.localeCompare(b.name,'zh-Hant'));
  drawList();if(map&&fit){const pts=filtered.filter(point).map(i=>[i.lat,i.lon]);if(pts.length)map.fitBounds(pts,{padding:[25,25],maxZoom:13});}drawMarkers();
 }
 async function loadMap(){const button=$('load-map');button.disabled=true;button.textContent='載入中…';try{
  if(!window.L){await new Promise((resolve,reject)=>{const css=el('link');css.rel='stylesheet';css.href='vendor/leaflet.css';document.head.append(css);const script=el('script');script.src='vendor/leaflet.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('library'));};document.head.append(script);});}
  $('postal-map').replaceChildren();map=L.map('postal-map',{preferCanvas:true,fadeAnimation:false}).setView(position?[position.lat,position.lon]:[23.7,121],position?14:7);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).addTo(map);
  let tileFailed=false;tiles.on('tileerror',()=>{if(!tileFailed){tileFailed=true;$('nearby-status').textContent='底圖暫時無法完整載入，據點清單、座標標記與導航仍可使用。';}});
  layer=L.layerGroup().addTo(map);map.on('moveend',drawMarkers);updateUser();if($('place-county').value)filter(true);else drawMarkers();
 }catch{button.disabled=false;button.textContent='重新載入互動地圖';$('map-hint').textContent='地圖暫時無法載入，請使用據點清單或稍後重試。';}}
 $('load-map').addEventListener('click',loadMap);
 $('find-nearby').addEventListener('click',()=>{if(!navigator.geolocation){$('nearby-status').textContent='這個瀏覽器不支援定位，請改用縣市或地址搜尋。';return;}const current=++sequence;pending=true;controls();$('nearby-status').textContent='正在取得位置，請允許瀏覽器的定位要求。';navigator.geolocation.getCurrentPosition(result=>{if(current!==sequence)return;pending=false;const p={lat:result.coords.latitude,lon:result.coords.longitude};if(!point(p)||Math.abs(p.lat)>90||Math.abs(p.lon)>180){controls();$('nearby-status').textContent='未取得有效位置，請重試。';return;}position=p;controls();$('nearby-status').textContent='';filter();updateUser();if(map)map.setView([position.lat,position.lon],14);},error=>{if(current!==sequence)return;pending=false;controls();$('nearby-status').textContent=error.code===1?'未允許定位，仍可用縣市或地址搜尋。':error.code===3?'定位逾時，請再試一次，或改用地址搜尋。':'暫時無法取得位置，請確認裝置定位設定。';},{enableHighAccuracy:false,timeout:10000,maximumAge:0});});
 function clear(){++sequence;pending=false;position=null;controls();updateUser();$('nearby-status').textContent='';filter();if(map)map.setView([23.7,121],7);}
 $('clear-nearby').addEventListener('click',clear);
 $('reset-places').addEventListener('click',()=>{$('place-query').value='';$('place-county').value='';$('place-types').querySelectorAll('input').forEach(i=>i.checked=true);clear();});
 $('place-query').addEventListener('input',()=>filter());$('place-county').addEventListener('change',()=>filter(true));$('place-types').addEventListener('change',()=>filter());$('more-places').addEventListener('click',()=>{limit+=30;drawList();});
 Promise.allSettled(Object.keys(types).map(async kind=>{const response=await fetch('data/map_'+kind+'.json');if(!response.ok)throw new Error(kind);const data=await response.json();if(!Array.isArray(data.items)||!data.items.length)throw new Error(kind);return data.items.map(i=>({...i,kind,search:norm([i.name,i.address,i.landmark,i.service_office].join(' '))}));})).then(results=>{const failed=[];results.forEach((r,n)=>{if(r.status==='fulfilled')items.push(...r.value);else failed.push(types[Object.keys(types)[n]]);});for(const county of [...new Set(items.map(i=>i.county).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'))){const o=el('option',county);o.value=county;$('place-county').append(o);}filter();if(failed.length)$('nearby-status').textContent=failed.join('、')+'資料暫時無法讀取，請稍後重新整理；其他分類仍可查詢。';});
})();



