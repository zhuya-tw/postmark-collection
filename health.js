'use strict';
(async () => {
  const line = document.getElementById('data-health');
  if (!line) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('data/health.json', {signal: controller.signal});
    if (!response.ok) throw Error(response.status);
    const health = await response.json();
    const time = new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(health.checked_at));
    const count = new Set(health.issues.map(issue => issue.source + '/' + issue.id)).size;
    line.textContent = '最近檢查 ' + time + ' · ' +
      (health.status === 'retained' ? '部分來源更新未成功，保留上次可用資料，下次自動重試。'
        : count ? count + ' 筆資訊待核對，系統會持續重查。' : '資料檢查通過。');
  } catch {
    line.textContent = '檢查狀態暫時無法讀取，請參考各類資料的同步日期。';
  } finally {
    clearTimeout(timer);
  }
})();
