"""Normalize official postal open data. Each category is an independent snapshot."""
import csv
from datetime import datetime
import hashlib
import html
import io
import json
import math
from pathlib import Path
import re
import sys
from zoneinfo import ZoneInfo
import requests
ROOT = Path(__file__).resolve().parents[1]
URLS = {
 'offices': 'https://www.post.gov.tw/post/internet/Templates/getOpenDataFile.jsp?vkey=B484EB27-B3F0-4D02-8F62-047D20C64078',
 'mailboxes': 'https://www.post.gov.tw/post/internet/Templates/getOpenDataFile.jsp?vkey=B52AC0AE-DE29-48CE-A7EC-2FD8F682BBAE',
 'lockers': 'https://www.post.gov.tw/post/internet/Templates/getOpenDataFile.jsp?vkey=1A689FD9-3BB3-46C9-8D2E-1740616A811F',
}
def clean(value):
 return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', value or ''))).strip()
def coordinate(x, y):
 try:
  lon, lat = float(x), float(y)
  if math.isfinite(lat) and math.isfinite(lon) and 9 <= lat <= 27 and 110 <= lon <= 124:
   return lat, lon
 except (ValueError, TypeError): pass
 return None, None

def parse(kind, content):
 rows = list(csv.DictReader(io.StringIO(content.decode('utf-8-sig', errors='strict'))))
 required = {'offices': ['局名','經度','緯度','地址'], 'mailboxes':['類別','x座標','y座標','路名'], 'lockers':['名稱','座標x','座標y','地址']}[kind]
 if not rows or not all(k in rows[0] for k in required): raise ValueError('官方 CSV 欄位不符')
 items = []
 for row in rows:
  r = {k: clean(v) for k,v in row.items() if k}
  if kind == 'offices':
   name,county = r['局名'],r['縣市']; address = county+r['鄉鎮市區']+r['地址']
   address = (r['六碼郵遞區號']+' '+address).strip()
   x,y=r['經度'],r['緯度']; phone=r['郵務電話']; note=r.get('營業時間備註','')
   hours='；'.join(d+' '+r[d+' 郵務'] for d in ['週一','週二','週三','週四','週五'] if r.get(d+' 郵務'))
   hours+='；'+'；'.join(d+' '+(r.get(d) or '未提供服務') for d in ['週六','週日'])
   extra={'phone':phone,'hours':hours,'note':note}
   key=r['電腦局號']
  elif kind == 'mailboxes':
   county=r['縣市'];address=county+r['鄉鎮市區']+r['路名']; name=r['類別']+' · '+(r['地址描述'] or r['路名'])
   x,y=r['x座標'],r['y座標'];key='|'.join(r.get(k,'') for k in ['類別代號','信筒樣式代號','縣市','鄉鎮市區','路名','地址描述','x座標','y座標'])
   extra={'phone':r['聯絡電話'],'note':r['備註'],'landmark':r['地址描述'],'service_office':r['服務單位'],'subtype':r['類別']}
  else:
   name,address=r['名稱'],r['地址']; match=re.search(r'([^\d\s]{2,3}[縣市])', address);county=match.group(1) if match else ''
   x,y=r['座標x'],r['座標y'];key=name+'|'+address
   address=(r['郵遞區號']+' '+address).strip()
   extra={'hours':r['營業時間'],'landmark':r['相對位置'],'note':r['備註']}
  lat,lon=coordinate(x,y)
  items.append(dict(id=kind+'-'+hashlib.sha256(key.encode()).hexdigest()[:20],name=name,county=county.replace('台','臺'),address=address,lat=lat,lon=lon,**extra))
 # Some official rows are identical; one marker is enough.
 items=list({i['id']:i for i in items}.values())
 value=dict(updated_at=datetime.now(ZoneInfo('Asia/Taipei')).isoformat(timespec='seconds'),source_url=URLS[kind],license='政府資料開放授權條款第1版',items=items)
 validate(value)
 return value

def validate(value, previous=None):
 items=value.get('items',[])
 if not items or len({i['id'] for i in items}) != len(items): raise ValueError('據點資料為空或重複')
 for i in items:
  if not i.get('name') or not i.get('address'): raise ValueError('據點名稱或地址缺漏')
  if (i.get('lat') is None) != (i.get('lon') is None): raise ValueError('座標缺漏')
  if i.get('lat') is not None and coordinate(i['lon'],i['lat']) == (None,None): raise ValueError('座標超出合理範圍')
 if sum(i['lat'] is not None for i in items) < len(items)*.9: raise ValueError('可用座標不足九成')
 if previous and len(items) < len(previous.get('items',[]))*.8: raise ValueError('筆數突降超過兩成，保留上次資料')

if __name__ == '__main__':
 kind=sys.argv[1]
 response=requests.get(URLS[kind], timeout=(15,60));response.raise_for_status()
 value=parse(kind,response.content)
 target=ROOT/'data'/('map_'+kind+'.json');tmp=target.with_suffix('.tmp')
 tmp.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8');tmp.replace(target)
 print(kind,len(value['items']))
