/* Шаг за шагом — PWA для трезвости. Все данные хранятся локально. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const DAY = 86400000;

/* ---------- хранилище ---------- */
const KEY = 'sobriety-app-v1';
const defaults = { name: '', start: '', money: 0, theme: 'dark', entries: {}, groups: [], fav: [], book: {}, notify: false, lastNotified: '' };
let S;
try { S = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { S = { ...defaults }; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} syncSWState(); };

/* ---------- утилиты дат ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysBetween = (a, b) => Math.round((b - a) / DAY);
const addMonths = (d, n) => { const r = new Date(d); const day = r.getDate(); r.setDate(1); r.setMonth(r.getMonth() + n); r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate())); return r; };
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_N = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const fmtDate = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; };
const W = { d: ['день','дня','дней'], m: ['месяц','месяца','месяцев'], y: ['год','года','лет'], h: ['час','часа','часов'] };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function ymdDiff(a, b) { // полные годы/месяцы/дни между датами
  let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
  if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d };
}

/* ---------- юбилеи ---------- */
function milestones(start) {
  const L = [];
  const add = (date, title, ico, big) => L.push({ date, title, ico, big: !!big });
  add(new Date(+start + DAY), 'Первые 24 часа', '🌅');
  add(new Date(+start + 7 * DAY), 'Первая неделя', '✨');
  add(new Date(+start + 30 * DAY), '30 дней', '🥉');
  add(new Date(+start + 60 * DAY), '60 дней', '🌿');
  add(new Date(+start + 90 * DAY), '90 дней — «90 на 90»', '🥈', true);
  add(addMonths(start, 6), 'Полгода', '🌗', true);
  add(addMonths(start, 9), '9 месяцев', '🌳');
  add(addMonths(start, 12), '1 год трезвости', '🏅', true);
  add(addMonths(start, 18), 'Полтора года', '🌄');
  for (let y = 2; y <= 50; y++) add(addMonths(start, 12 * y), `${y} ${plural(y, W.y)} трезвости`, y % 5 === 0 ? '🏆' : '🎖️', true);
  [100, 200, 300, 365, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000].forEach(n => {
    if (n === 365) return;
    add(new Date(+start + n * DAY), `${n.toLocaleString('ru-RU')} дней`, n >= 1000 ? '💎' : '💯');
  });
  // убрать совпадения по дате (оставляем более «значимый»)
  L.sort((a, b) => a.date - b.date || b.big - a.big);
  return L.filter((x, i) => i === 0 || ymd(x.date) !== ymd(L[i - 1].date));
}

/* ---------- навигация ---------- */
$$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.s)));
function go(id) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.s === id));
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  $('#screenTitle').textContent = $(`.tab[data-s="${id}"]`).dataset.t;
  try { history.replaceState(null, '', '#' + id.slice(2)); } catch {}
  window.scrollTo({ top: 0 });
  if (id === 's-diary') renderDiary();
  if (id === 's-groups') renderGroups();
  if (id === 's-settings') fillSettings();
}

/* ---------- тема ---------- */
const applyTheme = () => document.documentElement.classList.toggle('light', S.theme === 'light');
$('#themeBtn').onclick = () => { S.theme = S.theme === 'light' ? 'dark' : 'light'; applyTheme(); save(); };
applyTheme();

/* ---------- toast / modal / confetti ---------- */
let tT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => t.classList.remove('show'), 2600); }
function modal(title, bodyHTML, buttons) {
  $('#mTitle').textContent = title; $('#mBody').innerHTML = bodyHTML;
  const box = $('#mBtns'); box.innerHTML = '';
  buttons.forEach(b => { const el = document.createElement('button'); el.className = 'btn ' + (b.cls || 'ghost'); el.textContent = b.text; el.onclick = () => { if (b.onClick && b.onClick() === false) return; closeModal(); }; box.appendChild(el); });
  $('#modal').classList.remove('hidden');
}
const closeModal = () => $('#modal').classList.add('hidden');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function confetti() {
  const box = $('#confetti'); const cols = ['#5eead4', '#818cf8', '#fbbf24', '#f472b6', '#34d399'];
  for (let i = 0; i < 80; i++) { const c = document.createElement('i'); c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length]; c.style.animationDuration = 2 + Math.random() * 2.5 + 's'; c.style.animationDelay = Math.random() * .6 + 's'; box.appendChild(c); }
  setTimeout(() => box.innerHTML = '', 5200);
}

/* ================= СРОК ================= */
$('#obDate').max = ymd(new Date());
$('#obSave').onclick = () => {
  const v = $('#obDate').value; if (!v) return toast('Выберите дату');
  if (parseYmd(v) > today0()) return toast('Дата не может быть в будущем');
  S.start = v; S.name = $('#obName').value.trim(); save(); renderSober(); confetti();
};

