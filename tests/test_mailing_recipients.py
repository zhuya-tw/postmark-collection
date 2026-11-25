import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from update_offices import normalize, required_office_names
import update_site


class MailingRecipientTest(unittest.TestCase):
    def test_keep_mailing_units_without_using_venue_or_organizer(self):
        stamps = [
            dict(recipient='台南集郵中心'),
            dict(recipient='新興郵局集郵服務中心'),
            dict(recipient='臺中郵局營業管理科'),
            dict(recipient='', venue_note='阿里山郵局', organizer='其他郵局'),
        ]
        result = required_office_names(
            [dict(office='風景戳郵局')],
            [dict(offices=[dict(name='紀念戳郵局')])], stamps)
        for name in ['臺南集郵中心', '新興郵局集郵服務中心', '臺中郵局營業管理科',
                     '風景戳郵局', '紀念戳郵局']:
            self.assertIn(name, result)
        self.assertNotIn('阿里山郵局', result)
        self.assertNotIn('其他郵局', result)

    def test_named_units_fill_new_events_with_unit_source_and_floor(self):
        config = json.loads((ROOT / 'data/special_offices.json').read_text(encoding='utf8'))
        names = ['臺中郵局營業管理科', '台南集郵中心', '新興郵局集郵服務中心']
        with tempfile.TemporaryDirectory(dir=ROOT) as folder, patch.object(update_site, 'DATA', Path(folder)):
            update_site.atomic_write('stamps', dict(items=[
                dict(id=str(i), recipient=name, address='') for i, name in enumerate(names)]))
            update_site.atomic_write('offices', dict(source_url='https://www.post.gov.tw/general.csv',
                offices={normalize(name): config[normalize(name)] for name in names}))
            update_site.reconcile_addresses()
            items = update_site.read('stamps')['items']
            self.assertEqual(items[0]['address'], '400700 臺中市中區民權路86號7樓')
            self.assertEqual(items[1]['address'], '704401 臺南市北區成功路6號2樓')
            self.assertEqual(items[2]['address'], '800012 高雄市新興區中正三路179號1樓')
            for item in items:
                self.assertEqual(item['address_source_url'], config[normalize(item['recipient'])]['source_url'])
                self.assertEqual(item['address_checked_at'], config[normalize(item['recipient'])]['checked_at'])
                self.assertEqual(item['recipient'], names[int(item['id'])])

    def test_unknown_recipient_stays_unfilled_and_explicit_address_wins(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder, patch.object(update_site, 'DATA', Path(folder)):
            update_site.atomic_write('stamps', dict(items=[
                dict(id='unknown', recipient='', address='', venue_note='新興郵局集郵服務中心'),
                dict(id='explicit', recipient='臺中郵局營業管理科', address='本場公告另列的收件地址')]))
            update_site.atomic_write('offices', dict(source_url='https://www.post.gov.tw/',
                offices={'臺中郵局營業管理科': dict(address='400700 臺中市中區民權路86號7樓')}))
            update_site.reconcile_addresses()
            items = update_site.read('stamps')['items']
            self.assertEqual(items[0]['address'], '')
            self.assertEqual(items[1]['address'], '本場公告另列的收件地址')


if __name__ == '__main__':
    unittest.main()
