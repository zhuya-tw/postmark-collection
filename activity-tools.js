'use strict';
((root) => {
  const counties = ['基隆市','臺北市','新北市','桃園市','新竹縣','新竹市','宜蘭縣','苗栗縣','臺中市','彰化縣','花蓮縣','南投縣','雲林縣','嘉義市','嘉義縣','臺南市','臺東縣','高雄市','屏東縣','澎湖縣','金門縣','連江縣'];
  const regions = {'基隆':'基隆市','臺北':'臺北市','板橋':'新北市','三重':'新北市','桃園':'桃園市','新竹':'新竹市','苗栗':'苗栗縣','臺中':'臺中市','彰化':'彰化縣','南投':'南投縣','雲林':'雲林縣','嘉義':'嘉義市','臺南':'臺南市','高雄':'高雄市','屏東':'屏東縣','宜蘭':'宜蘭縣','花蓮':'花蓮縣','臺東':'臺東縣','澎湖':'澎湖縣','金門':'金門縣','馬祖':'連江縣'};
  const normalize = value => String(value || '').normalize('NFKC').replace(/台/g,'臺').replace(/\s/g,'');
  const venue = item => String(item.venue_note || '').split(/(?:[（(]\s*)?(?:代辦實寄郵件|郵件請寄|代辦實寄|主辦局|局贈封)/)[0].trim().replace(/[（(]\s*$/, '');
  function locationFor(item, locations) {
    const p = locations[item.id];
    return p && normalize(p.venue) === normalize(venue(item)) && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat >= 20 && p.lat <= 27 && p.lon >= 118 && p.lon <= 123 ? p : null;
  }
  function county(item, locations) {
    const text = normalize(venue(item));
    return counties.find(name => text.includes(name)) || locationFor(item, locations)?.county || regions[normalize(item.region)] || '';
  }
  function distance(position, point) {
    if (!position || !point) return Infinity;
    const radians = n => n * Math.PI / 180;
    const h = Math.sin(radians(point.lat-position.latitude)/2)**2 + Math.cos(radians(position.latitude))*Math.cos(radians(point.lat))*Math.sin(radians(point.lon-position.longitude)/2)**2;
    return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1,h)), Math.sqrt(Math.max(0,1-h)));
  }
  function compare(a,b,mode,locations,position) {
    const chronological = a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    if (mode === 'desc') return b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
    if (mode === 'area') {
      const rank = item => {const n=counties.indexOf(county(item,locations));return n < 0 ? 99 : n;};
      return rank(a)-rank(b) || chronological;
    }
    if (mode === 'nearby' && position) {
      const da=distance(position,locationFor(a,locations)),db=distance(position,locationFor(b,locations));
      return (da===db ? 0 : da-db) || chronological;
    }
    return chronological;
  }
  const api={normalize,venue,locationFor,county,distance,compare};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.ActivityTools=api;
})(typeof globalThis === 'undefined' ? this : globalThis);
