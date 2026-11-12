"""Retry independent sources, validate snapshots, and retain usable data."""
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
SOURCES = [
    ('stamps', ['scripts/update_stamps.py']),
    ('commemorative', ['scripts/update_catalogs.py', 'commemorative']),
    ('scenic', ['scripts/update_catalogs.py', 'scenic']),
    ('offices', ['scripts/update_offices.py']),
]


def read(name):
    return json.loads((DATA / (name + '.json')).read_text(encoding='utf-8'))


def validate(name, value, previous=None):
    if name == 'offices':
        if not value.get('offices') or not isinstance(value.get('commemorative'), dict):
            raise ValueError('局所資料不完整')
        for office in value['offices'].values():
            if not re.match(r'^\d{3,6}\s+.+[縣市].+', office.get('address', '')):
                raise ValueError('局所地址缺少郵遞區號或縣市')
        return
    items = value.get('items')
    if not isinstance(items, list) or not items:
        raise ValueError('清單為空或格式不符')
    if len({item['id'] for item in items}) != len(items):
        raise ValueError('戳圖編號重複')
    for item in items:
        if not item.get('title') or not item.get('official_url', '').startswith('https://'):
            raise ValueError('名稱或官方來源缺漏')
        start = date.fromisoformat(item['date'])
        if name == 'commemorative' and date.fromisoformat(item['end_date']) < start:
            raise ValueError('使用迄日早於起日')
    if previous and name == 'scenic':
        before = sum(not item.get('unlisted') for item in previous.get('items', []))
        after = sum(not item.get('unlisted') for item in items)
        if before >= 50 and after < before * 0.8:
            raise ValueError('官方風景戳筆數突降超過兩成，保留前次資料待重查')


def normalize(value):
    return re.sub(r'\s+', '', value).replace('台', '臺')


def reconcile_addresses():
    stamps = read('stamps')
    office_data = read('offices')
    offices = office_data['offices']
    for item in stamps['items']:
        # Only fill an explicitly named recipient, never use the event venue.
        recipient = item.get('recipient', '').strip()
        office = offices.get(normalize(recipient)) if recipient else None
        if office and not item.get('address'):
            item['address'] = office['address']
            item['address_status'] = '已核對官方收件單位及地址'
            item['address_source_url'] = office_data['source_url']
            item['address_checked_at'] = datetime.now(ZoneInfo('Asia/Taipei')).date().isoformat()
            item['address_note'] = '公告明列收件局所，地址與中華郵政營業據點資料核對。'
    atomic_write('stamps', stamps)


def atomic_write(name, value):
    target = DATA / (name + '.json')
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(target)


def audit():
    today = datetime.now(ZoneInfo('Asia/Taipei')).date()
    issues = []
    def add(source, item, kind):
        issues.append(dict(source=source, id=item['id'], title=item['title'], kind=kind))
    office_data = read('offices')
    for source in ('stamps', 'commemorative', 'scenic'):
        for item in read(source)['items']:
            active = not item.get('unlisted') if source == 'scenic' else (
                date.fromisoformat(item.get('end_date', item['date'])) +
                (timedelta(days=10) if source == 'stamps' else timedelta()) >= today)
            if not active:
                continue
            image = item.get('image_url', '')
            if not image or (image.startswith('images/') and not (ROOT / image).is_file()):
                add(source, item, 'missing-image')
            if source == 'scenic' and normalize(item['office']) not in office_data['offices']:
                add(source, item, 'missing-office-address')
            if source == 'commemorative':
                placement = office_data['commemorative'].get(item['id'], {})
                if placement.get('status') != 'verified' or placement.get('refresh_failed'):
                    add(source, item, 'unverified-placement-list')
            if source == 'stamps':
                if not item.get('recipient') or not item.get('address'):
                    add(source, item, 'missing-mailing-information')
                if re.search(r'\d+號', item.get('recipient', '')):
                    add(source, item, 'recipient-contains-address')
    return issues


def run_source(name, command):
    path = DATA / (name + '.json')
    original = path.read_bytes() if path.exists() else None
    previous = json.loads(original) if original else None
    last_error = ''
    for attempt in range(1, 3):
        try:
            subprocess.run([sys.executable, *command], cwd=ROOT, check=True, timeout=240)
            validate(name, read(name), previous)
            return dict(status='ok', attempts=attempt)
        except (subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError) as error:
            last_error = str(error)
            if original is not None:
                path.write_bytes(original)
            elif path.exists():
                path.unlink()
            print(f'::warning::{name} 第 {attempt} 次未成功：{error}', flush=True)
            if attempt == 1:
                time.sleep(10)
    if original is None:
        raise RuntimeError(f'{name} 沒有可用的舊資料')
    validate(name, json.loads(original))
    return dict(status='retained', attempts=2, error=last_error)


def main():
    results = {}
    for name, command in SOURCES:
        results[name] = run_source(name, command)
    reconcile_addresses()
    issues = audit()
    checked_at = datetime.now(ZoneInfo('Asia/Taipei')).isoformat(timespec='seconds')
    retained = [name for name, result in results.items() if result['status'] == 'retained']
    health = dict(checked_at=checked_at, sources=results, issues=issues,
                  status='retained' if retained else 'attention' if issues else 'ok')
    target = ROOT / '.private' / 'health.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps(health, ensure_ascii=False), encoding='utf-8')
    temp.replace(target)
    print('資料檢查完成。詳細結果請登入網站管理區。')


if __name__ == '__main__':
    main()