function renderSober() {
  const has = !!S.start;
  $('#onboard').classList.toggle('hidden', has);
  $('#soberView').classList.toggle('hidden', !has);
  if (!has) return;
  const start = parseYmd(S.start), t0 = today0();
  const days = daysBetween(start, t0);
  $('#daysBig').textContent = days.toLocaleString('ru-RU');
  $('#daysUnit').textContent = plural(days, W.d) + ' трезвости';
  $('#hello').textContent = (S.name ? S.name + ', ' : '') + (days === 0 ? 'сегодня ваш первый день. Только сегодня 💙' : 'вы молодец. Только сегодня 💙');
  const { y, m, d } = ymdDiff(start, t0);
  $('#breakdown').innerHTML = [[y, W.y], [m, W.m], [d, W.d]].map(([n, f]) => `<div><b>${n}</b><span>${plural(n, f)}</span></div>`).join('');

  const ms = milestones(start);
  const next = ms.find(x => x.date > t0);
  const prev = [...ms].reverse().find(x => x.date <= t0);
  const from = prev ? prev.date : start;
  if (next) {
    const left = daysBetween(t0, next.date);
    $('#nextTitle').textContent = next.ico + ' ' + next.title;
    $('#nextDate').textContent = fmtDate(next.date);
    $('#nextLeft').textContent = left === 1 ? 'завтра!' : `через ${left} ${plural(left, W.d)}`;
    const pct = Math.max(0, Math.min(1, (t0 - from) / (next.date - from)));
    $('#nextBar').style.width = (pct * 100).toFixed(1) + '%';
    $('#ringFg').style.strokeDashoffset = (603 * (1 - Math.max(.02, pct))).toFixed(1);
  }
  const todays = ms.filter(x => ymd(x.date) === ymd(t0));
  const ann = $('#annivToday');
  if (todays.length) {
    ann.innerHTML = `<div class="medal">${todays[0].ico}</div><div><div class="label">Сегодня юбилей!</div><div class="next-title">${esc(todays[0].title)}</div><div class="muted small">Поделитесь радостью на собрании — вы заслужили медаль.</div></div>`;
    ann.classList.remove('hidden');
    const k = 'conf-' + ymd(t0); if (!sessionStorage.getItem(k)) { try { sessionStorage.setItem(k, 1); } catch {} setTimeout(confetti, 500); }
  } else ann.classList.add('hidden');

  $('#meetCount').textContent = Object.values(S.entries).filter(e => e.meeting).length;
  tick();
}
function tick() {
  if (!S.start) return;
  const ms = Date.now() - parseYmd(S.start);
  const h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60;
  $('#ticker').textContent = `${h.toLocaleString('ru-RU')} ${plural(h, W.h)} · ${pad(mi)}:${pad(se)}`;
}
setInterval(tick, 1000);
let lastDay = ymd(new Date());
setInterval(() => { if (ymd(new Date()) !== lastDay) { lastDay = ymd(new Date()); renderSober(); } }, 30000);


