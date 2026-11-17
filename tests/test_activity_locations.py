import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from activity_locations import activity_venue,build_activity_locations,is_current_location

class ActivityLocationsTest(unittest.TestCase):
    def test_changed_venue_and_invalid_coordinates_need_review(self):
        item={'venue_note':'五華國小（郵件請寄三重郵局）'}
        point={'venue':'五華國小','lat':25.08,'lon':121.49}
        self.assertTrue(is_current_location(item,point))
        self.assertFalse(is_current_location({'venue_note':'其他學校'},point))
        self.assertFalse(is_current_location(item,{**point,'lat':float('nan')}))
    def test_recipient_never_becomes_activity_location(self):
        item={'venue_note':'祝山觀日平台(停機坪)（郵件請寄:阿里山郵局）（主辦局:嘉義郵局）'}
        self.assertEqual(activity_venue(item),'祝山觀日平台(停機坪)')
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1])as folder:
            root=Path(folder);(root/'data').mkdir()
            (root/'data'/'stamps.json').write_text(json.dumps({'items':[dict(id='a',**item)]}),encoding='utf8')
            (root/'data'/'activity_venues.json').write_text('{"venues":[]}',encoding='utf8')
            data=build_activity_locations({'x':{'name':'阿里山郵局','address':'605001 嘉義縣阿里山鄉','lat':23.5,'lon':120.8}},root)
            self.assertEqual(data['locations'],{})
    def test_explicit_activity_branch_matches_and_unknown_stays_unlocated(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1])as folder:
            root=Path(folder);(root/'data').mkdir()
            items=[{'id':'yes','venue_note':'楊梅郵局(地址:楊梅區大平街7號)(郵件請寄桃園郵局)'},{'id':'no','venue_note':'未知公園（郵件請寄楊梅郵局）'}]
            (root/'data'/'stamps.json').write_text(json.dumps({'items':items}),encoding='utf8')
            (root/'data'/'activity_venues.json').write_text('{"venues":[]}',encoding='utf8')
            data=build_activity_locations({'x':{'name':'楊梅郵局','address':'326001 桃園市楊梅區大平街7號','lat':24.9,'lon':121.1}},root)
            self.assertEqual(list(data['locations']),['yes'])
