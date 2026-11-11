"""Keep local snapshots of the official commemorative and scenic catalogs."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import json
import math
import re
from urllib.parse import parse_qs, urljoin, urlsplit

from update_stamps import (ROOT, INDEX_URL, TODAY, BeautifulSoup, get,
                           picture_from_html, roc_date)


def parse_catalog(html, kind):
    soup = BeautifulSoup(html, 'html.parser')
    count = re.search(r'共\s*(\d+)\s*筆', soup.get_text(' ', strip=True))
    if not count:
        raise ValueError('找不到官方資料筆數')
    items = []
    for row in soup.select('tr'):
        link = row.select_one('a[href*="sz_stampmark_dtl.jsp"]')
        cells = row.find_all('td', recursive=False)
        if not link or len(cells) != 4:
            continue
        detail = urljoin(INDEX_URL, link['href'])
        query = parse_qs(urlsplit(detail).query)
        if query.get('ID') != [kind]:
            continue
        title, second, third, _ = [cell.get_text(' ', strip=True) for cell in cells]
        day = roc_date(third if kind == '508' else second)
        if not day:
            raise ValueError(f'無法辨識日期：{title}')
        item = dict(id=query['temp_sn'][0], title=title, date=day.isoformat(), official_url=detail)
        if kind == '508':
            item['office'] = second
        else:
            item['end_date'] = roc_date(second.split('至')[-1]).isoformat()
            location = cells[3].find('a', href=True)
            if location:
                item['location_url'] = urljoin(INDEX_URL, location['href'])
        items.append(item)
    return int(count[1]), items


def fetch_catalog(kind, first_import):
    params = {'ID': kind}
    if kind == '506':
        start = TODAY.replace(month=1, day=1, year=TODAY.year - (5 if first_import else 1))
        end = TODAY + timedelta(days=365)
        params.update(temp_kind='紀念郵戳', PreRowDatas=10,
                      year1=start.year, month1=start.month, date1=start.day,
                      year2=end.year, month2=end.month, date2=end.day)
    html = get(INDEX_URL, params)
    if kind == '506':
        dates = BeautifulSoup(html, 'html.parser').select_one('.keyword')
        echoed = re.findall(r'\d{2,4}/\d{1,2}/\d{1,2}', dates.get_text() if dates else '')
        if [roc_date(day) for day in echoed] != [start, end]:
            raise ValueError('官網回傳的日期範圍與查詢不符')
    total, items = parse_catalog(html, kind)
    if kind == '506':
        for page in range(2, math.ceil(total / 10) + 1):
            _, extra = parse_catalog(get(INDEX_URL, {**params, 'topage': page}), kind)
            items.extend(extra)
    if total == 0 or total != len({item['id'] for item in items}) or total != len(items):
        raise ValueError(f'官網列出 {total} 筆，實際解析 {len(items)} 筆')
    return items


def update(name, kind):
    path = ROOT / 'data' / f'{name}.json'
    saved = json.loads(path.read_text(encoding='utf-8'))['items'] if path.exists() else []
    previous = {item['id']: item for item in saved}
    current = fetch_catalog(kind, not saved)

    def add_image(item):
        old = previous.get(item['id'], {})
        if old.get('image_url'):
            item['image_url'] = old['image_url']
            return
        try:
            detail = item['official_url']
            item['image_url'] = picture_from_html(get(detail, timeout=8), detail)
        except Exception as exc:
            print(f"圖片待重試 {item['id']}: {exc}")

    with ThreadPoolExecutor(max_workers=6) as pool:
        current_ids = {item["id"] for item in current}
        missing_history = [item for item in saved if item["id"] not in current_ids and not item.get("image_url")]
        list(pool.map(add_image, current + missing_history))
    if kind == '508':
        active_ids = {item['id'] for item in current}
        for item in saved:
            if item['id'] not in active_ids:
                item['unlisted'] = True
    previous.update((item['id'], item) for item in current)
    items = sorted(previous.values(), key=lambda item: (item['date'], item['title']), reverse=True)
    snapshot = dict(updated_at=TODAY.isoformat(), items=items)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)
    print(f'{name}: 官網 {len(current)} 筆，保留 {len(items)} 筆，含圖 {sum(bool(i.get("image_url")) for i in items)} 筆')


if __name__ == '__main__':
    import sys
    sources = {'commemorative': '506', 'scenic': '508'}
    name = sys.argv[1]
    update(name, sources[name])

