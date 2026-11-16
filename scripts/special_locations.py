"""Resolve agencies and non-branch counters from additional official sources."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
import math
import re
from zoneinfo import ZoneInfo
from update_stamps import get, BeautifulSoup, ROOT

AGENCY_URL = 'https://www.post.gov.tw/post/internet/I_location/index.jsp'
AGENCIES = {
    '金門大膽島郵政代辦所': ('金門縣', ['金門大膽島郵政代辦所']),
    '金門民俗村郵政代辦所': ('金門縣', ['金門民俗村郵政代辦所']),
    '多良火車站郵政代辦所': ('臺東縣', ['臺東多良火車站郵政代辦所', '多良火車站郵政代辦所']),
    '高雄南沙群島郵政代辦所': ('高雄市旗津區', ['高雄南沙群島郵政代辦所']),
    '高雄東沙群島郵政代辦所': ('高雄市旗津區', ['高雄東沙群島郵政代辦所']),
}

def normalize(value):
    return re.sub(r'\s+', '', value).replace('台', '臺')

def parse_agencies(html, source_url):
    records = {}
    for row in BeautifulSoup(html, 'html.parser').select('tr'):
        cells = row.find_all('td', recursive=False)
        if len(cells) != 9:
            continue
        name, code, address, phone = [c.get_text(' ', strip=True) for c in cells[:4]]
        if name not in AGENCIES:
            continue
        if not re.fullmatch(r'\d{6}', code) or not address:
            raise ValueError('代辦所地址格式異常')
        prefix, aliases = AGENCIES[name]
        street, _, note = address.partition('(')
        if not street.startswith(prefix):
            street = prefix + street
        record = dict(name=name, address=code + ' ' + street, phone=phone, source_url=source_url)
        extension = re.fullmatch(r'(\(0\d{1,2}\)\d{3,4}-\d{4})-(\d+)', phone)
        if extension:
            record.update(phone=extension[1], phone_extension=extension[2])
        if note:
            record['service_note'] = note.rstrip(')')
        if name.startswith('高雄'):
            record['service_note'] = '官方列示為島上指揮部地址。郵件交運及索戳受理方式請先電洽代辦所，請勿直接套用一般郵局寄法。'
        for alias in aliases:
            records[normalize(alias)] = dict(record)
    return records

def refresh_special_offices(previous):
    result = {}
    checked = datetime.now(ZoneInfo('Asia/Taipei')).date().isoformat()
    config = json.loads((ROOT / 'data' / 'special_offices.json').read_text(encoding='utf8'))
    expected = {normalize(alias) for _, aliases in AGENCIES.values() for alias in aliases}
    try:
        params = {'ID': '1906', 'PreRowDatas': 10, 'search_text': '%'}
        first = get(AGENCY_URL, params, timeout=15)
        count = re.search(r'共\s*(\d+)\s*筆', BeautifulSoup(first, 'html.parser').get_text(' ', strip=True))
        if not count or not 100 <= int(count[1]) <= 800:
            raise ValueError('代辦所名錄筆數異常')
        result.update(parse_agencies(first, AGENCY_URL + '?ID=1906&search_text=%25'))
        def page(number):
            source = AGENCY_URL + '?ID=1906&search_text=%25&topage=' + str(number)
            return parse_agencies(get(AGENCY_URL, {**params, 'topage': number}, timeout=15), source)
        with ThreadPoolExecutor(max_workers=5) as pool:
            for records in pool.map(page, range(2, math.ceil(int(count[1]) / 10) + 1)):
                result.update(records)
        if not expected.issubset(result):
            raise ValueError('部分代辦所未出現在最新名錄')
        for record in result.values():
            record['checked_at'] = checked
    except Exception:
        for name in expected:
            old = result.get(name) or previous.get(name)
            if old:
                result[name] = {**old, 'refresh_failed': True}
    for name, saved in config.items():
        record = {key: value for key, value in saved.items() if key != 'verification_terms'}
        try:
            text = normalize(BeautifulSoup(get(saved['source_url'], timeout=15), 'html.parser').get_text(' ', strip=True))
            if not all(normalize(term) in text for term in saved['verification_terms']):
                raise ValueError('特殊設置地址來源變更')
            record['checked_at'] = checked
        except Exception:
            record = {**previous.get(normalize(name), record), 'refresh_failed': True}
        result[normalize(name)] = record
    return result
