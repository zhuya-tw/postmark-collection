'use strict';

const byId = id => document.getElementById(id);
const type = new URLSearchParams(location.search).get('type') === 'scenic'
  ? 'scenic' : 'commemorative';
const scenic = type === 'scenic';
const label = scenic ? '風景戳' : '紀念戳';
const normalize = value => value.normalize('NFKC').replaceAll('台', '臺').toLowerCase();
const format = date => date.replaceAll('-', '/');
const todayTaiwan = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts();
  const values = Object.fromEntries(parts.map(({type, value}) => [type, value]));
  return values.year + '-' + values.month + '-' + values.day;
};
let records = [];
let updatedAt = '';

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function officialLink(url, text) {
  if (!/^https:\/\/www\.post\.gov\.tw\//i.test(url)) return null;
  const link = element('a', text);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'action';
  return link;
}


const postalLocations = [{"name": "臺北北門郵局", "address": "100003 忠孝西路一段120號1樓", "lat": 25.047246, "lon": 121.512212, "phone": "(02)2331-1374"}, {"name": "臺北世貿郵局", "address": "110202 信義路五段5號(世貿中心內)", "lat": 25.034177, "lon": 121.561827, "phone": "(02)2725-2479"}, {"name": "故宮郵局", "address": "111001 至善路二段221號(故宮博物院內)", "lat": 25.102015, "lon": 121.548764, "phone": "(02)2881-8410"}, {"name": "士林郵局", "address": "111011 文林路162號", "lat": 25.089289, "lon": 121.526882, "phone": "(02)2881-8743"}, {"name": "文山景美郵局", "address": "116052 羅斯福路六段389號", "lat": 24.992446, "lon": 121.540901, "phone": "(02)2931-2010"}, {"name": "陽明山郵局", "address": "112091 紗帽路139之1號", "lat": 25.15125, "lon": 121.546164, "phone": "(02)2861-6151"}, {"name": "石碇郵局", "address": "223002 碇坪路1段78-80號", "lat": 24.99135, "lon": 121.657687, "phone": "(02)2663-1833"}, {"name": "深坑郵局", "address": "222004 北深路3段30號", "lat": 25.001209, "lon": 121.6092, "phone": "(02)2662-1005"}, {"name": "平溪郵局", "address": "226001 平溪街42號", "lat": 25.025971, "lon": 121.738489, "phone": "(02)2495-1062"}, {"name": "金門郵局", "address": "893013 民生路４號", "lat": 24.432988, "lon": 118.32054, "phone": "(082)32-5823"}, {"name": "馬祖郵局", "address": "209002 福沃村141號", "lat": 26.157328, "lon": 119.94165, "phone": "(0836)22050"}, {"name": "北投郵局", "address": "112006 光明路165號", "lat": 25.135555, "lon": 121.503055, "phone": "(02)2891-2420"}, {"name": "內湖郵局", "address": "114059 民權東路六段83號", "lat": 25.069272, "lon": 121.588113, "phone": "(02)2790-1070-13"}, {"name": "南港郵局", "address": "115029 南港路二段78號", "lat": 25.053889, "lon": 121.603416, "phone": "(02)2785-0141"}, {"name": "木柵郵局", "address": "116008 木柵路三段27號", "lat": 24.988476, "lon": 121.565401, "phone": "(02)2939-2781-20"}, {"name": "基隆愛三路郵局", "address": "200009 愛三路130號1F", "lat": 25.129912, "lon": 121.743734, "phone": "(02)2421-0113"}, {"name": "貢寮郵局", "address": "228003 貢寮街50號", "lat": 25.019582, "lon": 121.908842, "phone": "(02)2494-1127"}, {"name": "板橋文化路郵局", "address": "220013 文化路1段395號", "lat": 25.022083, "lon": 121.467261, "phone": "(02)2259-8788"}, {"name": "新店郵局", "address": "231008 北新路2段177號", "lat": 24.977077, "lon": 121.542661, "phone": "(02)2911-1249"}, {"name": "樹林郵局", "address": "238001 保安街1段325號", "lat": 24.99822, "lon": 121.417731, "phone": "(02)2681-2148"}, {"name": "三重中山路郵局", "address": "241040 新北大道一段17號", "lat": 25.061237, "lon": 121.487571, "phone": "(02)2988-2775-120"}, {"name": "新莊郵局", "address": "242009 中正路265號", "lat": 25.03539, "lon": 121.449705, "phone": "(02)2992-1622-101"}, {"name": "淡水郵局", "address": "251018 中正路203號", "lat": 25.17185, "lon": 121.437409, "phone": "(02)2621-2054"}, {"name": "宜蘭中山路郵局", "address": "260004 中山路3段130號", "lat": 24.758323, "lon": 121.753012, "phone": "(03)932-4133"}, {"name": "羅東郵局", "address": "265001 興東路69號", "lat": 24.6775, "lon": 121.768221, "phone": "(03)954-2242"}, {"name": "桃園成功路郵局", "address": "330005 成功路一段51號", "lat": 24.992567, "lon": 121.311098, "phone": "(03)334-6077"}, {"name": "中壢郵局", "address": "320003 中美路51號", "lat": 24.958449, "lon": 121.225989, "phone": "(03)422-0552"}, {"name": "龍潭郵局", "address": "325012 中正路151號", "lat": 24.866523, "lon": 121.216802, "phone": "(03)479-2025-13"}, {"name": "楊梅郵局", "address": "326102 大平街7號", "lat": 24.910675, "lon": 121.147608, "phone": "(03)475-5281"}, {"name": "新竹武昌街郵局", "address": "300191 北大路95號1樓", "lat": 24.811364, "lon": 120.970798, "phone": "(03)521-5984"}, {"name": "竹北郵局", "address": "302011 中正西路60號", "lat": 24.839851, "lon": 121.003117, "phone": "(03)555-2207"}, {"name": "竹東郵局", "address": "310007 東林路128號", "lat": 24.736831, "lon": 121.092741, "phone": "(03)596-2892"}, {"name": "湖口郵局", "address": "303032 忠孝路26號", "lat": 24.900663, "lon": 121.046253, "phone": "(03)599-2036"}, {"name": "苗栗中苗郵局", "address": "360009 中正路532號", "lat": 24.558433, "lon": 120.820839, "phone": "(037)33-4678"}, {"name": "臺中民權路郵局", "address": "400700 民權路86號", "lat": 24.139121, "lon": 120.678871, "phone": "(04)2221-5121-226"}, {"name": "豐原郵局", "address": "420772 中正路298號", "lat": 24.251497, "lon": 120.714984, "phone": "(04)2527-1140"}, {"name": "彰化光復路郵局", "address": "500006 和平路55號", "lat": 24.07996, "lon": 120.54031, "phone": "(04)722-1130"}, {"name": "彰化中央路郵局", "address": "500046 中央路270號", "lat": 24.0682, "lon": 120.527, "phone": "(04)761-6690-229"}, {"name": "員林郵局", "address": "510004 員東路二段490號", "lat": 23.957667, "lon": 120.577349, "phone": "(04)832-4541-18"}, {"name": "南投三和郵局", "address": "540018 三和二路30號", "lat": 23.904367, "lon": 120.688465, "phone": "(049)222-0162-231"}, {"name": "嘉義文化路郵局", "address": "600013 文化路134號", "lat": 23.477912, "lon": 120.449996, "phone": "(05)225-9408"}, {"name": "嘉義玉山郵局", "address": "600072 中興路672號", "lat": 23.472207, "lon": 120.428865, "phone": "(05)286-0153"}, {"name": "斗六西平路郵局", "address": "640010 西平路1號", "lat": 23.706839, "lon": 120.539806, "phone": "(05)532-2245"}, {"name": "臺南成功路郵局", "address": "704401 成功路6、8號(儲匯：6號；郵務：8號)", "lat": 22.997777, "lon": 120.210277, "phone": "(06)226-7962"}, {"name": "佳里郵局", "address": "722001 延平路375號", "lat": 23.163731, "lon": 120.178129, "phone": "(06)721-1837"}, {"name": "新營郵局", "address": "730025 中山路126號", "lat": 23.305143, "lon": 120.317909, "phone": "(06)632-3613"}, {"name": "新興郵局", "address": "800012 中正三路177、179號", "lat": 22.631026, "lon": 120.303875, "phone": "(07)221-2591"}, {"name": "岡山郵局", "address": "820011 民有路68號", "lat": 22.792177, "lon": 120.296342, "phone": "(07)621-2462"}, {"name": "鳳山郵局", "address": "830072 中山東路86-2號", "lat": 22.624332, "lon": 120.371928, "phone": "(07)746-2446-605、606"}, {"name": "馬公中正路郵局", "address": "880001 中正路70號", "lat": 23.5671515, "lon": 119.5635267, "phone": "(06)927-8738"}, {"name": "屏東民生路郵局", "address": "900006 民生路250號", "lat": 22.670552, "lon": 120.491605, "phone": "(08)732-3310"}, {"name": "臺東大同路郵局", "address": "950004 大同路126號", "lat": 22.752944, "lon": 121.153945, "phone": "(089)31-1654"}, {"name": "花蓮國安郵局", "address": "970013 中山路408號", "lat": 23.984045, "lon": 121.604421, "phone": "(03)833-1141-278"}];
function nearbyOffices(latitude, longitude) {
  const radians = degrees => degrees * Math.PI / 180;
  return postalLocations.map(office => {
    const halfLat = Math.sin(radians(office.lat - latitude) / 2);
    const halfLon = Math.sin(radians(office.lon - longitude) / 2);
    const a = halfLat ** 2 + Math.cos(radians(latitude)) *
      Math.cos(radians(office.lat)) * halfLon ** 2;
    const km = 12742 * Math.asin(Math.sqrt(Math.min(1, a)));
    return {...office, km};
  }).sort((a, b) => a.km - b.km).slice(0, 3);
}


const scenicOffices = {"臺北大龍峒郵局": {"address": "103250 重慶北路三段338號", "phone": "(02)2597-5098"}, "彰化中央路郵局": {"address": "500046 中央路270號", "phone": "(04)761-6690-229"}, "彰化南瑤郵局": {"address": "500009 中山路二段49號", "phone": "(04)723-6849"}, "彰化光復路郵局": {"address": "500006 和平路55號", "phone": "(04)722-1130"}, "臺北中正堂郵局": {"address": "100012 中山南路21號(中正紀念堂內)", "phone": "(02)2394-2715"}, "臺北逸仙郵局": {"address": "110054 逸仙路46號", "phone": "(02)2729-0135"}, "林口中正路郵局": {"address": "244005 中正路115號", "phone": "(02)2601-1016"}, "淡水郵局": {"address": "251018 中正路203號", "phone": "(02)2621-2054"}, "鶯歌郵局": {"address": "239001 中正一路47號", "phone": "(02)2679-2330"}, "平溪郵局": {"address": "226001 平溪街42號", "phone": "(02)2495-1062"}, "松山機場郵局": {"address": "105008 敦化北路340-9號(松山機場內 )", "phone": "(02)2713-3365"}, "臺北世貿郵局": {"address": "110202 信義路五段5號(世貿中心內)", "phone": "(02)2725-2479"}, "木柵郵局": {"address": "116008 木柵路三段27號", "phone": "(02)2939-2781-20"}, "臺北火車站郵局": {"address": "100230 北平西路3號(台北火車站內)", "phone": "(02)2311-4239"}, "臺南南門路郵局": {"address": "700280 南門路93號", "phone": "(06)214-7235"}, "臺北南海郵局": {"address": "100056 重慶南路二段43號(郵政博物館1樓)", "phone": "(02)2396-3142"}, "新店郵局": {"address": "231008 北新路2段177號", "phone": "(02)2911-1249"}, "坪林郵局": {"address": "232001 北宜路8段282號", "phone": "(02)2665-6214"}, "臺南普濟郵局": {"address": "700006 西門路二段366號", "phone": "(06)223-5410"}, "臺南安平郵局": {"address": "708001 安北路149號", "phone": "(06)223-5402"}, "基隆愛三路郵局": {"address": "200009 愛三路130號1F", "phone": "(02)2421-0113"}, "基隆港西街郵局": {"address": "200002 港西街10號", "phone": "(02)2421-0157"}, "臺北北門郵局": {"address": "100003 忠孝西路一段120號1樓", "phone": "(02)2331-1374"}, "臺北老松郵局": {"address": "108212 桂林路51號", "phone": "(02)2389-4549"}, "臺中民權路郵局": {"address": "400700 民權路86號", "phone": "(04)2221-5121-226"}, "臺中福安郵局": {"address": "407769 福順路318號", "phone": "(04)2463-0618"}, "臺南成功路郵局": {"address": "704401 成功路6、8號(儲匯：6號；郵務：8號)", "phone": "(06)226-7962"}, "總統府郵局": {"address": "100006 重慶南路一段122號(總統府內)", "phone": "(02)2311-0859"}, "臺中南屯路郵局": {"address": "408719 南屯路二段405號", "phone": "(04)2389-0624"}, "東海大學郵局": {"address": "407705 臺灣大道四段2147號", "phone": "(04)2359-2748"}, "臺中向上郵局": {"address": "408770 向上路二段199號", "phone": "(04)2387-0215"}, "臺中淡溝郵局": {"address": "404753 民權路365號", "phone": "(04)2205-1277"}, "臺中雙十路郵局": {"address": "404726 雙十路二段119號", "phone": "(04)2233-2382"}, "臺北中山堂郵局": {"address": "100005 中華路一段53號(臺北市立國樂團1樓)", "phone": "(02)2314-8490"}, "臺東大同路郵局": {"address": "950004 大同路126號", "phone": "(089)31-1654"}, "埔里中心碑郵局": {"address": "545014 和平東路490號", "phone": "(049)298-9848"}, "車城郵局": {"address": "944013 福興村中山路54號", "phone": "(08)882-1046"}, "新竹英明街郵局": {"address": "300024 英明街10號", "phone": "(03)523-8365"}, "新興郵局": {"address": "800012 中正三路177、179號", "phone": "(07)221-2591"}, "橋頭郵局": {"address": "825008 橋頭路113號", "phone": "(07)611-3602"}, "嘉義玉山郵局": {"address": "600072 中興路672號", "phone": "(05)286-0153"}, "嘉義大學郵局": {"address": "600355 學府路300號(嘉義大學內)", "phone": "(05)277-1612"}, "梅山郵局": {"address": "603004 中山路109號", "phone": "(05)262-1213"}, "嘉義中山路郵局": {"address": "600008 中山路107號", "phone": "(05)278-5145"}, "番路郵局": {"address": "602001 下坑村菜公店55號", "phone": "(05)259-1105"}, "綠島郵局": {"address": "951001 南寮村南寮186號", "phone": "(089)67-2559"}, "馬公中正路郵局": {"address": "880001 中正路70號", "phone": "(06)927-8738"}, "新豐郵局": {"address": "304108 振興街12號", "phone": "(03)559-3544"}, "關西郵局": {"address": "306001 正義路86號", "phone": "(03)587-2147"}, "瑞芳金瓜石郵局": {"address": "224010 金光路51-1號", "phone": "(02)2496-1419"}, "基隆中正郵局": {"address": "202007 中正路393巷18號", "phone": "(02)2462-3324"}, "基隆八斗子郵局": {"address": "202012 八斗街14號", "phone": "(02)2469-2134"}, "基隆光二路郵局": {"address": "200003 光二路1號", "phone": "(02)2431-8895"}, "南港郵局": {"address": "115029 南港路二段78號", "phone": "(02)2785-0141"}, "北投郵局": {"address": "112006 光明路165號", "phone": "(02)2891-2420"}, "桃園成功路郵局": {"address": "330005 成功路一段51號", "phone": "(03)334-6077"}, "官田隆田郵局": {"address": "720001 勝利路2號", "phone": "(06)579-1112"}, "嘉義忠孝郵局": {"address": "600015 民權路208-1號", "phone": "(05)278-3079"}, "金門山外郵局": {"address": "891005 林森路39號", "phone": "(082)33-3741"}, "金門郵局": {"address": "893013 民生路４號", "phone": "(082)32-5823"}, "金門烈嶼郵局": {"address": "894021 林湖村西宅7之5號", "phone": "(082)36-2171"}, "基隆和平島郵局": {"address": "202008 和一路129號", "phone": "(02)2462-2371"}, "富里郵局": {"address": "983001 中山路169號", "phone": "(03)883-1053"}, "富里東里郵局": {"address": "983004 東里村道化路9號", "phone": "(03)886-1601"}, "伸港郵局": {"address": "509011 中山路100號", "phone": "(04)798-2139"}, "芳苑王功郵局": {"address": "528010 芳漢路王功段300、302號", "phone": "(04)893-6308"}, "彰化過溝仔郵局": {"address": "500022 彰美路一段166號", "phone": "(04)723-5319"}, "左營果貿郵局": {"address": "813009 翠峰路2號", "phone": "(07)582-0716"}, "淡水中興郵局": {"address": "251002 學府路29、31、33號", "phone": "(02)2622-3820"}, "山上郵局": {"address": "743001 山上里山上250號", "phone": "(06)578-1024"}, "西螺郵局": {"address": "648004 福興路167-1號", "phone": "(05)586-2166"}, "古坑草嶺郵局": {"address": "646009 草嶺村7鄰草嶺37之29號", "phone": "(05)583-1287"}, "斗六西平路郵局": {"address": "640010 西平路1號", "phone": "(05)532-2245"}, "北港郵局": {"address": "651004 文化路54號", "phone": "(05)783-2229"}, "太麻里郵局": {"address": "963004 泰和村太麻里街191號", "phone": "(089)78-1319"}, "金峰金崙郵局": {"address": "963005 金崙村金崙323號", "phone": "(089)77-1056"}, "內埔郵局": {"address": "912007 內埔村文化路277號", "phone": "(08)779-2054"}, "龍潭南龍郵局": {"address": "325027 南龍路70號", "phone": "(03)470-4059"}, "觀音草漯郵局": {"address": "328007 大觀路2段32之1號", "phone": "(03)483-1280"}, "復興郵局": {"address": "336041 中正路62號", "phone": "(03)382-2307"}, "八德更寮腳郵局": {"address": "334007 介壽路2段1030號", "phone": "(03)368-4554"}, "北門郵局": {"address": "727008 北門里舊埕91號", "phone": "(06)786-2031"}, "信義郵局": {"address": "556001 玉山路44號", "phone": "(049)279-1257"}, "信義和社郵局": {"address": "556003 同和巷72-7號", "phone": "(049)270-1172"}, "鳳山郵局": {"address": "830072 中山東路86-2號", "phone": "(07)746-2446-605、606"}, "望安郵局": {"address": "882001 東安村1鄰望安4之3號", "phone": "(06)999-1062"}, "花蓮國安郵局": {"address": "970013 中山路408號", "phone": "(03)833-1141-278"}, "花蓮中山路郵局": {"address": "970009 中山路188號", "phone": "(03)832-3279"}, "中壢青埔郵局": {"address": "320014 高鐵南路2段289號", "phone": "(03)287-5710"}, "大湖郵局": {"address": "364020 中正路42號", "phone": "(037)99-1047"}, "泰安郵局": {"address": "365008 清安村洗水坑23號", "phone": "(037)94-1035"}, "石門郵局": {"address": "253001 中山路80號", "phone": "(02)2638-1210"}, "集集郵局": {"address": "552001 民生路110-1號", "phone": "(049)276-2527"}, "仁愛霧社郵局": {"address": "546001 仁和路83號", "phone": "(049)280-2246"}, "左營郵局": {"address": "813006 實踐路43號", "phone": "(07)581-0018"}, "鼓山郵局": {"address": "804002 臨海二路17號", "phone": "(07)551-6044"}, "臺中四張犁郵局": {"address": "406739 豐樂路二段162號", "phone": "(04)2422-4016"}, "海洋大學郵局": {"address": "202301 北寧路2號(海洋大學內)", "phone": "(02)2462-1990"}, "臺南地方法院郵局": {"address": "708202 健康路三段308號(臺南地方法院內)", "phone": "(06)298-6435"}, "東港中正路郵局": {"address": "928001 頂新里中正路183號", "phone": "(08)833-6257"}, "東港郵局": {"address": "928007 光復路一段293號", "phone": "(08)832-9468"}, "臺灣桃園國際機場郵局": {"address": "337041 航站南路9號(臺灣桃園國際機場第二航站大廈1樓)", "phone": "(03)393-1701"}, "臺中港郵局": {"address": "435711 四維路129號", "phone": "(04)2657-3645"}, "清水郵局": {"address": "436713 中山路124號", "phone": "(04)2622-7353"}, "玉里郵局": {"address": "981002 光復路111號", "phone": "(03)888-2177"}, "秀林天祥郵局": {"address": "972003 富世村天祥21號", "phone": "(03)869-1128"}, "新城北埔郵局": {"address": "971053 大漢村光復路578號", "phone": "(03)826-6674"}, "花蓮師院郵局": {"address": "970024 華西路123號", "phone": "(03)822-5374"}, "臺南中正路郵局": {"address": "700015 中正路42號", "phone": "(06)222-3304"}, "臺北公館郵局": {"address": "100046 羅斯福路四段74號(B1)", "phone": "(02)2365-9518"}, "臺南新南郵局": {"address": "708004 永華三街6號", "phone": "(06)299-2514"}, "宜蘭中山路郵局": {"address": "260004 中山路3段130號", "phone": "(03)932-4133"}, "頭城郵局": {"address": "261008 民鋒路15號", "phone": "(03)977-1170"}, "羅東郵局": {"address": "265001 興東路69號", "phone": "(03)954-2242"}, "臺北圓山郵局": {"address": "104231 林森北路573號", "phone": "(02)2592-1606"}, "左鎮郵局": {"address": "713001 中正里中正15之3號", "phone": "(06)573-1035"}, "臺中英才郵局": {"address": "403765 民生路200號", "phone": "(04)2302-2484"}, "中埔郵局": {"address": "606013 中埔村16鄰中埔167號", "phone": "(05)253-1030"}, "湖西郵局": {"address": "885001 湖西村6鄰湖西77之11號", "phone": "(06)992-1210"}, "西嶼郵局": {"address": "881002 池東村5鄰小池角212之1號", "phone": "(06)998-1163"}, "蘇澳郵局": {"address": "270001 中山路1段1號", "phone": "(03)996-2165"}, "新店碧潭郵局": {"address": "231039 北宜路1段47號", "phone": "(02)2911-1564"}, "臺中西屯郵局": {"address": "407730 黎明路三段130號", "phone": "(04)2701-0016"}, "臺東知本郵局": {"address": "950101 青海路四段370號", "phone": "(089)51-2543"}, "馬祖郵局": {"address": "209002 福沃村141號", "phone": "(0836)22050"}, "馬祖北竿郵局": {"address": "210005 塘岐村256號", "phone": "(0836)55363"}, "屏東民生路郵局": {"address": "900006 民生路250號", "phone": "(08)732-3310"}, "屏東北平路郵局": {"address": "900013 北平路26號", "phone": "(08)732-6608"}, "新營郵局": {"address": "730025 中山路126號", "phone": "(06)632-3613"}, "五結郵局": {"address": "268019 自強路165、167號", "phone": "(03)950-5652"}, "苗栗中苗郵局": {"address": "360009 中正路532號", "phone": "(037)33-4678"}, "三義郵局": {"address": "367005 中正路101號", "phone": "(037)87-2142"}, "臺南和順郵局": {"address": "709019 安和路5段119號", "phone": "(06)355-9285"}, "永康鹽行郵局": {"address": "710042 中正北路79號", "phone": "(06)253-1054"}, "枋山郵局": {"address": "941011 楓港村18鄰舊庄47號", "phone": "(08)877-1219"}, "瑞芳九份郵局": {"address": "224008 基山街126號", "phone": "(02)2497-2854"}, "六龜郵局": {"address": "844001 光復路173號", "phone": "(07)689-1046"}, "鹿野郵局": {"address": "955002 中華路一段427號", "phone": "(089)55-1341"}, "臺東豐田郵局": {"address": "950261 中興路四段615號", "phone": "(089)38-2520"}, "臺北青田郵局": {"address": "106203 和平東路一段155號", "phone": "(02)2321-4288"}, "苓雅郵局": {"address": "802634 成功一路134號", "phone": "(07)333-0818"}, "東石郵局": {"address": "614007 東石村13鄰東石34號", "phone": "(05)373-2224"}, "左營新莊仔郵局": {"address": "813018 富民路356號", "phone": "(07)556-1083"}, "茄萣郵局": {"address": "852202 進學路158號", "phone": "(07)690-0206"}, "旗津郵局": {"address": "805002 中洲三路817號", "phone": "(07)571-7832"}, "仁德車路墘郵局": {"address": "717005 中正路一段32號", "phone": "(06)266-2944"}, "仁德郵局": {"address": "717009 中正路二段1118號", "phone": "(06)270-0982"}, "通霄白沙屯郵局": {"address": "357001 白東里20鄰白東142號", "phone": "(037)79-2976"}, "萬巒郵局": {"address": "923015 萬和村中正路10號", "phone": "(08)781-2784"}, "梧棲郵局": {"address": "435714 梧棲路173號", "phone": "(04)2656-5530"}, "旗山郵局": {"address": "842056 延平一路690號", "phone": "(07)661-2102"}, "嘉義文化路郵局": {"address": "600013 文化路134號", "phone": "(05)225-9408"}, "鳳山大東郵局": {"address": "830021 大東一路122、124號", "phone": "(07)746-6936"}, "大溪郵局": {"address": "335015 康莊路210號", "phone": "(03)388-2141"}, "七股郵局": {"address": "724032 大埕里大埕296號", "phone": "(06)787-2241"}, "七美郵局": {"address": "883001 海豐村10鄰東崎頭19號", "phone": "(06)997-1105"}, "蘆洲郵局": {"address": "247010 三民路97號", "phone": "(02)2282-1162-101"}, "蘆洲空大郵局": {"address": "247340 中正路172號(國立空中大學內)", "phone": "(02)2281-5284"}, "竹山郵局": {"address": "557004 前山路一段2號", "phone": "(049)264-2076"}, "鹿谷郵局": {"address": "558003 中正路二段115號", "phone": "(049)275-2434"}, "海軍官校郵局": {"address": "811299 軍校路669號", "phone": "(07)582-7759"}, "北埔郵局": {"address": "314001 長興街1號", "phone": "(03)580-2261"}, "屏東六塊厝郵局": {"address": "900008 光復路304號", "phone": "(08)765-4356"}, "恆春郵局": {"address": "946002 恆西路1巷32號", "phone": "(08)889-8053"}, "琉球郵局": {"address": "929001 本福村中山路105號", "phone": "(08)861-2507"}, "恆春墾丁郵局": {"address": "946004 墾丁路2號1樓", "phone": "(08)886-1455"}, "泰武郵局": {"address": "921021 佳平村佳平巷102號", "phone": "(08)783-2817"}, "新埔郵局": {"address": "305045 中正路210號", "phone": "(03)588-2134"}, "橫山內灣郵局": {"address": "312003 內灣村中正路311號", "phone": "(03)584-9174"}, "新竹武昌街郵局": {"address": "300191 北大路95號1樓", "phone": "(03)521-5984"}, "尖石郵局": {"address": "313001 嘉樂村2鄰麥樹仁46號", "phone": "(03)584-1274"}, "后里郵局": {"address": "421786 公安路77號", "phone": "(04)2556-2067"}, "高雄瑞豐郵局": {"address": "804051 中華一路316之3號", "phone": "(07)552-9669"}, "高雄站前郵局": {"address": "807001 建國三路2-2號", "phone": "(07)286-7211"}, "嘉義站前郵局": {"address": "600003 中正路647號", "phone": "(05)224-2021"}, "馬祖東引郵局": {"address": "212041 樂華村69號", "phone": "(0836)77276"}, "鹿港郵局": {"address": "505024 成功路1號", "phone": "(04)778-0162"}, "貢寮郵局": {"address": "228003 貢寮街50號", "phone": "(02)2494-1127"}, "小港機場郵局": {"address": "812201 中山四路2號(小港國際機場內)", "phone": "(07)801-1918"}, "大樹郵局": {"address": "840201 中興西路40號", "phone": "(07)651-0464"}, "芎林郵局": {"address": "307002 文衡路426號", "phone": "(03)592-2849"}, "陽明山郵局": {"address": "112091 紗帽路139之1號", "phone": "(02)2861-6151"}, "阿里山郵局": {"address": "605001 中正村2鄰東阿里山53號", "phone": "(05)267-9970"}, "白河郵局": {"address": "732002 三民路410號", "phone": "(06)685-2061"}, "豐濱郵局": {"address": "977004 光豐路48號", "phone": "(03)879-1192"}, "大甲郵局": {"address": "437704 新政路1號", "phone": "(04)2687-2632"}, "大甲廟口郵局": {"address": "437706 順天路159號", "phone": "(04)2687-3624"}, "美濃郵局": {"address": "843001 中正路1段39號", "phone": "(07)681-9051"}, "萬里郵局": {"address": "207003 瑪鋉路48號", "phone": "(02)2492-2042"}, "中山大學郵局": {"address": "804201 蓮海路70號(西子灣國立中山大學內)", "phone": "(07)525-0829"}, "新化郵局": {"address": "712001 中正路312號", "phone": "(06)590-2061"}, "蘭嶼郵局": {"address": "952001 紅頭村紅頭37號", "phone": "(089)73-1570"}, "茂林郵局": {"address": "851001 茂林里1鄰茂林巷8之3號", "phone": "(07)680-1156"}, "花蓮港務局郵局": {"address": "970019 民權路27號", "phone": "(03)835-9244"}, "內門郵局": {"address": "845052 內豊里內埔121號", "phone": "(07)667-1271"}, "瑞穗郵局": {"address": "978001 中山路一段120號", "phone": "(03)887-2134"}, "三峽郵局": {"address": "237006 民生街66號", "phone": "(02)2672-1173"}, "成功郵局": {"address": "961006 中華路77號", "phone": "(089)85-3620"}, "龍潭郵局": {"address": "325012 中正路151號", "phone": "(03)479-2025-13"}, "龍潭大平郵局": {"address": "325007 龍源路大平段270號", "phone": "(03)471-2857"}, "龍潭石門水庫郵局": {"address": "325006 佳安路3號", "phone": "(03)471-2509"}, "水里郵局": {"address": "553001 中富街28號", "phone": "(049)277-0132"}, "南庄郵局": {"address": "353005 中正路202號", "phone": "(037)82-2067"}, "金山郵局": {"address": "208005 中山路97號", "phone": "(02)2498-2140"}, "烏來郵局": {"address": "233001 烏來里溫泉街69號", "phone": "(02)2661-6303"}, "白沙郵局": {"address": "884002 大赤崁356號", "phone": "(06)993-1207"}, "鳥松郵局": {"address": "833173 中正路311號", "phone": "(07)732-1811"}, "澄清湖郵局": {"address": "807037 澄清路643號", "phone": "(07)767-0929"}, "五峰郵局": {"address": "311201 大隘村6鄰五峰95號", "phone": "(03)585-1103"}, "林園郵局": {"address": "832008 鳳林路1段176號", "phone": "(07)641-2106"}, "金門沙美郵局": {"address": "890006 國中路21號", "phone": "(082)35-2557"}, "和平梨山郵局": {"address": "424794 梨山里中正路89號", "phone": "(04)2598-9334"}, "板橋文化路郵局": {"address": "220013 文化路1段395號", "phone": "(02)2259-8788"}, "田寮郵局": {"address": "823004 崗北路61號", "phone": "(07)636-1675"}, "曾文水庫郵局": {"address": "715004 密枝里密枝70號(曾文水庫管理局內)", "phone": "(06)575-1965"}, "頭屋郵局": {"address": "362001 尖豐路17號", "phone": "(037)25-1050"}, "日月潭郵局": {"address": "555009 名勝街36號", "phone": "(049)285-5154"}, "前金郵局": {"address": "801649 六合二路147號", "phone": "(07)285-5808"}, "故宮郵局": {"address": "111001 至善路二段221號(故宮博物院內)", "phone": "(02)2881-8410"}, "貢寮澳底郵局": {"address": "228004 仁和路230號", "phone": "(02)2490-1002"}, "水上回歸郵局": {"address": "608010 三和村新厝仔2之4號", "phone": "(05)235-6840"}, "長濱郵局": {"address": "962001 長濱村中興路16號", "phone": "(089)83-1011"}, "滿州郵局": {"address": "947017 中山路25號", "phone": "(08)880-1110"}, "礁溪郵局": {"address": "262003 礁溪路4段130號", "phone": "(03)988-2203"}, "基隆港東郵局": {"address": "202005 中正路56號", "phone": "(02)2421-0156"}, "南投中興郵局": {"address": "540003 中學路4號", "phone": "(049)233-2852"}, "豐原郵局": {"address": "420772 中正路298號", "phone": "(04)2527-1140"}, "豐原水源郵局": {"address": "420785 水源路594-2號", "phone": "(04)2528-0930"}, "田尾郵局": {"address": "522013 光復路三段26號", "phone": "(04)883-2425"}};
function officeDetails(name, office, historical = false) {
  const panel = element('div', '');
  panel.className = 'note';
  panel.append(element('strong', '設置局所地址'));
  if (!office) {
    panel.append(element('p', '地址待核對，請查看官方資料。'));
    return panel;
  }
  panel.append(element('p', office.address));
  if (office.phone) {
    const phone = element('a', '郵務電話 ' + office.phone);
    phone.href = 'tel:' + office.phone.replace(/[^+\d]/g, '');
    panel.append(phone);
  }
  panel.append(element('p', historical ? '歷史設置資料。郵寄受理與收件資訊請先向郵局確認。'
    : '郵寄索戳前，請向郵局確認是否受理及收件人。'));
  const copy = element('button', '複製局名與地址');
  copy.className = 'action';
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    const text = name + '\n' + office.address;
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = '已複製';
    } catch {
      window.prompt('請複製局名與地址', text);
    }
  });
  panel.append(copy);
  return panel;
}

