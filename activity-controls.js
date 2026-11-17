'use strict';
window.ActivityLocationUI={create(redisplay){
  const $=id=>document.getElementById(id),tools=window.ActivityTools;
  const state={locations:{},position:null,ready:false,request:0};
  const status=$('activity-location-status'),button=$('locate-activity'),clear=$('clear-activity-location');
  function reset(){state.request++;state.position=null;clear.hidden=true;$('nearby-option').disabled=true;button.disabled=!state.ready;button.textContent='依我的位置找臨時郵局';if($('sort').value==='nearby')$('sort').value='asc';status.textContent=state.ready?'依活動地點計算直線距離；你的位置只在此頁使用，不會上傳。':'活動地點資料暫時無法載入，可先依日期或地區查詢。';}
  button.addEventListener('click',()=>{
    if(!navigator.geolocation){status.textContent='瀏覽器不支援定位，仍可依日期或地區排序。';return;}
    const request=++state.request;button.disabled=true;status.textContent='正在取得位置，請允許瀏覽器定位…';
    navigator.geolocation.getCurrentPosition(({coords})=>{
      if(request!==state.request)return;
      state.position={latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy};
      button.disabled=false;button.textContent='重新定位';clear.hidden=false;$('nearby-option').disabled=false;$('sort').value='nearby';redisplay();
    },error=>{
      if(request!==state.request)return;
      button.disabled=false;
      status.textContent=error.code===1?'未取得定位授權，可在瀏覽器開啟權限後重試；仍可依日期或地區排序。':'暫時無法取得位置，請稍後再試；仍可依日期或地區排序。';
      if(state.position)status.textContent+=' 目前保留上次定位，可按「清除定位」移除。';
    },{enableHighAccuracy:false,timeout:10000,maximumAge:0});
  });
  clear.addEventListener('click',()=>{reset();redisplay();});
  fetch('data/activity_locations.json?v=20261117',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error();return response.json();}).then(data=>{
    if(!data.locations||typeof data.locations!=='object')throw Error();state.locations=data.locations;state.ready=true;reset();redisplay();
  }).catch(()=>{state.ready=false;reset();});
  return {
    get position(){return state.position;},get locations(){return state.locations;},
    point:item=>tools.locationFor(item,state.locations),
    compare:(a,b)=>tools.compare(a,b,$('sort').value,state.locations,state.position),
    reset,
    afterDisplay(items){
      if(!state.position)return;
      const missing=items.filter(item=>!tools.locationFor(item,state.locations)).length;
      let message=$('sort').value==='nearby'?($('history').checked?'依過往活動地點的直線距離排序，非目前可前往的臨局。':'依活動地點直線距離排序，只列今天及未來場次。'):'已取得位置，可切換「距離近到遠」。';
      if(missing)message+=' '+missing+' 場活動座標尚待確認，距離排序時列在最後。';
      if(state.position.accuracy>1000)message+=' 目前定位精度約 '+(state.position.accuracy/1000).toFixed(1)+' 公里，距離僅供參考。';
      status.textContent=message+' 山區距離不代表開車時間。';
    },
    distanceLabel(item){if(!state.position)return '';const p=tools.locationFor(item,state.locations);return p?'活動地點距你約 '+tools.distance(state.position,p).toFixed(1)+' 公里（直線）':'活動座標尚待確認';}
  };
}};
