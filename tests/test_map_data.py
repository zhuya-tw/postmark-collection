import csv,io,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from update_map import parse,coordinate,validate
import update_site
class MapDataTest(unittest.TestCase):
 def csv(self,rows):
  f=io.StringIO();w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows);return f.getvalue().encode('utf-8-sig')
 def test_axes_and_missing_coordinates(self):
  self.assertEqual(coordinate('121.5','25.0'),(25,121.5))
  for x,y in [('25','121'),('NaN','25'),('0','0'),('','')]:self.assertEqual(coordinate(x,y),(None,None))
 def test_mailbox_address_hours_dedup_and_markup(self):
  r={'類別':'普通信筒','類別代號':'3','信筒樣式代號':'1','x座標':'121.5','y座標':'25','縣市':'臺北市','鄉鎮市區':'中正區','路名':'測試路1號','地址描述':'<b>門口</b>','聯絡電話':'02-1234','服務單位':'測試郵局','備註':'收信時間 11:00'}
  data=parse('mailboxes',self.csv([r,r]));self.assertEqual(len(data['items']),1)
  i=data['items'][0];self.assertEqual(i['address'],'臺北市中正區測試路1號');self.assertEqual(i['landmark'],'門口');self.assertEqual(i['note'],'收信時間 11:00')
 def test_locker_no_live_capacity(self):
  r={'名稱':'測試i郵箱','座標x':'121.5','座標y':'25','地址':'臺北市中正區測試路1號','郵遞區號':'100000','營業時間':'24小時','相對位置':'門口','備註':'','儲格數':'80'}
  i=parse('lockers',self.csv([r]))['items'][0];self.assertEqual(i['county'],'臺北市');self.assertNotIn('available',i);self.assertEqual(i['hours'],'24小時')
 def test_schema_and_drop_rejected(self):
  with self.assertRaises(ValueError):parse('offices',b'wrong\nvalue')
  i=dict(id='x',name='x',address='x',lat=25,lon=121)
  with self.assertRaises(ValueError):validate({'items':[i]},{'items':[i]*100})
 def test_map_failure_retains_previous(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
   data={'items':[dict(id='x',name='x',address='x',lat=25,lon=121)]};p=Path(folder)/'map_offices.json';p.write_text(json.dumps(data))
   def corrupt(*a,**kw):p.write_text('{"items":[]}')
   with patch.object(update_site,'DATA',Path(folder)),patch.object(update_site.subprocess,'run',side_effect=corrupt),patch.object(update_site.time,'sleep'):
    result=update_site.run_source('map_offices',['ignored'])
   self.assertEqual(result['status'],'retained');self.assertEqual(json.loads(p.read_text()),data)
if __name__=='__main__':unittest.main()
