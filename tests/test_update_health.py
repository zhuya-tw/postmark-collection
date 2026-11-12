import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import update_site as updater


class UpdateHealthTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1])
        self.root = Path(self.folder.name)
        self.previous_data = updater.DATA
        updater.DATA = self.root
        self.snapshot = dict(items=[dict(id='x', title='test', date='2027-01-01',
                                        official_url='https://www.post.gov.tw/')])
        (self.root / 'stamps.json').write_text(json.dumps(self.snapshot), encoding='utf-8')

    def tearDown(self):
        updater.DATA = self.previous_data
        self.folder.cleanup()

    def test_invalid_result_retries_and_restores_original(self):
        def corrupt(*args, **kwargs):
            (self.root / 'stamps.json').write_text('{"items":[]}', encoding='utf-8')
        with patch.object(updater.subprocess, 'run', side_effect=corrupt), patch.object(updater.time, 'sleep'):
            result = updater.run_source('stamps', ['ignored'])
        self.assertEqual(result['status'], 'retained')
        self.assertEqual(result['attempts'], 2)
        self.assertEqual(updater.read('stamps'), self.snapshot)

    def test_transient_failure_recovers(self):
        import subprocess
        with patch.object(updater.subprocess, 'run', side_effect=[subprocess.TimeoutExpired('test', 1), None]), patch.object(updater.time, 'sleep'):
            result = updater.run_source('stamps', ['ignored'])
        self.assertEqual(result, dict(status='ok', attempts=2))

    def test_only_named_recipient_gets_official_address(self):
        self.snapshot['items'][0].update(recipient='阿里山郵局', address='')
        self.snapshot['items'].append(dict(id='unknown', recipient='', address='', venue_note='阿里山郵局'))
        updater.atomic_write('stamps', self.snapshot)
        updater.atomic_write('offices', dict(source_url='https://www.post.gov.tw/',
            offices={'阿里山郵局': {'address': '605001 嘉義縣阿里山鄉東阿里山53號'}}))
        updater.reconcile_addresses()
        self.assertTrue(updater.read('stamps')['items'][0]['address'].startswith('605001'))
        self.assertEqual(updater.read('stamps')['items'][1]['address'], '')

    def test_end_before_start_is_rejected(self):
        bad = dict(items=[dict(id='x', title='t', date='2027-01-02',
            end_date='2027-01-01', official_url='https://www.post.gov.tw/')])
        with self.assertRaises(ValueError):
            updater.validate('commemorative', bad)

    def test_mass_removal_is_rejected(self):
        previous = dict(items=[{'id': str(i)} for i in range(100)])
        current = dict(items=[dict(id=str(i), title='t', date='2027-01-01',
            official_url='https://www.post.gov.tw/', unlisted=i>10) for i in range(100)])
        with self.assertRaises(ValueError):
            updater.validate('scenic', current, previous)
