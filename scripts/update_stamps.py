#!/usr/bin/env python3
"""中華郵政臨時郵局網頁擷取與圖片在地備份。

非官方 API。若中華郵政修改 HTML / 限制存取，本程式會失敗退出，
並保留原有 data/stamps.json，不會把舊資料清空。
GitHub Actions 中每天嘗試一次，不依賴瀏覽器跨來源請求。
"""
from __future__ import annotations
import hashlib
import json
import math
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'stamps.json'
VERIFIED = ROOT / 'data' / 'verified_addresses.json'
IMAGES = ROOT / 'images' / 'cache'
BASE = 'https://www.post.gov.tw/post/internet/Philately/index.jsp?ID=507'
INDEX_URL = 'https://www.post.gov.tw/post/internet/Philately/index.jsp'
TODAY = datetime.now(ZoneInfo('Asia/Taipei')).date()
SESSION = requests.Session()
SESSION.headers.update({'User-Agent':'Mozilla/5.0 (compatible; TaiwanPostmarkGallery/1.0; personal-philately-index)',
                        'Referer':'https://www.post.gov.tw/', 'Accept-Language':'zh-TW,zh;q=0.9,en;q=0.6'})


def get(url, params=None, *, timeout=30):
    response = SESSION.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    if not response.encoding or response.encoding.lower() in ('iso-8859-1', 'ascii'):
        response.encoding = response.apparent_encoding
    return response.text


def roc_date(text):
    m = re.search(r'(?<!\d)(\d{2,4})\s*/\s*(\d{1,2})\s*/\s*(\d{1,2})', text)
    if not m:return None
    y,mn,d = map(int,m.groups())
    if y<1911:y+=1911
    try:return date(y,mn,d)
    except ValueError:return None


def date_ranges(start,end, size=40):
    d=start
    while d<=end:
        e=min(d+timedelta(days=size-1),end)
        yield d,e
        d=e+timedelta(days=1)


def official_link(tr):
    # Some rows wrap their detail link in an anchor, some in an onclick handler.
    raw = str(tr)
    for a in tr.find_all('a', href=True):
        href=a['href']
        if 'sz_stampmark_dtl' in href:
            return urljoin(BASE,href.replace('&amp;','&'))
    m=re.search(r'sz_stampmark_dtl\.jsp[^\'"<> ]*?temp_sn=(\d+)',raw,re.I)
    if m:
        return f'https://www.post.gov.tw/post/internet/Philately/sz_stampmark_dtl.jsp?ID=507&temp_sn={m.group(1)}'
    m=re.search(r'temp_sn\s*[=:]\s*[\'\"]?(\d+)',raw,re.I)
    if m:
        return f'https://www.post.gov.tw/post/internet/Philately/sz_stampmark_dtl.jsp?ID=507&temp_sn={m.group(1)}'
    return BASE


def picture_from_html(html,base_url):
    soup=BeautifulSoup(html,'html.parser')
    for img in soup.select('img[src],img[data-src]'):
        src=(img.get('src') or img.get('data-src') or '').strip()
        if 'stampmark/picture/' in src:
            return urljoin(base_url,src)
    m=re.search(r'([\w:/.-]*?/post/FileCenter/post_ww2/stampmark/picture/[^\'"\s<>]+?\.(?:jpg|jpeg|png))',html,re.I)
    return urljoin(base_url,m.group(1)) if m else ''


def recipient_from_notes(notes):
    # Only extract explicitly announced recipients. The event venue / organizer is NOT a mailing recipient.
    normalized=notes.replace('（','(').replace('）',')').replace('：',':')
    m=re.search(r'(?:代辦實寄郵件請寄|郵件請寄)\s*:?\s*',normalized)
    if not m:return '', '', '待確認'
    suffix=normalized[m.end():]
    # Stop before the next event field, keeping short nested parentheses when possible.
    suffix=re.split(r'(?:\)\s*\(|\b主辦局\s*:|\b局贈封\s*:|\)\s*主辦局)',suffix,maxsplit=1)[0]
    suffix=suffix.strip(' ,.，。；;()')
    if not suffix:return '', '', '待確認'
    # Some descriptions provide a separate postal address.
    address=''
    match=re.search(r'(?:地址|郵寄地址)\s*:\s*(.{5,100})',suffix)
    if match:
        address=match.group(1).strip(' ,.，。；;()')
        suffix=suffix[:match.start()].strip(' ,.，。；;()')
    if re.search(r'\d+號',suffix) and not address:
        combined = re.fullmatch(
            r'(?P<address>.+?\d+(?:之\d+)?號(?:\s*\d+(?:之\d+)?樓)?)\s*'
            r'(?P<recipient>[^\d\s].*(?:郵局|中心|科|課|檯|處))',
            suffix)
        if combined:
            return combined['recipient'], combined['address'], '官網明列'
        address=suffix
        return '',address,'僅列收件地址，局名待確認'
    return suffix,address,'官網明列' if address else '僅列收件單位，地址待確認'


