"""Refresh complete office addresses and per-stamp placement lists."""
import csv
import io
import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.post.gov.tw/post/internet/Templates/getOpenDataFile.jsp?vkey=B484EB27-B3F0-4D02-8F62-047D20C64078'


def normalize(value):
    return ''.join(unicodedata.normalize('NFKC', value).replace('台', '臺').split())


def complete_address(row):
    street = row['地址'].strip()
    city = row['縣市'].strip()
    district = row['鄉鎮市區'].strip()
    if not street.startswith(city):
        street = city + ('' if street.startswith(district) else district) + street
    code = row['六碼郵遞區號'].strip()
    return code + ' ' + street


def parse_names(text):
    entries = []
    for line in text.splitlines():
        match = re.match(r'^\s*(\d{1,3})\s*([^\d\s].*?)\s{2,}', line)
        if match:
            entries.append((int(match[1]), match[2].strip()))
    if not entries or [number for number, _ in entries] != list(range(1, len(entries) + 1)):
        raise ValueError('設置名單序號無法完整核對')
    return [name for _, name in entries]


def update():
    response = requests.get(SOURCE, timeout=20)
    response.raise_for_status()
    response.encoding = 'utf-8-sig'
    rows = list(csv.DictReader(response.text.splitlines()))
    if len(rows) < 1000:
        raise ValueError('據點清單筆數異常')
    offices = {}
    for row in rows:
        record = dict(name=row['局名'], address=complete_address(row),
                      phone=row['郵務電話'].strip())
        try:
            lat, lon = float(row['緯度']), float(row['經度'])
            if 0 < lat < 90 and 0 < lon < 180:
                record.update(lat=lat, lon=lon)
        except ValueError:
            pass
        for name in {row['局名'], row['電腦局名']}:
            norm = normalize(name)
            if norm in offices and offices[norm] != record:
                raise ValueError('重複局名需要人工核對')
            offices[norm] = record
    path = ROOT / 'data' / 'offices.json'
    previous = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    items = json.loads((ROOT / 'data' / 'commemorative.json').read_text(encoding='utf-8'))['items']

    def placements(item):
        source = item.get('location_url')
        if not source:
            return item['id'], dict(status='unavailable', offices=[])
        try:
            pdf = requests.get(source, timeout=12)
            pdf.raise_for_status()
            text = '\n'.join(page.extract_text(extraction_mode='layout') for page in PdfReader(io.BytesIO(pdf.content)).pages)
            names = parse_names(text)
            mapped = [dict(offices[normalize(name)]) if normalize(name) in offices else dict(name=name) for name in names]
            return item['id'], dict(status='verified', source_url=source, offices=mapped)
        except Exception as error:
            old = previous.get('commemorative', {}).get(item['id'], {})
            print(f"名單待核對 {item['id']}: {error}")
            if old.get('source_url') == source:
                return item['id'], {**old, 'refresh_failed': True}
            return item['id'], dict(status='unavailable', source_url=source, offices=[])

    with ThreadPoolExecutor(max_workers=5) as pool:
        placements_by_id = dict(pool.map(placements, items))
    data = dict(source_url=SOURCE, offices=offices, commemorative=placements_by_id)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)
    for item in items:
        result = placements_by_id[item['id']]
        print(item['id'], result['status'], len(result['offices']))


if __name__ == '__main__':
    update()
