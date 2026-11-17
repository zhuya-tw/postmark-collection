const test=require('node:test'),assert=require('node:assert/strict');
const t=require('../activity-tools.js');
const a={id:'a',date:'2026-11-20',region:'三重',venue_note:'新北市三重區五華國小（郵件請寄臺北郵局）'};
const b={id:'b',date:'2026-11-19',region:'高雄',venue_note:'高雄市活動公園'};
const c={id:'c',date:'2026-11-18',region:'臺北',venue_note:'未知活動地點'};
const locations={a:{venue:t.venue(a),lat:25.08,lon:121.49,county:'新北市'},b:{venue:t.venue(b),lat:22.63,lon:120.3,county:'高雄市'}};
test('county ordering groups jurisdictions; dates remain available',()=>{
 assert.deepEqual([b,a,c].sort((x,y)=>t.compare(x,y,'area',locations)).map(x=>x.id),['c','a','b']);
 assert.deepEqual([a,b,c].sort((x,y)=>t.compare(x,y,'asc',locations)).map(x=>x.id),['c','b','a']);
 assert.deepEqual([b,c,a].sort((x,y)=>t.compare(x,y,'desc',locations)).map(x=>x.id),['a','b','c']);
});
test('nearest puts missing coordinates last and changes with user position',()=>{
 assert.deepEqual([c,b,a].sort((x,y)=>t.compare(x,y,'nearby',locations,{latitude:25.08,longitude:121.49})).map(x=>x.id),['a','b','c']);
 assert.deepEqual([a,c,b].sort((x,y)=>t.compare(x,y,'nearby',locations,{latitude:22.63,longitude:120.3})).map(x=>x.id),['b','a','c']);
 assert.equal(t.distance({latitude:25.08,longitude:121.49},locations.a),0);
});
test('changed venue invalidates old location; recipient changes do not move activity',()=>{
 assert.equal(t.locationFor({...a,venue_note:'其他活動地點（郵件請寄臺北郵局）'},locations),null);
 assert.equal(t.locationFor({...a,venue_note:'新北市三重區五華國小（郵件請寄高雄郵局）'},locations).lat,25.08);
});