def parse_rows(html, start, end):
    soup=BeautifulSoup(html,'html.parser')
    result=[]
    for tr in soup.find_all('tr'):
        cells=tr.find_all('td',recursive=False)
        if len(cells)<4:continue
        d=roc_date(cells[0].get_text(' ',strip=True))
        if d is None or not start<=d<=end:continue
        region=cells[1].get_text(' ',strip=True)
        title=cells[2].get_text(' ',strip=True)
        notes=cells[3].get_text(' ',strip=True)
        if not region or not title:continue
        url=official_link(tr)
        m=re.search(r'temp_sn=(\d+)',url)
        ident='post-'+m.group(1) if m else 'post-hash-'+hashlib.sha256(f'{d}|{region}|{title}'.encode()).hexdigest()[:16]
        recipient,address,as_status=recipient_from_notes(notes)
        picture=picture_from_html(str(tr),BASE)
        result.append({'id':ident,'date':d.isoformat(),'region':region,'title':title,
                       'recipient':recipient,'address':address,'address_status':as_status,
                       'image_url':picture,'official_url':url,'venue_note':notes,
                       'source_description':'中華郵政臨時郵局戳圖公告'})
    return result


def reported_count(html):
    text=BeautifulSoup(html,'html.parser').get_text(' ',strip=True)
    m=re.search(r'共\s*(\d+)\s*筆',text)
    return int(m.group(1)) if m else None


def request_window(start,end):
    # Official HTML may use ROC year or Gregorian year option values.
    # Try both and only accept a query if the page echoes the requested dates.
    candidates=[]
    errors=[]
    for year_format in ('roc','ad'):
        y1=start.year-1911 if year_format=='roc' else start.year
        y2=end.year-1911 if year_format=='roc' else end.year
        def parameters(page):
            return {'ID':'507','PreRowDatas':'10','year1':y1,'month1':start.month,'date1':start.day,
                    'year2':y2,'month2':end.month,'date2':end.day,'temp_keyword':'','topage':page}
        try:
            first_html=get(INDEX_URL,params=parameters(1))
            visible=BeautifulSoup(first_html,'html.parser').get_text(' ',strip=True)
            m=re.search(r'您查詢\s*(\d{2,4}/\d{1,2}/\d{1,2})\s*[~～至-]+\s*(\d{2,4}/\d{1,2}/\d{1,2})',visible)
            if m:
                echoed1,echoed2=roc_date(m.group(1)),roc_date(m.group(2))
                if echoed1!=start or echoed2!=end:
                    errors.append(f'{year_format}: 日期回顯 {echoed1}–{echoed2} 與請求不符')
                    continue
            elif not ('您查詢' in visible and ('結果如下' in visible or '查無資料' in visible)):
                errors.append(f'{year_format}: 找不到有效的結果區')
                continue
            total=reported_count(first_html)
            if total==0:
                candidates.append([])
                continue
            result=[];seen=set()
            pages=max(1,math.ceil(total/10)) if total is not None else 60
            for page in range(1,min(pages,60)+1):
                html=first_html if page==1 else get(INDEX_URL,params=parameters(page))
                parsed=parse_rows(html,start,end)
                fresh=[r for r in parsed if (r['date'],r['region'],r['title']) not in seen]
                if not fresh:
                    if page==1 and total and total>0:
                        raise RuntimeError(f'{start}–{end}: 官網回報 {total} 筆，但無法解析表格')
                    break
                for item in fresh:seen.add((item['date'],item['region'],item['title']))
                result.extend(fresh)
                if len(parsed)<10:break
            if total is not None and total>len(result):
                raise RuntimeError(f'{start}–{end}: 網頁共 {total} 筆，但只抓到 {len(result)} 筆，避免不完整同步')
            candidates.append(result)
            if result:return result
        except Exception as exc:
            errors.append(f'{year_format}: {exc}')
    if candidates:
        return max(candidates,key=len)
    raise RuntimeError(f'{start}–{end}: 無法確認官網資料：'+ ' / '.join(errors))


def compact_region(s):return re.sub(r'[\s※＊*]+','',s or '')
def stamp_key(x):return (x['date'],compact_region(x.get('region','')),x['title'].strip())
def soft_key(x):return (x['date'],x['title'].strip())


