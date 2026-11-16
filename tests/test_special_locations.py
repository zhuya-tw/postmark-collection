import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from special_locations import parse_agencies, refresh_special_offices
from update_catalogs import scenic_relocation


class SpecialLocationsTest(unittest.TestCase):
    def test_agency_address_prefix_alias_and_service_note(self):
        def row(name, code, address):
            return '<tr>' + ''.join('<td>' + c + '</td>' for c in [name, code, address, '123', '', '', '', '', '']) + '</tr>'
        html = '<table>' + row('多良火車站郵政代辦所', '963006', '太麻里鄉多良村56號') + row('金門大膽島郵政代辦所', '894021', '烈嶼鄉上崎村大膽1號(依船班交運)') + '</table>'
        result = parse_agencies(html, 'https://www.post.gov.tw/')
        self.assertEqual(result['臺東多良火車站郵政代辦所']['address'], '963006 臺東縣太麻里鄉多良村56號')
        self.assertEqual(result['金門大膽島郵政代辦所']['service_note'], '依船班交運')
        self.assertNotIn('lat', result['金門大膽島郵政代辦所'])

    def test_explicit_effective_relocation_only(self):
        def html(note):
            return '<table><tr><th>附註</th><td>' + note + '</td></tr></table>'
        with patch('update_catalogs.TODAY', date(2026, 11, 16)):
            self.assertEqual(scenic_relocation(html('115年5月18日起，民眾欲蓋用「高美濕地」風景郵戳請至臺中港郵局。'))['office'], '臺中港郵局')
            self.assertIsNone(scenic_relocation(html('116年1月1日起，請至其他郵局。')))
            self.assertIsNone(scenic_relocation(html('景點在臺中公園，附近有臺中郵局。')))

    def test_failure_preserves_verified_address_and_flags_background_recheck(self):
        previous = {'金門民俗村郵政代辦所': {'name': '金門民俗村郵政代辦所', 'address': '890007 金門縣金沙鎮山后民俗村59號', 'checked_at': '2026-11-16'}}
        with patch('special_locations.get', side_effect=OSError('offline')):
            result = refresh_special_offices(previous)
        self.assertEqual(result['金門民俗村郵政代辦所']['address'], previous['金門民俗村郵政代辦所']['address'])
        self.assertTrue(result['金門民俗村郵政代辦所']['refresh_failed'])
        self.assertEqual(result['郵政博物館']['address'], '100056 臺北市中正區重慶南路2段45號')


if __name__ == '__main__':
    unittest.main()
