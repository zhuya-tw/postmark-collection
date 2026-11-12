import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from update_stamps import recipient_from_notes


class RecipientAddressTest(unittest.TestCase):
    def test_address_then_recipient_without_space(self):
        notes = '楊梅郵局(地址:楊梅區大平街7號)(郵件請寄:330005桃園市桃園區成功路一段51號桃園郵局集郵服務中心)(主辦局:桃園郵局)'
        self.assertEqual(recipient_from_notes(notes), (
            '桃園郵局集郵服務中心', '330005桃園市桃園區成功路一段51號', '官網明列'))

    def test_address_only(self):
        self.assertEqual(recipient_from_notes('郵件請寄:100臺北市中正區測試路1號')[0], '')

    def test_recipient_only(self):
        self.assertEqual(recipient_from_notes('郵件請寄:阿里山郵局'),
                         ('阿里山郵局', '', '僅列收件單位，地址待確認'))