def image_bytes(raw):
    if raw.startswith(b'\xff\xd8\xff'):return '.jpg'
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):return '.png'
    if raw.startswith(b'GIF8'):return '.gif'
    if raw.startswith(b'RIFF') and raw[8:12]==b'WEBP':return '.webp'
    return None


def image_cache(item):
    url=item.get('image_url','')
    if url.startswith('images/'):
        return url if (ROOT/url).is_file() else ''
    if not url.startswith('https://') or not ('post.gov.tw/' in url):return url
    # Use local copy, because some browsers reject direct hotlinking from the postal website.
    h=hashlib.sha1(url.encode()).hexdigest()[:20]
    existing=list(IMAGES.glob(f'{h}.*'))
    if existing:return existing[0].relative_to(ROOT).as_posix()
    try:
        resp=SESSION.get(url,timeout=20)
        resp.raise_for_status()
        if len(resp.content)>4_000_000:raise RuntimeError('圖片大於 4MB')
        ext=image_bytes(resp.content)
        if not ext:raise ValueError('回傳不是可辨識的圖片檔')
        IMAGES.mkdir(parents=True,exist_ok=True)
        filename=IMAGES/(h+ext)
        filename.write_bytes(resp.content)
        return filename.relative_to(ROOT).as_posix()
    except Exception as e:
        print(f'  [圖片無法下載] {url}: {e}')
        return url


def main():
    old=json.loads(OUT.read_text('utf-8')) if OUT.exists() else {'items':[]}
    saved=old.get('items',[])
    verified=json.loads(VERIFIED.read_text('utf-8')) if VERIFIED.exists() else {}
    by_id={x['id']:x for x in saved}
    by_key={stamp_key(x):x for x in saved}
    by_soft={}
    for x in saved:by_soft.setdefault(soft_key(x),[]).append(x)
    start,end=TODAY-timedelta(days=10),TODAY+timedelta(days=365)
    latest=[]
    for lo,hi in date_ranges(start,end):
        found=request_window(lo,hi)
        latest.extend(found)
        print(f'[{lo} ～ {hi}] 官方資料 {len(found)} 場')
    if not latest:raise RuntimeError('全部查詢均為 0 場，為避免清空資料，停止更新')
    merged={x['id']:x.copy() for x in saved}  # keep history
    for item in latest:
        prev=by_id.get(item['id']) or by_key.get(stamp_key(item))
        if not prev and len(by_soft.get(soft_key(item),[]))==1:
            prev=by_soft[soft_key(item)][0]
        if prev:
            # Prefer existing confirmed recipient/address; do not overwrite with a guessed 901 branch.
            for field in ('recipient','address','address_status'):
                if (not item.get(field)) or (field=='address_status' and item[field] in ('待確認','僅列收件單位，地址待確認')):
                    item[field]=prev.get(field,item.get(field,''))
            if not item.get('image_url'):item['image_url']=prev.get('image_url','')
            if item['official_url']==BASE and prev.get('official_url'):
                item['official_url']=prev['official_url']
            if prev['id']!=item['id']:
                item['id']=prev['id']
        override=verified.get(item['id'])
        if override:
            for field in ('recipient','address','address_status','address_source_url','address_checked_at','address_note'):
                if override.get(field):item[field]=override[field]
        # A migrated JSON may reference a cache file not present in this checkout.
        # Re-fetch its official detail image rather than silently dropping the picture.
        if item.get('image_url', '').startswith('images/') and not (ROOT / item['image_url']).is_file():
            item['image_url'] = ''
        if not item['image_url'] and 'sz_stampmark_dtl' in item['official_url']:
            try:item['image_url']=picture_from_html(get(item['official_url']),item['official_url'])
            except Exception as ex:print(f'  [詳情頁無法開啟] {ex}')
        item['image_url']=image_cache(item)
        merged[item['id']]=item
    # Retry downloading remote images from the initial curated inventory.
    for x in merged.values():
        if x.get('image_url','').startswith('https://') and x['date'] >= (TODAY-timedelta(days=30)).isoformat():
            x['image_url']=image_cache(x)
    items=sorted(merged.values(),key=lambda x:(x['date'],x['region'],x['title']))
    payload={'updated_at':datetime.now(ZoneInfo('Asia/Taipei')).isoformat(timespec='seconds'),
             'update_status':f'排程同步成功：本次取得 {len(latest)} 場，累計收錄 {len(items)} 場（含歷史紀錄）',
             'source_url':BASE,'items':items}
    temp=OUT.with_suffix('.tmp')
    temp.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n','utf-8')
    temp.replace(OUT)
    print(f'更新完成：{len(items)} 筆')

if __name__=='__main__':main()

