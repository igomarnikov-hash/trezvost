/* Service worker: офлайн-режим + фоновая проверка юбилеев */
const VERSION = 'v1.2.0';
const CORE = ['./', 'index.html', 'styles.css', 'app.js', 'groups-data.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open('core-' + VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('core-') && k !== 'core-' + VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // свои файлы: сначала кэш, затем обновляем в фоне
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(r => { if (r.ok) caches.open('core-' + VERSION).then(c => c.put(e.request, r.clone())); return r; }).catch(() => hit || caches.match('index.html'));
      return hit || net;
    }));
    return;
  }
  // шрифты Google: кэшируем
  if (/fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.open('fonts').then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }))));
  }
});

/* --- юбилеи (логика продублирована из app.js) --- */
const DAY = 86400000;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addMonths = (d, n) => { const r = new Date(d); const day = r.getDate(); r.setDate(1); r.setMonth(r.getMonth() + n); r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate())); return r; };
function list(start) {
  const L = [[1, 'Первые 24 часа'], [7, 'Первая неделя'], [30, '30 дней'], [60, '60 дней'], [90, '90 дней'], [100, '100 дней'], [500, '500 дней'], [1000, '1000 дней']].map(([n, t]) => [new Date(+start + n * DAY), t]);
  [[6, 'Полгода'], [9, '9 месяцев'], [12, '1 год трезвости'], [18, 'Полтора года']].forEach(([m, t]) => L.push([addMonths(start, m), t]));
  for (let y = 2; y <= 50; y++) L.push([addMonths(start, 12 * y), y + ' лет трезвости']);
  return L;
}
async function check() {
  try {
    const c = await caches.open('sober-state'); const r = await c.match('/__state'); if (!r) return;
    const s = await r.json(); if (!s.notify || !s.start) return;
    const [y, m, d] = s.start.split('-').map(Number); const start = new Date(y, m - 1, d);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const tom = new Date(+t + DAY);
    const hit = list(start).find(([dt]) => ymd(dt) === ymd(t));
    const next = list(start).find(([dt]) => ymd(dt) === ymd(tom));
    const flag = await c.match('/__notified'); const last = flag ? await flag.text() : '';
    if (last === ymd(t)) return;
    if (hit) await self.registration.showNotification('Сегодня юбилей! 🏅', { body: hit[1] + '. Поздравляем!', icon: 'icons/icon-192.png', tag: 'ms' });
    else if (next) await self.registration.showNotification('Завтра юбилей ✨', { body: next[1] + ' — уже завтра!', icon: 'icons/icon-192.png', tag: 'ms' });
    else return;
    await c.put('/__notified', new Response(ymd(t)));
  } catch {}
}
self.addEventListener('periodicsync', e => { if (e.tag === 'milestone-check') e.waitUntil(check()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
