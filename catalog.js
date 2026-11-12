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
let officeState = 'loading';
let visibleCount = 24;
let currentMatches = [];
let scenicPosition = null;
const more = element('button', '載入更多');
more.type = 'button';
more.className = 'action';
more.hidden = true;
byId('cards').after(more);
more.addEventListener('click', () => {
  const next = currentMatches.slice(visibleCount, visibleCount + 24);
  byId('cards').append(...next.map(card));
  visibleCount += next.length;
  more.hidden = visibleCount >= currentMatches.length;
});


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
function distanceKm(latitude, longitude, office) {
  const radians = degrees => degrees * Math.PI / 180;
  const halfLat = Math.sin(radians(office.lat - latitude) / 2);
  const halfLon = Math.sin(radians(office.lon - longitude) / 2);
  const a = halfLat ** 2 + Math.cos(radians(latitude)) *
    Math.cos(radians(office.lat)) * halfLon ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function nearbyOffices(offices, latitude, longitude) {
  return offices.filter(office => Number.isFinite(office.lat) && Number.isFinite(office.lon))
    .map(office => ({...office, km: distanceKm(latitude, longitude, office)}))
    .sort((a, b) => a.km - b.km).slice(0, 3);
}

function scenicOffice(record) {
  return record.office ? officeData.offices[normalize(record.office).replace(/\s/g, '')] : undefined;
}

function sortNearPosition(matches) {
  if (!scenic || !scenicPosition) return matches;
  return matches.filter(record => {
    const office = scenicOffice(record);
    return !record.unlisted && Number.isFinite(office?.lat) && Number.isFinite(office?.lon);
  }).sort((a, b) =>
    distanceKm(scenicPosition.latitude, scenicPosition.longitude, scenicOffice(a)) -
    distanceKm(scenicPosition.latitude, scenicPosition.longitude, scenicOffice(b)) ||
    a.title.localeCompare(b.title, 'zh-Hant'));
}

function configureScenicLocation() {
  byId('scenic-location').hidden = !scenic;
  if (!scenic) return;
  const button = byId('locate-scenic');
  const message = byId('location-status');
  message.textContent = '地址載入後可使用定位，依附近設置郵局的直線距離排序。';
  button.onclick = () => {
    if (!navigator.geolocation) {
      message.textContent = '瀏覽器不支援定位，請用名稱或郵局搜尋。';
      return;
    }
    button.disabled = true;
    message.textContent = '正在取得位置，請允許瀏覽器定位…';
    navigator.geolocation.getCurrentPosition(({coords}) => {
      scenicPosition = {latitude: coords.latitude, longitude: coords.longitude};
      button.disabled = false;
      byId('clear-location').hidden = false;
      message.textContent = '已依你的位置排序。距離為直線距離，未核對座標的據點暫不列入。';
      render();
    }, error => {
      button.disabled = false;
      message.textContent = error.code === 1
        ? '定位權限未開啟，可在瀏覽器允許後重試，或用郵局名稱搜尋。'
        : '暫時無法取得位置，請重試或用郵局名稱搜尋。';
    }, {timeout: 10000, maximumAge: 60000});
  };
  byId('clear-location').onclick = () => {
    scenicPosition = null;
    byId('clear-location').hidden = true;
    message.textContent = '已清除定位排序，可繼續使用名稱或年份查詢。';
    render();
  };
}

function officeDetails(name, office, historical = false) {
  const panel = element('div', '');
  panel.className = 'note';
  panel.append(element('strong', '設置局所地址'));
  if (!office) {
    panel.append(element('p', (officeState === 'loading' ? '正在載入局所地址…' : officeState === 'failed' ? '地址暫時無法載入，請重新整理或查看官方資料。' : '地址待核對，請查看官方資料。')));
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
    panel.append(element('p', (officeState === 'loading' ? '正在載入設置名單…' : officeState === 'failed' ? '設置名單暫時無法載入，請重新整理或查看官方設置地點。' : '設置名單尚待核對，請參考官方設置地點。')));
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
    officeDetails(record.office, scenicOffice(record), record.unlisted));
  if (scenic && scenicPosition) {
    const km = distanceKm(scenicPosition.latitude, scenicPosition.longitude, scenicOffice(record));
    body.append(element('p', '距你約 ' + km.toFixed(2) + ' 公里（直線）'));
  }
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
    image.decoding = 'async';
    image.width = 300;
    image.height = 150;
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
  const matches = sortNearPosition(records.filter(record =>
    (scenic || includeHistory || record.end_date >= today) &&
    (query || year || !record.unlisted) &&
    (!year || record.date.startsWith(year + '-')) &&
    normalize([record.title, record.office, scenicOffice(record)?.address].filter(Boolean).join(' ')).includes(query)));
  byId('result').hidden = true;
  currentMatches = matches;
  visibleCount = 24;
  byId('cards').replaceChildren(...matches.slice(0, visibleCount).map(card));
  more.hidden = visibleCount >= matches.length;
  if (!matches.length) byId('cards').append(element('p', '找不到符合條件的戳圖。'));
}

async function load() {
  byId('title').textContent = label;
  byId('history-filter').hidden = scenic;
  document.querySelector('nav a[href="catalog.html?type=' + type + '"]').setAttribute('aria-current', 'page');
  byId('intro').textContent = scenic
    ? '依名稱、使用局所或啟用年份查詢。實際提供情形請向郵局確認。'
    : '預設顯示尚未到使用迄日的紀念戳（含迄日當天）。搜尋名稱、選年份或勾選「顯示已過使用期限的紀念戳」可查舊紀錄。補蓋期限請參考官方公告。';
  try {
    const data = await readData('data/' + type + '.json');
    records = data.items;
    updatedAt = data.updated_at;
    byId('year').replaceChildren(element('option', '全部年份'));
    byId('year').firstChild.value = '';
    const years = new Set(records.map(record => record.date.slice(0, 4)));
    for (const year of [...years].sort().reverse()) {
      const option = element('option', year);
      option.value = year;
      byId('year').append(option);
    }
    byId('query').oninput = render;
    byId('year').onchange = render;
    byId('history').onchange = render;
    render();
  } catch (error) {
    byId('result').hidden = false;
    byId('result').textContent = '暫時無法載入' + label + '資料。';
    more.hidden = true;
    const retry = element('button', '重新載入清單');
    retry.type = 'button';
    retry.addEventListener('click', () => { retry.remove(); load(); });
    byId('cards').replaceChildren(retry);
    console.error(error);
  }
}
configureScenicLocation();
load();
loadOffices();




async function readData(path) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(path, {signal: controller.signal});
      if (!response.ok) throw Error(response.status);
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function loadOffices() {
  try {
    const data = await readData('data/offices.json');
    for (const placement of Object.values(data.commemorative)) {
      placement.offices = placement.office_names.map(name =>
        data.offices[normalize(name).replace(/\s/g, '')] || {name});
    }
    officeData = data;
    officeState = 'ready';
    if (scenic) {
      byId('locate-scenic').disabled = false;
      byId('location-status').textContent = '按「依我的位置找風景戳」，查看附近設置郵局的戳圖。';
    }
  } catch (error) {
    officeState = 'failed';
    if (scenic) byId('location-status').textContent = '地址資料暫時無法載入，請重新整理後再試定位。';
    console.error(error);
  }
  if (records.length) render();
}


