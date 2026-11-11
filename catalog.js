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


let officeData = {offices: {}, commemorative: {}};
function nearbyOffices(offices, latitude, longitude) {
  const radians = degrees => degrees * Math.PI / 180;
  return offices.filter(office => Number.isFinite(office.lat) && Number.isFinite(office.lon)).map(office => {
    const halfLat = Math.sin(radians(office.lat - latitude) / 2);
    const halfLon = Math.sin(radians(office.lon - longitude) / 2);
    const a = halfLat ** 2 + Math.cos(radians(latitude)) *
      Math.cos(radians(office.lat)) * halfLon ** 2;
    const km = 12742 * Math.asin(Math.sqrt(Math.min(1, a)));
    return {...office, km};
  }).sort((a, b) => a.km - b.km).slice(0, 3);
}


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

function locationPanel(record) {
  const data = officeData.commemorative[record.id];
  const panel = element('div', '');
  if (data?.status !== 'verified') {
    panel.append(element('p', '設置名單尚待核對，請參考官方設置地點。'));
    return panel;
  }
  const offices = data.offices;
  const located = offices.filter(office => Number.isFinite(office.lat) && Number.isFinite(office.lon));
  const status = element('p', '官方設置名單共 ' + offices.length + ' 處，其中 ' +
    located.length + ' 處可依距離排序。其餘設置場所請查看完整名單。');
  status.setAttribute('role', 'status');
  const list = element('ol', '');
  const all = element('details', '');
  all.append(element('summary', '查看全部設置局所與地址'));
  for (const office of offices) {
    all.append(element('h4', office.name),
      officeDetails(office.name, office.address ? office : null));
  }
  if (located.length) {
    const locate = element('button', '找最近的設置郵局');
    locate.type = 'button';
    locate.className = 'action';
    locate.addEventListener('click', () => {
      if (!navigator.geolocation) {
        status.textContent = '瀏覽器無法定位，請查看下方完整設置名單。';
        return;
      }
      locate.disabled = true;
      list.replaceChildren();
      status.textContent = '正在取得位置…';
      navigator.geolocation.getCurrentPosition(({coords}) => {
        locate.disabled = false;
        status.textContent = '依你的位置排序，以下為已核對座標的最近設置郵局（直線距離）。';
        list.replaceChildren(...nearbyOffices(offices, coords.latitude, coords.longitude).map(office => {
          const row = element('li', office.name + ' · 約 ' + office.km.toFixed(2) + ' 公里');
          const map = element('a', '查看地圖 ↗');
          map.href = 'https://www.google.com/maps/search/?api=1&query=' +
            encodeURIComponent(office.lat + ',' + office.lon);
          map.target = '_blank';
          map.rel = 'noopener noreferrer';
          row.append(officeDetails(office.name, office), map);
          return row;
        }));
      }, error => {
        locate.disabled = false;
        status.textContent = error.code === 1
          ? '定位權限未開啟，請允許定位或查看下方完整名單。'
          : '暫時無法取得位置，請重試或查看下方完整名單。';
      }, {timeout: 10000});
    });
    panel.append(locate);
  }
  if (data.refresh_failed) panel.append(element('p', '本次名單更新未成功，以下為上次核對資料。'));
  panel.append(status, list, all);
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
    officeDetails(record.office, officeData.offices[normalize(record.office).replace(/\s/g, '')], record.unlisted));
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
  if (!scenic) body.append(locationPanel(record));
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
    const officeResponse = await fetch('data/offices.json', {cache: 'no-store'});
    if (!officeResponse.ok) throw Error('設置局所資料載入失敗');
    officeData = await officeResponse.json();
    for (const placement of Object.values(officeData.commemorative)) {
      placement.offices = placement.office_names.map(name =>
        officeData.offices[normalize(name).replace(/\s/g, '')] || {name});
    }
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


