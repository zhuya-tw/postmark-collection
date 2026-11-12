'use strict';
(() => {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  const page = location.pathname.endsWith('catalog.html')
    ? new URLSearchParams(location.search).get('type') === 'scenic' ? 'scenic' : 'commemorative'
    : 'temporary';
  let visitor;
  try {
    visitor = localStorage.getItem('postmark-visitor-v1');
    if (!/^[a-f0-9]{32}$/.test(visitor || '')) {
      visitor = randomId();
      localStorage.setItem('postmark-visitor-v1', visitor);
    }
  } catch { visitor = randomId(); }
  const body = JSON.stringify({id: randomId(), visitor, page});
  let sent = false;
  async function record() {
    if (sent || document.visibilityState !== 'visible') return;
    sent = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch('https://postmark-admin.joas0123.workers.dev/api/view', {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body,
          credentials: 'omit', keepalive: true, signal: AbortSignal.timeout(8000)
        });
        if (response.ok || response.status < 500) return;
      } catch { /* Statistics must not interrupt the public catalog. */ }
    }
  }
  document.addEventListener('visibilitychange', record);
  record();
})();