function locationPanel() {
  const panel = element('div', '');
  const locate = element('button', '找最近的設置郵局');
  const demo = element('button', '以台北車站試算');
  const status = element('p', '距離排序涵蓋 53 個已核對座標的據點。臨時郵局及郵政博物館請查官方 PDF。');
  const list = element('ol', '');
  status.setAttribute('role', 'status');
  for (const button of [locate, demo]) {
    button.type = 'button';
    button.className = 'action';
  }
  function show(latitude, longitude, label) {
    status.textContent = label + ' · 直線距離最近的 3 間設置郵局';
    list.replaceChildren(...nearbyOffices(latitude, longitude).map(office => {
      const row = element('li', office.name + ' · 約 ' + office.km.toFixed(2) + ' 公里');
      const map = element('a', '查看地圖 ↗');
      map.href = 'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(office.lat + ',' + office.lon);
      map.target = '_blank';
      map.rel = 'noopener noreferrer';
      row.append(officeDetails(office.name, office), map);
      return row;
    }));
  }
  demo.addEventListener('click', () => show(25.0478, 121.5170, '台北車站示範'));
  locate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      status.textContent = '這個瀏覽器無法定位，可用台北車站試算。';
      return;
    }
    locate.disabled = true;
    list.replaceChildren();
    status.textContent = '正在取得位置…';
    navigator.geolocation.getCurrentPosition(({coords}) => {
      locate.disabled = false;
      show(coords.latitude, coords.longitude, '依你的位置');
    }, () => {
      locate.disabled = false;
      status.textContent = '無法取得位置，可用台北車站試算。';
    }, {timeout: 10000});
  });
  panel.append(locate, demo, status, list);
  return panel;
}

