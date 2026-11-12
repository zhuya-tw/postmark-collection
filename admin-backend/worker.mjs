const PUBLIC_SITE = 'https://zhuya-tw.github.io/postmark-collection/';
const PUBLIC_ORIGIN = new URL(PUBLIC_SITE).origin;
const OWNER_ID = 353211348;
const PAGES = new Set(['temporary', 'commemorative', 'scenic']);
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function randomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(16).padStart(2, '0')).join('');
}

async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), n => n.toString(16).padStart(2, '0')).join('');
}

function cookie(request, name) {
  return (request.headers.get('Cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(name + '='))?.slice(name.length + 1) || '';
}

function setCookie(name, value, seconds) {
  return `${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, {status, headers: {'Cache-Control': 'private, no-store', ...headers}});
}

function redirect(path, cookies = []) {
  const headers = new Headers({Location: path, 'Cache-Control': 'no-store'});
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, {status: 302, headers});
}

async function readJson(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '缺少資料');
  let length = 0;
  const parts = [];
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new HttpError(413, '資料過大');
    }
    parts.push(value);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(joined)); }
  catch { throw new HttpError(400, '資料格式錯誤'); }
}

async function session(request, env) {
  const token = cookie(request, '__Host-pm_session');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires > ?')
    .bind(await digest(token), Date.now()).first();
}

async function requireOwner(request, env) {
  const current = await session(request, env);
  if (current?.user_id !== OWNER_ID) throw new HttpError(401, '請先以管理者帳號登入');
}

async function validReportToken(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token || !/^[a-f0-9]{64}$/.test(env.REPORT_TOKEN || '')) return false;
  const a = await digest(token), b = await digest(env.REPORT_TOKEN);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function login(request, env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new HttpError(503, '登入設定尚未完成');
  const state = randomHex(), verifier = randomHex();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)));
  const challenge = btoa(String.fromCharCode(...hash)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_flows WHERE expires < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO login_flows VALUES (?, ?, ?)').bind(await digest(state), verifier, Date.now() + 600000)
  ]);
  const target = new URL('https://github.com/login/oauth/authorize');
  for (const [key, value] of Object.entries({client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: new URL('/auth/callback', request.url).href, state,
    code_challenge: challenge, code_challenge_method: 'S256', scope: '', login: 'zhuya-tw'})) {
    target.searchParams.set(key, value);
  }
  return redirect(target.href, [setCookie('__Host-pm_flow', state, 600)]);
}

async function callback(request, env) {
  const url = new URL(request.url), state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !/^[a-f0-9]{64}$/.test(state) || cookie(request, '__Host-pm_flow') !== state || !code || code.length > 512) {
    throw new HttpError(400, '登入驗證已失效，請重新登入');
  }
  const flow = await env.DB.prepare('DELETE FROM login_flows WHERE state_hash = ? RETURNING verifier, expires')
    .bind(await digest(state)).first();
  if (!flow || flow.expires <= Date.now()) throw new HttpError(400, '登入驗證已失效，請重新登入');
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
    body: JSON.stringify({client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
      code, code_verifier: flow.verifier, redirect_uri: new URL('/auth/callback', request.url).href}),
    signal: AbortSignal.timeout(10000)
  });
  const access = await response.json();
  if (!response.ok || !access.access_token) throw new HttpError(401, 'GitHub 登入未完成，請重新登入');
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {Authorization: 'Bearer ' + access.access_token, Accept: 'application/vnd.github+json', 'User-Agent': 'Postmark-Admin'},
    signal: AbortSignal.timeout(10000)
  });
  const user = await userResponse.json();
  if (!userResponse.ok || user.id !== OWNER_ID) throw new HttpError(403, '目前登入帳號沒有管理權限');
  const token = randomHex();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO sessions VALUES (?, ?, ?)').bind(await digest(token), OWNER_ID, Date.now() + 8 * 3600000)
  ]);
  return redirect('/admin', [setCookie('__Host-pm_session', token, 28800), setCookie('__Host-pm_flow', '', 0)]);
}

async function recordView(request, env) {
  if (request.headers.get('Origin') !== PUBLIC_ORIGIN) throw new HttpError(403, '不允許的來源');
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw new HttpError(415, '資料格式錯誤');
  const event = await readJson(request, 1024);
  if (!/^[a-f0-9]{32}$/.test(event.id || '') || !/^[a-f0-9]{32}$/.test(event.visitor || '') || !PAGES.has(event.page)) {
    throw new HttpError(400, '資料格式錯誤');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts();
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.VISITOR_SALT), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(day + '/' + event.visitor));
  const visitorHash = Array.from(new Uint8Array(signed), n => n.toString(16).padStart(2, '0')).join('');
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM pageviews WHERE visitor_hash = ? AND created > ?')
    .bind(visitorHash, Date.now() - 60000).first();
  if (recent.n >= 30) throw new HttpError(429, '請稍後再試');
  await env.DB.prepare('INSERT OR IGNORE INTO pageviews VALUES (?, ?, ?, ?, ?)')
    .bind(event.id, day, event.page, visitorHash, Date.now()).run();
  return new Response(null, {status: 204, headers: {'Access-Control-Allow-Origin': PUBLIC_ORIGIN, Vary: 'Origin'}});
}

async function saveReport(request, env) {
  if (!await validReportToken(request, env)) throw new HttpError(401, '未授權');
  const value = await readJson(request, 100000);
  if (!value.health || !Number.isFinite(Date.parse(value.health.checked_at)) || !Array.isArray(value.health.issues)
    || !value.health.sources || !value.counts || !['ok', 'attention', 'retained'].includes(value.health.status)) {
    throw new HttpError(400, '檢查報告格式錯誤');
  }
  for (const name of ['stamps', 'commemorative', 'scenic']) {
    if (!Number.isSafeInteger(value.counts[name]) || value.counts[name] < 0) throw new HttpError(400, '筆數格式錯誤');
  }
  const time = new Date(value.health.checked_at).toISOString();
  await env.DB.prepare('INSERT INTO reports VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at, payload=excluded.payload WHERE excluded.checked_at >= reports.checked_at')
    .bind(time, JSON.stringify(value)).run();
  return json({saved: true});
}

async function dashboardData(env) {
  const start = new Date(Date.now() - 6 * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(start);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const firstDay = `${values.year}-${values.month}-${values.day}`;
  const results = await env.DB.batch([
    env.DB.prepare('SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors FROM pageviews WHERE day >= ? GROUP BY day ORDER BY day DESC').bind(firstDay),
    env.DB.prepare('SELECT payload FROM reports WHERE id=1')
  ]);
  return {days: results[0].results, report: results[1].results[0] ? JSON.parse(results[1].results[0].payload) : null};
}

function adminPage() {
  const nonce = randomHex(16);
  const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>郵戳慢慢集｜管理</title>
<style>body{margin:0;background:#f9f6ef;color:#233c4d;font:16px/1.7 "Microsoft JhengHei",sans-serif}header{background:#233c4d;color:white;padding:24px}main{max-width:1000px;margin:auto;padding:24px}a{color:#277086}button{font:inherit;padding:8px 16px;cursor:pointer}.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.tile,section{padding:20px;border:1px solid #e6dfd1;background:white;border-radius:12px;margin-bottom:20px}.tile strong{display:block;font-size:28px}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #ddd}.scroll{overflow-x:auto}#issues p{margin:8px 0}nav{display:flex;justify-content:space-between;gap:12px}@media(max-width:600px){main{padding:16px}.tiles{grid-template-columns:1fr}.tile{margin:0}table{font-size:14px}}</style>
<header><h1>郵戳慢慢集｜管理</h1></header><main><nav><a href="${PUBLIC_SITE}">返回郵戳網站</a><button id="logout">登出</button></nav><p id="status" role="status">正在讀取管理資訊…</p><div class="tiles" id="tiles"></div><section><h2>最近 7 天流量</h2><p>匿名訪客依瀏覽器識別計算，同一人在不同裝置會分開計數。數字從本功能啟用後累計。</p><div class="scroll"><table><thead><tr><th>日期（台灣）</th><th>瀏覽次數</th><th>匿名訪客</th></tr></thead><tbody id="traffic"></tbody></table></div></section><section><h2>資料檢查</h2><p id="checked"></p><div id="counts"></div><div id="sources"></div><div id="issues"></div></section></main>
<script nonce="${nonce}">
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
document.getElementById('logout').onclick=async()=>{await fetch('/auth/logout',{method:'POST'});location.href='${PUBLIC_SITE}'};
(async()=>{try{const r=await fetch('/api/dashboard',{cache:'no-store'});if(r.status===401){location.href='/auth/login';return}if(!r.ok)throw Error();const d=await r.json();document.getElementById('status').textContent='已以 zhuya-tw 登入';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const current=d.days.find(x=>x.day===today)||{views:0,visitors:0};
for(const [title,value] of [['今日瀏覽次數',current.views],['今日匿名訪客',current.visitors],['近 7 天瀏覽次數',d.days.reduce((a,x)=>a+x.views,0)]]){const tile=node('div',title);tile.className='tile';tile.append(node('strong',String(value)));document.getElementById('tiles').append(tile)}
for(const x of d.days){const row=node('tr','');row.append(node('td',x.day),node('td',x.views),node('td',x.visitors));document.getElementById('traffic').append(row)}
if(!d.report){document.getElementById('checked').textContent='尚未收到自動更新報告。';return}
const h=d.report.health;document.getElementById('checked').textContent='最近檢查 '+new Date(h.checked_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'});
document.getElementById('counts').textContent='臨時郵局 '+d.report.counts.stamps+' 筆 · 紀念戳 '+d.report.counts.commemorative+' 筆 · 風景戳 '+d.report.counts.scenic+' 筆';
for(const [name,x] of Object.entries(h.sources)){document.getElementById('sources').append(node('p',name+'：'+(x.status==='ok'?'同步成功':'保留上次資料')+'，嘗試 '+x.attempts+' 次'))}
const kinds={'missing-image':'缺少戳圖','missing-mailing-information':'收件資訊待核對','recipient-contains-address':'收件人與地址待拆分','missing-office-address':'設置局所地址待核對','unverified-placement-list':'設置名單待核對'};
for(const x of h.issues){document.getElementById('issues').append(node('p',x.title+' · '+(kinds[x.kind]||'資料待核對')))}
if(!h.issues.length)document.getElementById('issues').textContent='本次資料檢查通過。';
}catch{document.getElementById('status').textContent='管理資訊暫時無法讀取，請重新整理。'}})();
</script></html>`;
  return new Response(html, {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'}});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    try {
      if (!env.DB) throw new HttpError(503, '管理服務設定中');
      if (path === '/auth/login' && request.method === 'GET') return await login(request, env);
      if (path === '/auth/callback' && request.method === 'GET') return await callback(request, env);
      if (path === '/api/view' && request.method === 'OPTIONS') {
        if (request.headers.get('Origin') !== PUBLIC_ORIGIN) throw new HttpError(403, '不允許的來源');
        return new Response(null, {status: 204, headers: {'Access-Control-Allow-Origin': PUBLIC_ORIGIN,
          'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin', 'Access-Control-Max-Age': '3600'}});
      }
      if (path === '/api/view' && request.method === 'POST') {
        if (!env.VISITOR_SALT) throw new HttpError(503, '統計設定中');
        return await recordView(request, env);
      }
      if (path === '/api/report' && request.method === 'POST') return await saveReport(request, env);
      if (path === '/' || path === '/admin' || path === '/api/dashboard' || path === '/auth/logout') {
        await requireOwner(request, env);
        if (path === '/auth/logout' && request.method === 'POST') {
          if (request.headers.get('Origin') !== url.origin) throw new HttpError(403, '不允許的來源');
          await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(cookie(request, '__Host-pm_session'))).run();
          return json({loggedOut: true}, 200, {'Set-Cookie': setCookie('__Host-pm_session', '', 0)});
        }
        if (request.method !== 'GET') throw new HttpError(405, '不支援的方法');
        if (path === '/api/dashboard') return json(await dashboardData(env));
        if (path === '/' || path === '/admin') return adminPage();
      }
      throw new HttpError(404, '找不到頁面');
    } catch (error) {
      if (error.status === 401 && (path === '/admin' || path === '/') && request.method === 'GET') return redirect('/auth/login');
      return json({error: error instanceof HttpError ? error.message : '服務暫時無法使用'}, error.status || 503);
    }
  },
  async scheduled(event, env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM login_flows WHERE expires < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM pageviews WHERE created < ?').bind(Date.now() - 90 * 86400000)
    ]);
  }
};