/* --- календарь .ics --- */
$('#icsBtn').onclick = () => {
  const start = parseYmd(S.start), t0 = today0();
  const list = milestones(start).filter(x => x.date >= t0).slice(0, 40);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const d8 = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shag za shagom//RU', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Юбилеи трезвости'];
  list.forEach((x, i) => {
    const e = new Date(+x.date + DAY);
    lines.push('BEGIN:VEVENT', `UID:sober-${S.start}-${i}@shagzashagom`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(x.date)}`, `DTEND;VALUE=DATE:${d8(e)}`,
      `SUMMARY:${x.ico} ${x.title}`, 'DESCRIPTION:Юбилей трезвости. Только сегодня!',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Завтра юбилей трезвости', 'TRIGGER:-PT15H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Сегодня юбилей трезвости!', 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  download('yubilei-trezvosti.ics', lines.join('\r\n'), 'text/calendar');
  toast('Откройте файл — юбилеи добавятся в календарь');
};
function download(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch { toast('Скачивание недоступно в этом окне'); }
}

/* --- уведомления --- */
$('#notifBtn').onclick = async () => {
  if (!('Notification' in window)) return toast('Уведомления не поддерживаются. Используйте календарь.');
  const p = await Notification.requestPermission().catch(() => 'denied');
  if (p !== 'granted') return toast('Разрешение не выдано');
  S.notify = true; save();
  if (navigator.serviceWorker && 'periodicSync' in (await navigator.serviceWorker.ready.catch(() => ({})))) {
    try { const r = await navigator.serviceWorker.ready; await r.periodicSync.register('milestone-check', { minInterval: 12 * 3600 * 1000 }); } catch {}
  }
  toast('Готово! Напомним о юбилеях при открытии приложения');
  checkNotify(true);
};
async function checkNotify(force) {
  if (!S.notify || !S.start || !('Notification' in window) || Notification.permission !== 'granted') return;
  const t0 = today0(), key = ymd(t0);
  if (!force && S.lastNotified === key) return;
  const ms = milestones(parseYmd(S.start));
  const todayM = ms.find(x => ymd(x.date) === key);
  const tomorrowM = ms.find(x => ymd(x.date) === ymd(new Date(+t0 + DAY)));
  const m = todayM ? ['Сегодня юбилей! ' + todayM.ico, todayM.title + '. Поздравляем!'] : tomorrowM ? ['Завтра юбилей ' + tomorrowM.ico, tomorrowM.title + ' — уже завтра!'] : null;
  if (!m) return;
  S.lastNotified = key; save();
  try { const r = await navigator.serviceWorker.ready; r.showNotification(m[0], { body: m[1], icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'ms-' + key }); }
  catch { try { new Notification(m[0], { body: m[1] }); } catch {} }
}
// передаём дату сервис-воркеру через Cache API (для фоновой проверки)
async function syncSWState() {
  try { const c = await caches.open('sober-state'); await c.put('/__state', new Response(JSON.stringify({ start: S.start, notify: S.notify }))); } catch {}
}

/* ================= ЕЖЕДНЕВНИК ================= */
let selDay = ymd(new Date());
let mood = 0;
const WD = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const mmdd = k => k.slice(5);
$$('#moods button').forEach(b => b.onclick = () => { mood = +b.dataset.v; $$('#moods button').forEach(x => x.classList.toggle('on', x === b)); });
$('#craving').oninput = e => $('#cravingVal').textContent = e.target.value;
const shiftDay = n => { const d = parseYmd(selDay); d.setDate(d.getDate() + n); selDay = ymd(d); renderDiary(); };
$('#dayPrev').onclick = () => shiftDay(-1);
$('#dayNext').onclick = () => shiftDay(1);
$('#todayBtn').onclick = () => { selDay = ymd(new Date()); renderDiary(); };

function renderDiary() { renderReading(); loadEntry(selDay); renderRecent(); }

function renderReading() {
  const d = parseYmd(selDay), isToday = selDay === ymd(new Date());
  $('#readDate').textContent = `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WD[d.getDay()]}`;
  $('#todayBtn').classList.toggle('hidden', isToday);
  const book = S.book || {}, n = Object.keys(book).length, r = book[mmdd(selDay)];
  const body = $('#readBody');
  if (r) {
    const paras = String(r.x || '').split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
    body.innerHTML = `${r.t ? `<h2 class="read-title">${esc(r.t)}</h2>` : ''}
      ${r.q ? `<blockquote>${esc(r.q).replace(/\n/g, '<br>')}</blockquote>` : ''}
      ${r.s ? `<div class="read-src">${esc(r.s)}</div>` : ''}
      <div class="read-text">${paras}</div>
      <div class="btn-row"><button class="btn ghost small" id="rCopy">⧉ Копировать</button></div>`;
    $('#rCopy').onclick = async () => { try { await navigator.clipboard.writeText([r.t, r.q, r.s, r.x].filter(Boolean).join('\n\n')); toast('Скопировано'); } catch { toast('Не удалось скопировать'); } };
  } else if (!n) {
    body.innerHTML = `<div class="read-empty">
      <div class="hero-emoji">📖</div>
      <h3>Книга ещё не загружена</h3>
      <p class="muted small">Загрузите PDF «Ежедневных размышлений» один раз в разделе «Ещё» — и здесь каждый день будет открываться текст на сегодняшнюю дату.</p>
      <button class="btn primary" id="rGo">Загрузить книгу</button>
    </div>`;
    $('#rGo').onclick = () => go('s-settings');
  } else {
    body.innerHTML = `<div class="read-empty"><p class="muted">Для этой даты текст в книге не найден.</p></div>`;
  }

}

const MONTH_RE = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
function monthIdx(w) { w = w.toLowerCase(); return MONTH_RE.findIndex(m => new RegExp('^' + m).test(w)); }
function parseBookText(txt) {
  const lines = txt.replace(/\r/g, '').split('\n');
  const head = /^\s*(\d{1,2})\s+([А-Яа-яЁё]+)\.?\s*$/;
  const out = {}; let cur = null, buf = [];
  const flush = () => {
    if (!cur) return;
    const L = buf.map(s => s.trim());
    while (L.length && !L[0]) L.shift();
    const t = L.shift() || '';
    const rest = L.join('\n').trim().split('\n');
    const si = rest.findIndex(l => /(\bс\.|стр\.)\s*\d+|^[«"]?[А-ЯЁ0-9 ,.«»"\-–]{8,}[,]\s*(с\.|стр\.)/.test(l.trim()));
    let q = '', s = '', x;
    if (si >= 0 && si < 12) { q = rest.slice(0, si).join('\n').trim(); s = rest[si].trim(); x = rest.slice(si + 1).join('\n').trim(); }
    else x = rest.join('\n').trim();
    out[cur] = { t, q, s, x };
  };
  for (const line of lines) {
    const m = line.match(head);
    if (m && monthIdx(m[2]) >= 0 && +m[1] >= 1 && +m[1] <= 31) { flush(); cur = `${pad(monthIdx(m[2]) + 1)}-${pad(+m[1])}`; buf = []; }
    else if (cur) buf.push(line);
  }
  flush();
  return out;
}
function parseBookJSON(j) {
  const out = {};
  const keyOf = k => { k = String(k).trim(); let m = k.match(/^(\d{1,2})[-.\/](\d{1,2})$/); if (m) return `${pad(+m[1])}-${pad(+m[2])}`; m = k.match(/^(\d{1,2})\s+([А-Яа-яЁё]+)/); if (m && monthIdx(m[2]) >= 0) return `${pad(monthIdx(m[2]) + 1)}-${pad(+m[1])}`; return null; };
  const put = (k, v) => { const key = keyOf(k); if (!key || !v) return; out[key] = typeof v === 'string' ? { t: '', q: '', s: '', x: v } : { t: v.t || v.title || '', q: v.q || v.quote || '', s: v.s || v.source || '', x: v.x || v.text || v.body || '' }; };
  if (Array.isArray(j)) j.forEach(v => put(v.date || v.day || v.key, v)); else Object.entries(j).forEach(([k, v]) => put(k, v));
  return out;
}

/* --- PDF: чтение книги на устройстве --- */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
async function loadPdfJs() {
  if (window.pdfjsLib) return;
  await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = PDFJS + 'pdf.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
}
async function pdfPages(file, onProgress) {
  await loadPdfJs();
  const doc = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    const lines = []; let cur = '', lastY = null, right = 0;
    const push = () => { if (cur.trim()) lines.push({ t: cur.trim(), r: right }); cur = ''; };
    for (const it of tc.items) {
      const y = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3 && cur.trim()) push();
      cur += it.str; if (y !== null) lastY = y;
      if (it.str.trim() && it.transform) right = it.transform[4] + (it.width || 0);
      if (it.hasEOL) push();
    }
    push();
    // перенос слова: строка заканчивается буквой и чуть короче полной ширины (знак переноса не попал в текст)
    const maxR = Math.max(0, ...lines.map(l => l.r));
    pages.push(lines.map(l => (/[а-яё]$/.test(l.t) && maxR - l.r > 1.5 && maxR - l.r < 9) ? l.t + '\u00AD' : l.t));
    if (onProgress && i % 10 === 0) onProgress(i, doc.numPages);
  }
  return pages;
}
const HEAD_RE = new RegExp('^([\\dип]{1,2})(' + MONTH_RE.join('|') + ')[а-яё]*$');
function dateHead(line) {
  const t = line.replace(/[\s\u00AD]+/g, '').toLowerCase();
  if (t.length > 16) return null;
  const m = t.match(HEAD_RE); if (!m) return null;
  let d = m[1]; d = /^[ип]+$/.test(d) ? '11' : d.replace(/[ип]/g, '1');
  if (!/^\d+$/.test(d) || +d < 1 || +d > 31) return null;
  return `${pad(monthIdx(m[2]) + 1)}-${pad(+d)}`;
}
const isCaps = l => { const letters = l.replace(/[^А-ЯЁа-яёA-Za-z]/g, ''); return letters.length > 2 && letters === letters.toUpperCase(); };
const endsSentence = l => /[.!?»…"“”]\s*$/.test(l);
function joinLines(L) {
  const lens = L.map(l => l.length).sort((a, b) => a - b), med = lens[Math.floor(lens.length * .75)] || 50;
  let out = '';
  L.forEach((l, i) => {
    if (i === 0) { out = l; return; }
    const prev = L[i - 1];
    if (/[­]$/.test(out) || /[а-яё]-$/.test(out) && /^[а-яё]/.test(l)) out = out.replace(/[­-]$/, '') + l;
    else if (endsSentence(prev) && prev.length < med * .8) out += '\n' + l;
    else out += ' ' + l;
  });
  return out.replace(/­/g, '').replace(/ {2,}/g, ' ').trim();
}
function parseEntry(lines) {
  const L = lines.filter(l => !/^\d{1,3}$/.test(l.trim()));
  let i = 0; const title = [];
  while (i < L.length && isCaps(L[i]) && title.length < 3) title.push(L[i++]);
  const body = L.slice(i);
  let eng = body.findIndex((l, k) => k < 30 && /\bp{1,2}\.\s*\d+/.test(l));
  let ruEnd = eng >= 0 ? eng - 1 : body.findIndex((l, k) => k < 30 && /с\.\s*\d+\s*$/.test(l));
  let q = '', s = '', xStart = 0;
  if (ruEnd >= 0) {
    let st = ruEnd;
    while (st - 1 >= 0 && (!endsSentence(body[st - 1]) || /с\.\s*\d+\s*$/.test(body[st - 1]))) st--;
    if (st === 0) st = ruEnd; // не нашли конец цитаты — источник одной строкой
    q = joinLines(body.slice(0, st)); s = body.slice(st, ruEnd + 1).join(' ').replace(/\s+/g, ' ');
    xStart = (eng >= 0 ? eng : ruEnd) + 1;
    while (xStart < body.length && /^(p{1,2}\.)?\s*\d+\s*$/.test(body[xStart])) xStart++;
  }
  return { t: title.join(' ').replace(/\s+/g, ' '), q, s, x: joinLines(body.slice(xStart)) };
}
function parseBookPages(pages) {
  const out = {}; let key = null, buf = [];
  const flush = () => { if (key && buf.length && !out[key]) out[key] = parseEntry(buf); };
  for (const lines of pages) {
    const k = lines.length ? dateHead(lines[0]) : null;
    if (k) { flush(); key = k; buf = lines.slice(1); }
    else if (key) buf.push(...lines);
  }
  flush();
  return out;
}
async function importBook(e) {
  const file = e.file || e.target.files[0]; if (!file) return;
  const st = $('#bookStatus');
  try {
    let book;
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      st.innerHTML = '<span class="spinner"></span> Открываю PDF…';
      const pages = await pdfPages(file, (i, n) => st.innerHTML = `<span class="spinner"></span> Читаю страницы: ${i} из ${n}`);
      book = parseBookPages(pages);
    } else {
      const txt = await file.text();
      book = /\.json$/i.test(file.name) || /^\s*[\[{]/.test(txt) ? parseBookJSON(JSON.parse(txt)) : parseBookText(txt);
    }
    const n = Object.keys(book).length;
    if (!n) { renderBookStatus(); return toast('В файле не нашлось дат вида «11 НОЯБРЯ»'); }
    S.book = book; save(); renderBookStatus(); renderReading();
    toast(`Книга загружена: ${n} ${plural(n, ['дата', 'даты', 'дат'])}`);
  } catch (err) { renderBookStatus(); toast('Не удалось прочитать файл. Нужен интернет для первого открытия PDF.'); }
  if (e.target) e.target.value = '';
}
function renderBookStatus() {
  const n = Object.keys(S.book || {}).length;
  $('#bookStatus').textContent = n ? `Загружено: ${n} ${plural(n, ['дата', 'даты', 'дат'])} из 366` : 'Книга не загружена';
  $('#bookDel').classList.toggle('hidden', !n);
  $('#bookPick').textContent = n ? 'Заменить файл' : '📥 Выбрать PDF';
}
$('#bookFile').onchange = importBook;
$('#bookUrlBtn').onclick = async () => {
  const url = $('#bookUrl').value.trim();
  if (!/^https?:\/\//.test(url)) return toast('Вставьте ссылку, начинающуюся с https://');
  $('#bookStatus').innerHTML = '<span class="spinner"></span> Скачиваю книгу…';
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const name = /\.json(\?|$)/i.test(url) ? 'book.json' : /\.txt(\?|$)/i.test(url) ? 'book.txt' : 'book.pdf';
    const file = new File([blob], name, { type: name.endsWith('.pdf') ? 'application/pdf' : blob.type });
    await importBook({ file });
    $('#bookUrl').value = '';
  } catch (err) {
    renderBookStatus();
    toast('Не удалось скачать файл по ссылке. Сервер должен разрешать загрузку с других сайтов (CORS).');
  }
};
$('#bookDel').onclick = () => modal('Удалить книгу с устройства?', '<p class="muted">Текст «Ежедневных размышлений» будет удалён из приложения. Ваши записи останутся.</p>', [
  { text: 'Отмена' }, { text: 'Удалить', cls: 'primary', onClick: () => { S.book = {}; save(); renderBookStatus(); renderReading(); } }]);

function loadEntry(k) {
  const e = S.entries[k] || {};
  const d = parseYmd(k);
  if (S.start && d >= parseYmd(S.start)) { const n = daysBetween(parseYmd(S.start), d); $('#entryDay').textContent = `день ${n}`; $('#entryDay').classList.remove('hidden'); }
  else $('#entryDay').classList.add('hidden');
  mood = e.mood || 0; $$('#moods button').forEach(x => x.classList.toggle('on', +x.dataset.v === mood));
  $('#craving').value = e.craving || 0; $('#cravingVal').textContent = e.craving || 0;
  $('#eMeeting').checked = !!e.meeting; $('#eSponsor').checked = !!e.sponsor; $('#eReading').checked = !!e.reading;
  $('#eGrat').value = e.grat || ''; $('#eNote').value = e.note || '';
  $('#eS1').value = e.s1 || ''; $('#eS2').value = e.s2 || ''; $('#eS3').value = e.s3 || '';
  $('#eDel').classList.toggle('hidden', !S.entries[k]);
}
$('#eSave').onclick = () => {
  if (parseYmd(selDay) > today0()) return toast('Этот день ещё не наступил');
  const e = { mood, craving: +$('#craving').value, meeting: $('#eMeeting').checked, sponsor: $('#eSponsor').checked, reading: $('#eReading').checked,
    grat: $('#eGrat').value.trim(), note: $('#eNote').value.trim(), s1: $('#eS1').value.trim(), s2: $('#eS2').value.trim(), s3: $('#eS3').value.trim(), ts: Date.now() };
  S.entries[selDay] = e; save(); renderRecent(); $('#eDel').classList.remove('hidden');
  toast(e.craving >= 7 ? 'Сохранено. Тяга сильная — позвоните кому-нибудь из группы 💙' : 'Запись сохранена ✓');
  renderSober();
};
$('#eDel').onclick = () => modal('Удалить запись?', '<p class="muted">Ваша запись за этот день будет удалена без возможности восстановления.</p>', [
  { text: 'Отмена' }, { text: 'Удалить', cls: 'primary', onClick: () => { delete S.entries[selDay]; save(); loadEntry(selDay); renderRecent(); renderSober(); } }]);
function renderRecent() {
  const keys = Object.keys(S.entries).sort().reverse().slice(0, 10);
  const em = ['📝', '😣', '😕', '😐', '🙂', '😄'];
  $('#recent').innerHTML = keys.length ? keys.map(k => {
    const e = S.entries[k];
    const txt = e.note || e.grat || [e.meeting && 'собрание', e.sponsor && 'звонок', e.reading && 'литература'].filter(Boolean).join(', ') || 'без заметок';
    return `<li data-k="${k}"><div class="em">${em[e.mood || 0]}</div><div><div class="ed">${fmtDate(parseYmd(k))}${e.meeting ? ' · 🤝' : ''}${e.craving ? ' · тяга ' + e.craving : ''}</div><div class="et">${esc(txt)}</div></div></li>`;
  }).join('') : '<li class="muted small">Пока нет записей. Начните с сегодняшнего дня.</li>';
  $$('#recent li[data-k]').forEach(li => li.onclick = () => { selDay = li.dataset.k; renderDiary(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

/* ================= ГРУППЫ ================= */
const DAYS7 = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const GROUPS = (window.AA_GROUPS_RAW || '').split('\n').filter(Boolean).map(line => {
  const [n, u, c, m, a, p, la, lo, sc, on] = line.split('|');
  const sch = {}; (sc || '').split(';').filter(Boolean).forEach(x => { const [d, t] = x.split(' '); sch[d] = (t || '').split(',').filter(Boolean); });
  return { n, u, c, m, a, p, la: la ? +la : null, lo: lo ? +lo : null, sch, online: on === '1', q: (n + ' ' + c + ' ' + m + ' ' + a).toLowerCase() };
});
$('#gDate').textContent = window.AA_GROUPS_DATE || '';
let gFilter = 'all', gQuery = '', gShown = 25, myPos = null;
S.fav = S.fav || [];
const todayDow = () => DAYS7[(new Date().getDay() + 6) % 7];
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const tMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const status = h => $('#locStatus').innerHTML = h;

$$('#gFilter button').forEach(b => b.onclick = () => { gFilter = b.dataset.f; gShown = 25; $$('#gFilter button').forEach(x => x.classList.toggle('on', x === b)); renderGroups(); });
let qT; $('#gSearch').oninput = e => { clearTimeout(qT); qT = setTimeout(() => { gQuery = e.target.value.trim().toLowerCase(); gShown = 25; renderGroups(); }, 150); };
$('#moreBtn').onclick = () => { gShown += 25; renderGroups(); };

$('#locBtn').onclick = () => {
  if (!navigator.geolocation) return status('Геолокация недоступна на этом устройстве — воспользуйтесь поиском по метро или адресу.');
  status('<span class="spinner"></span> Определяем местоположение…');
  navigator.geolocation.getCurrentPosition(p => {
    myPos = { lat: p.coords.latitude, lon: p.coords.longitude };
    gShown = 25; renderGroups(); renderMyGroups();
    const near = GROUPS.filter(g => g.la).map(g => ({ g, d: dist(myPos.lat, myPos.lon, g.la, g.lo) })).sort((a, b) => a.d - b.d)[0];
    status(near ? `📍 Ближайшая группа — <b>${esc(near.g.n)}</b>, ${fmtDist(near.d)}` : '📍 Местоположение определено');
  }, err => status(err.code === 1 ? 'Доступ к геолокации запрещён. Разрешите его в настройках браузера или ищите по метро/адресу.' : 'Не удалось определить местоположение. Ищите по метро или адресу.'),
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 });
};

function renderGroups() {
  const dow = todayDow(), now = nowMin();
  let list = GROUPS.map(g => ({ g, d: myPos && g.la ? dist(myPos.lat, myPos.lon, g.la, g.lo) : null }));
  if (gQuery) list = list.filter(x => gQuery.split(/\s+/).every(w => x.g.q.includes(w)));
  if (gFilter === 'today') list = list.filter(x => x.g.sch[dow]);
  if (gFilter === 'online') list = list.filter(x => x.g.online);
  if (gFilter === 'fav') list = list.filter(x => S.fav.includes(x.g.u));
  if (myPos) list.sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  else if (gFilter === 'today') list.sort((a, b) => nextToday(a.g, now) - nextToday(b.g, now));
  $('#gCount').textContent = `${list.length} ${plural(list.length, ['группа', 'группы', 'групп'])}`;
  $('#grpList').innerHTML = list.length ? list.slice(0, gShown).map(x => aaGroupHTML(x.g, x.d, dow, now)).join('')
    : `<li><div class="g-name">Ничего не найдено</div><div class="g-line">${gFilter === 'fav' ? 'Нажмите ☆ у группы, чтобы добавить её в избранное.' : 'Попробуйте другое название, станцию метро или город.'}</div></li>`;
  $('#moreBtn').classList.toggle('hidden', list.length <= gShown);
  $$('#grpList [data-fav]').forEach(b => b.onclick = () => { const u = b.dataset.fav; S.fav = S.fav.includes(u) ? S.fav.filter(x => x !== u) : [...S.fav, u]; save(); renderGroups(); });
}
function nextToday(g, now) { const t = (g.sch[todayDow()] || []).map(tMin); const up = t.filter(x => x >= now - 30); return up.length ? Math.min(...up) : 2000 + Math.min(...t); }
const firstPhone = p => (String(p).match(/\+?\d[\d\s\-()]{8,}\d/) || [''])[0];

function aaGroupHTML(g, d, dow, now) {
  const today = g.sch[dow] || [];
  const up = today.filter(t => tMin(t) >= now - 30);
  const badge = today.length ? (up.length ? `<span class="badge-today">сегодня ${up[0]}</span>` : `<span class="badge-today past">сегодня было</span>`) : '';
  const schHTML = DAYS7.filter(x => g.sch[x]).map(x => `<span class="${x === dow ? 'today' : ''}">${x} ${g.sch[x].join(', ')}</span>`).join('');
  const isUrl = /^(https?:\/\/|www\.)/.test(g.a);
  const ph = firstPhone(g.p);
  const route = g.la ? `https://yandex.ru/maps/?rtext=~${g.la},${g.lo}&rtt=mt` : g.a && !g.online ? `https://yandex.ru/maps/?text=${encodeURIComponent((g.c || '') + ' ' + g.a)}` : '';
  const fav = S.fav.includes(g.u);
  return `<li>
    <div class="g-top"><div class="g-name">${esc(g.n)}</div><div class="g-right"><span class="g-dist">${g.online ? '🌐 онлайн' : fmtDist(d)}</span><button class="star ${fav ? 'on' : ''}" data-fav="${esc(g.u)}" aria-label="В избранное">${fav ? '★' : '☆'}</button></div></div>
    ${badge}
    ${g.m && !g.online ? `<div class="g-line">🚇 <span>${esc(g.m)}</span></div>` : g.online ? `<div class="g-line">💻 <span>${esc(g.m)}</span></div>` : ''}
    ${g.a && !isUrl ? `<div class="g-line">🏠 <b>${esc((g.c && g.c !== 'Москва' && g.c !== 'Интернет' ? g.c + ', ' : '') + g.a)}</b></div>` : ''}
    ${g.p ? `<div class="g-line">📞 <span>${esc(g.p)}</span></div>` : ''}
    ${schHTML ? `<div class="sched">${schHTML}</div>` : ''}
    <div class="g-actions">
      ${route ? `<a href="${route}" target="_blank" rel="noopener">Маршрут</a>` : ''}
      ${isUrl ? `<a href="${esc(g.a.startsWith('http') ? g.a : 'https://' + g.a)}" target="_blank" rel="noopener">Подключиться</a>` : ''}
      ${ph ? `<a href="${telHref(ph)}">Позвонить</a>` : ''}
      <a href="https://aamos.ru/index.php/timetable-today/group-list/${g.u}" target="_blank" rel="noopener">Как пройти</a>
    </div></li>`;
}

function dist(a, b, c, d) { const R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r; const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const fmtDist = k => k == null ? '' : k < 1 ? Math.round(k * 1000) + ' м' : (k < 10 ? k.toFixed(1).replace('.', ',') : Math.round(k)) + ' км';
const telHref = p => 'tel:' + p.replace(/[^\d+]/g, '');

/* --- свои группы (вне списка aamos.ru) --- */
function myGroupHTML(g, i) {
  const d = g.lat && myPos ? dist(myPos.lat, myPos.lon, g.lat, g.lon) : null;
  const route = g.lat ? `https://yandex.ru/maps/?rtext=~${g.lat},${g.lon}&rtt=mt` : g.addr ? `https://yandex.ru/maps/?text=${encodeURIComponent(g.addr)}` : '';
  const ph = firstPhone(g.phone || '');
  return `<li>
    <div class="g-top"><div class="g-name">${esc(g.name)}</div><div class="g-dist">${fmtDist(d)}</div></div>
    ${g.addr ? `<div class="g-line">🏠 <b>${esc(g.addr)}</b></div>` : ''}
    ${g.hours ? `<div class="g-line">🕐 <span>${esc(g.hours)}</span></div>` : ''}
    ${g.phone ? `<div class="g-line">📞 <span>${esc(g.phone)}</span></div>` : ''}
    ${g.tg ? `<div class="g-line">✈️ <span>${esc(g.tg)}</span></div>` : ''}
    ${g.note ? `<div class="g-line"><span>${esc(g.note)}</span></div>` : ''}
    <div class="g-actions">
      ${route ? `<a href="${route}" target="_blank" rel="noopener">Маршрут</a>` : ''}
      ${ph ? `<a href="${telHref(ph)}">Позвонить</a>` : ''}
      <button data-a="edit" data-i="${i}">Изменить</button><button data-a="del" data-i="${i}">Удалить</button>
    </div></li>`;
}
function renderMyGroups() {
  $('#myGroups').innerHTML = S.groups.map(myGroupHTML).join('');
  $('#myEmpty').classList.toggle('hidden', S.groups.length > 0);
  $$('#myGroups button[data-a]').forEach(b => b.onclick = () => {
    const i = +b.dataset.i;
    if (b.dataset.a === 'edit') groupForm(i);
    if (b.dataset.a === 'del') modal('Удалить группу?', `<p class="muted">${esc(S.groups[i].name)}</p>`, [{ text: 'Отмена' }, { text: 'Удалить', cls: 'primary', onClick: () => { S.groups.splice(i, 1); save(); renderMyGroups(); } }]);
  });
}
$('#addGroupBtn').onclick = () => groupForm(-1);
function groupForm(i) {
  const g = i >= 0 ? S.groups[i] : {};
  const f = (id, label, val, ph = '', type = 'text') => `<label class="field"><span>${label}</span><input type="${type}" id="${id}" value="${esc(val || '')}" placeholder="${ph}"></label>`;
  modal(i >= 0 ? 'Изменить группу' : 'Новая группа',
    f('gName', 'Название группы', g.name, 'Например, «Свобода»') + f('gAddr', 'Адрес', g.addr, 'Город, улица, дом') +
    f('gHours', 'Расписание', g.hours, 'Пн, Ср, Пт 19:00') + f('gPhone', 'Телефон', g.phone, '+7…', 'tel') +
    f('gTg', 'Telegram', g.tg, '@group или ссылка') + f('gNote', 'Заметка', g.note, 'Вход со двора, 2 этаж…'),
    [{ text: 'Отмена' }, { text: 'Сохранить', cls: 'primary', onClick: () => {
      const n = { ...g, name: $('#gName').value.trim(), addr: $('#gAddr').value.trim(), hours: $('#gHours').value.trim(), phone: $('#gPhone').value.trim(), tg: $('#gTg').value.trim(), note: $('#gNote').value.trim() };
      if (!n.name) { toast('Укажите название'); return false; }
      const changed = n.addr && n.addr !== g.addr;
      if (i >= 0) S.groups[i] = n; else S.groups.push(n);
      save(); renderMyGroups();
      if (changed) geocodeGroup(n);
    } }]);
}
async function geocodeGroup(g) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q=${encodeURIComponent(g.addr)}`);
    const j = await r.json(); if (j[0]) { g.lat = +j[0].lat; g.lon = +j[0].lon; save(); renderMyGroups(); }
  } catch {}
}

/* ================= НАСТРОЙКИ ================= */
function fillSettings() { renderBookStatus(); $('#sName').value = S.name; $('#sDate').value = S.start; $('#sDate').max = ymd(new Date()); }
$('#sSave').onclick = () => {
  const d = $('#sDate').value;
  if (d && parseYmd(d) > today0()) return toast('Дата не может быть в будущем');
  S.name = $('#sName').value.trim(); if (d) S.start = d;
  save(); renderSober(); toast('Сохранено');
};
$('#resetBtn').onclick = () => modal('Начать отсчёт заново?', '<p class="muted">Срыв — не конец пути. Записи дневника и группы сохранятся. Укажите новую дату трезвости:</p><label class="field"><span>Новая дата</span><input type="date" id="newStart"></label>', [
  { text: 'Отмена' }, { text: 'Начать заново', cls: 'primary', onClick: () => { const v = $('#newStart').value; if (!v || parseYmd(v) > today0()) { toast('Укажите корректную дату'); return false; } S.start = v; S.lastNotified = ''; save(); renderSober(); fillSettings(); go('s-sober'); toast('Новый отсчёт. Только сегодня 💙'); } }]);
$('#resetBtn').addEventListener('click', () => { const n = $('#newStart'); if (n) { n.value = ymd(new Date()); n.max = ymd(new Date()); } });
$('#exportBtn').onclick = () => download(`trezvost-backup-${ymd(new Date())}.json`, JSON.stringify(S, null, 2), 'application/json');
$('#importInput').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try { const j = JSON.parse(await file.text()); if (typeof j !== 'object' || !('entries' in j)) throw 0; S = Object.assign({}, defaults, j); save(); applyTheme(); renderSober(); fillSettings(); renderMyGroups(); renderGroups(); toast('Данные восстановлены'); }
  catch { toast('Не удалось прочитать файл'); }
  e.target.value = '';
};
$('#helpList').innerHTML = ['Позвонить спонсору или товарищу по группе', 'Пойти на ближайшее собрание — вкладка «Группы»', 'Перечитать свою запись в дневнике о хорошем дне', 'H.A.L.T.: я не голоден, не зол, не одинок, не устал?']
  .map(x => `<li class="small">${x}</li>`).join('');

/* ---------- PWA ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#installHint').innerHTML = '<button class="btn primary wide" id="installBtn">📲 Установить приложение</button>'; $('#installBtn').onclick = async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installHint').innerHTML = ''; }; });
if (/iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone) $('#installHint').textContent = 'На iPhone: «Поделиться» → «На экран Домой», чтобы установить приложение.';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(() => { syncSWState(); checkNotify(); }).catch(() => {});

/* ---------- старт ---------- */
renderSober(); renderMyGroups(); renderGroups();
const h = location.hash.slice(1);
if (['diary', 'groups', 'settings'].includes(h)) go('s-' + h);
if (!S.start) setTimeout(() => $('#obDate').value = ymd(new Date()), 0);
})();