function card(record) {
  const article = element('article', '');
  article.className = 'card';
  const body = element('div', '');
  body.className = 'body';
  const date = scenic ? '啟用日期 ' + format(record.date)
    : '使用日期 ' + format(record.date) + ' 至 ' + format(record.end_date);
  body.append(element('h3', record.title), element('p', date));
  if (scenic) body.append(element('p', record.office),
    officeDetails(record.office, scenicOffices[record.office], record.unlisted));
  if (record.unlisted) body.append(element('p', '已不在最新官方清單，請向郵局確認。'));
  const source = officialLink(record.official_url, '查看官方資料 ↗');
  if (source) body.append(source);
  const locations = officialLink(record.location_url, '設置地點 PDF ↗');
  if (locations) body.append(locations);
  const picture = officialLink(record.image_url, '');
  if (picture) {
    const image = element('img', '');
    image.src = record.image_url;
    image.alt = record.title + '戳圖';
    image.loading = 'lazy';
    image.style.cssText = 'width:100%;height:150px;object-fit:contain';
    image.addEventListener('error', () => picture.replaceWith(element('p', '圖片暫時無法載入。')));
    picture.append(image);
    picture.title = '開啟原始戳圖';
    article.append(picture);
  } else {
    article.append(element('p', '暫無戳圖，可查看官方資料。'));
  }
  if (!scenic && record.id === '13321') body.append(locationPanel());
  article.append(body);
  return article;
}

