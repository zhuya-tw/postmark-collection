"""Send the private maintenance report to the owner-only dashboard."""
import json
import os
from pathlib import Path
import time

import requests

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://postmark-admin.joas0123.workers.dev/api/report'


def main():
    token = os.environ.get('POSTMARK_REPORT_TOKEN', '')
    if len(token) != 64 or any(char not in '0123456789abcdef' for char in token):
        raise RuntimeError('請先設定 POSTMARK_REPORT_TOKEN 私密設定')
    health = json.loads((ROOT / '.private' / 'health.json').read_text(encoding='utf-8'))
    counts = {}
    for name in ('stamps', 'commemorative', 'scenic'):
        payload = json.loads((ROOT / 'data' / (name + '.json')).read_text(encoding='utf-8'))
        counts[name] = len(payload['items'])
    for attempt in range(2):
        try:
            response = requests.post(URL, json={'health': health, 'counts': counts},
                                     headers={'Authorization': 'Bearer ' + token},
                                     timeout=20, allow_redirects=False)
            if response.status_code == 200 and response.json().get('saved') is True:
                print('管理報告已安全上傳')
                return
        except (requests.RequestException, ValueError):
            pass
        if attempt == 0:
            time.sleep(5)
    raise RuntimeError('管理報告上傳失敗，請檢查後端及專用密鑰設定')


if __name__ == '__main__':
    main()
