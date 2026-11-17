"""Match public activity venues only; mailing recipients are never geocoded."""
from datetime import datetime
import json
import re
import unicodedata
from zoneinfo import ZoneInfo
from update_stamps import ROOT

def normalize(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC',value).replace('台','臺'))

def activity_venue(item):
    return re.split(r'(?:[（(]\s*)?(?:代辦實寄郵件|郵件請寄|代辦實寄|主辦局|局贈封)',item.get('venue_note',''))[0].strip().rstrip('（(').strip()

def is_current_location(item, point):
    return (isinstance(point, dict) and normalize(point.get('venue','')) == normalize(activity_venue(item))
            and isinstance(point.get('lat'), (int,float)) and isinstance(point.get('lon'), (int,float))
            and 20 <= point['lat'] <= 27 and 118 <= point['lon'] <= 123)

def build_activity_locations(offices, root=ROOT):
    records=json.loads((root/'data'/'stamps.json').read_text(encoding='utf8'))['items']
    venues=json.loads((root/'data'/'activity_venues.json').read_text(encoding='utf8'))['venues']
    for p in venues:
        if not (20 <= p['lat'] <= 27 and 118 <= p['lon'] <= 123 and p.get('source_url','').startswith('https://')):
            raise ValueError('活動參考座標或來源格式錯誤')
    result={}
    for item in records:
        venue=activity_venue(item)
        text=normalize(venue)
        matches=[p for p in venues if all(normalize(s) in text for s in p['match_all'])]
        if len(matches)==1:
            p=matches[0]
            result[item['id']]={k:p[k] for k in ('name','lat','lon','county','source_url','precision')}
        elif not matches:
            # Only an explicitly named activity post office can supply its coordinates.
            candidates=[p for p in offices.values() if text.startswith(normalize(p['name'])) and isinstance(p.get('lat'),(int,float)) and isinstance(p.get('lon'),(int,float))]
            if candidates:
                p=max(candidates,key=lambda p:len(p['name']))
                city=re.search(r'^\d+\s*([^\s]+?[縣市])',p['address'])
                result[item['id']]=dict(name=p['name'],lat=p['lat'],lon=p['lon'],county=city[1] if city else '',source_url='https://www.post.gov.tw/post/internet/I_location/index.jsp?ID=1901',precision='郵局參考點')
        if item['id'] in result:
            result[item['id']]['venue']=venue
    return dict(updated_at=datetime.now(ZoneInfo('Asia/Taipei')).date().isoformat(),locations=result)

def write_activity_locations(offices):
    data=build_activity_locations(offices)
    path=ROOT/'data'/'activity_locations.json'
    temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    temp.replace(path)