function render() {
  const query = normalize(byId('query').value.trim());
  const year = byId('year').value;
  const includeHistory = query || year || byId('history').checked;
  const today = todayTaiwan();
  const matches = records.filter(record =>
    (scenic || includeHistory || record.end_date >= today) &&
    (query || year || !record.unlisted) &&
    (!year || record.date.startsWith(year + '-')) &&
    normalize([record.title, record.office].filter(Boolean).join(' ')).includes(query));
  byId('result').textContent = '共 ' + matches.length + ' 筆 · 同步日期 ' + updatedAt;
  byId('cards').replaceChildren(...matches.map(card));
}

async function load() {
  byId('title').textContent = label;
  byId('history-filter').hidden = scenic;
  document.querySelector('nav a[href="catalog.html?type=' + type + '"]').setAttribute('aria-current', 'page');
  byId('intro').textContent = scenic
    ? '依名稱、使用局所或啟用年份查詢。實際提供情形請向郵局確認。'
    : '預設顯示尚未到使用迄日的紀念戳（含迄日當天）。搜尋名稱、選年份或勾選「顯示已過使用期限的紀念戳」可查舊紀錄。補蓋期限請參考官方公告。';
  try {
    const response = await fetch('data/' + type + '.json', {cache:'no-store'});
    if (!response.ok) throw Error(response.status);
    const data = await response.json();
    records = data.items;
    updatedAt = data.updated_at;
    byId('lastUpdated').textContent = '最後整理：' + updatedAt;
    const years = new Set(records.map(record => record.date.slice(0, 4)));
    for (const year of [...years].sort().reverse()) {
      const option = element('option', year);
      option.value = year;
      byId('year').append(option);
    }
    byId('query').addEventListener('input', render);
    byId('year').addEventListener('change', render);
    byId('history').addEventListener('change', render);
    render();
  } catch (error) {
    byId('lastUpdated').textContent = '同步日期暫不可用';
    byId('result').textContent = '暫時無法載入' + label + '資料。';
    console.error(error);
  }
}
load();

