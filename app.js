/* Study Log: hours, focus blocks (5 min each) and a goal. Everything stays on this phone (localStorage). */
'use strict';
const APP_NAME = 'Study Log';          // the one place to rename the app (also update manifest.webmanifest)
const KEY = 'studylog.v1', SCHEMA = 1, VERSION = '1.0';

const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
function el(tag, a = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in a) { const v = a[k]; if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e[k] = v; else e.setAttribute(k, v === true ? '' : v); }
  kids.flat().forEach(c => c != null && c !== false && e.append(c.nodeType ? c : String(c)));
  return e;
}
const ICON = {
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>',
  again: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
};

/* ---------------- data ---------------- */
const DEF = { timerMin: 5, sound: 'chime', volume: 0.6, vibrate: true, autoMark: true, hideNums: false, timerBar: true,
  snap: true, h24: false, dayStart: 4, goal: 1000, goalMode: 'all', offset: 0, remind: true, remindAt: '23:00' };
const fresh = () => ({ v: SCHEMA, setup: false, settings: { ...DEF }, rows: [], timer: { state: 'idle', dur: 5 * 60000, endAt: 0, left: 0, doneAt: 0, mark: null }, lastBackup: 0, remindSkip: '' });
const isKey = k => typeof k === 'string' && /^\d{4}-\d\d-\d\d$/.test(k);
function normRow(r) {
  if (!r || !isKey(r.date) || !Number.isFinite(+r.start) || !Number.isFinite(+r.end)) return null;
  const start = Math.round(+r.start), end = Math.round(+r.end);
  if (end <= start || end - start > 1440) return null;
  return { id: String(r.id || uid()), date: r.date, start, end, text: String(r.text || ''), blocks: Math.max(0, Math.round(+r.blocks || 0)), ts: +r.ts || Date.now() };
}
function migrate(d) {
  const f = fresh(); if (!d || typeof d !== 'object') return f;
  // future schema changes go here: if (d.v < 2) { ... }
  const out = { ...f, ...d, v: SCHEMA, settings: { ...f.settings, ...(d.settings || {}) }, timer: { ...f.timer, ...(d.timer || {}) } };
  out.rows = (Array.isArray(d.rows) ? d.rows : []).map(normRow).filter(Boolean);
  return out;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
let D; try { D = migrate(JSON.parse(localStorage.getItem(KEY))); } catch { D = fresh(); }
const S = () => D.settings;
function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch { toast('Could not save. Phone storage may be full.'); } }
try { navigator.storage?.persist?.(); } catch {}

/* ---------------- dates & times ---------------- */
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pkey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = pkey(k); d.setDate(d.getDate() + n); return dkey(d); };
const ds = () => S().dayStart * 60;
// which study day a moment belongs to, and its minute within that day (times before "new day starts at" belong to yesterday)
function pos(t) { const d = new Date(t); let m = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60, k = dkey(d); if (m < ds()) { k = addDays(k, -1); m += 1440; } return { k, m }; }
const todayKey = () => pos(Date.now()).k;
function fmtT(m) { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mi = m % 60;
  return S().h24 ? `${pad(h)}:${pad(mi)}` : `${h % 12 || 12}:${pad(mi)} ${h < 12 ? 'AM' : 'PM'}`; }
const fmtD = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };
const fmtH = h => { const v = Math.round(h * 10) / 10; return v.toLocaleString('en-IN', { maximumFractionDigits: 1 }); };
const dayLabel = (k, long) => pkey(k).toLocaleDateString('en-IN', long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
const maxB = r => Math.max(1, Math.floor((r.end - r.start) / 5));
const focusOf = r => Math.min(r.blocks, maxB(r)) * 5;
const rowsOf = k => D.rows.filter(r => r.date === k).sort((a, b) => a.start - b.start || a.ts - b.ts);
function sum(L) { let mins = 0, foc = 0; L.forEach(r => { mins += r.end - r.start; foc += focusOf(r); }); return { mins, foc }; }
const goalHours = () => { const t = sum(D.rows); return (S().goalMode === 'useful' ? t.foc : t.mins) / 60 + (+S().offset || 0); };
function overlapsOf(r, list) { return (list || rowsOf(r.date)).filter(o => o !== r && o.id !== r.id && o.start < r.end && r.start < o.end); }

/* ---------------- view state ---------------- */
let view = todayKey();

/* ---------------- toast / sheets ---------------- */
let toastT;
function toast(msg, act, ms = 3500) {
  const t = $('#toast'); t.innerHTML = ''; t.append(el('span', {}, msg));
  if (act) t.append(el('button', { onclick: () => { hideToast(); act.fn(); } }, act.label));
  t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(hideToast, ms);
}
const hideToast = () => $('#toast').classList.remove('on');

let sheetOpen = null;
function openSheet(build, cls = '') {
  const had = !!sheetOpen; closeSheet(true, had);   // swapping sheets reuses the same history entry
  const scrim = el('div', { class: 'scrim', onclick: () => closeSheet() });
  const sh = el('div', { class: 'sheet ' + cls, role: 'dialog' });
  if (!cls.includes('full')) sh.append(el('div', { class: 'grab' }));
  $('#sheets').append(scrim, sh);
  sheetOpen = { scrim, sh, onClose: null };
  build(sh, sheetOpen);
  if (!had) history.pushState({ sheet: 1 }, '');  // Android back button closes the sheet
  requestAnimationFrame(() => { scrim.classList.add('on'); sh.classList.add('on'); });
  return sh;
}
function closeSheet(silent, fromPop) {
  if (!sheetOpen) return; const { scrim, sh, onClose } = sheetOpen; sheetOpen = null;
  onClose?.(); scrim.remove(); sh.remove();
  if (!fromPop && history.state?.sheet) history.back();
  if (!silent) render();
}
addEventListener('popstate', () => { if (sheetOpen) closeSheet(false, true); });
const head = (title, extra) => el('div', { class: 'sh-h' }, el('h2', {}, title), extra || null, el('button', { class: 'ib', 'aria-label': 'Close', html: ICON.x, onclick: () => closeSheet() }));
function choose(title, msg, buttons) {
  return new Promise(res => {
    openSheet((sh, st) => {
      st.onClose = () => res(null);
      sh.append(head(title), msg ? el('p', { class: 'note', style: 'margin-top:0;font-size:15px;color:var(--fg2)' }, msg) : null,
        el('div', { class: 'btns', style: buttons.length > 2 ? 'flex-direction:column' : '' }, buttons.map(b => el('button', { class: 'btn ' + (b.cls || ''), onclick: () => { st.onClose = null; closeSheet(); res(b.v); } }, b.label))));
    });
  });
}

/* ---------------- render: header, totals, list ---------------- */
function render() {
  const tk = todayKey();
  document.title = APP_NAME;
  $('#dateLabel').textContent = view === tk ? 'Today, ' + pkey(view).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : dayLabel(view);
  $('#todayBtn').hidden = view === tk;
  renderTotals(); renderList(); paintTimer(); checkReminder();
}
function renderTotals() {
  const g = +S().goal || 1000, done = Math.round(goalHours() * 10) / 10, pct = Math.min(100, done / g * 100), left = Math.max(0, g - done);
  const day = sum(rowsOf(view)), tk = todayKey();
  // pace over the last 7 study days (same measure as the goal)
  // pace over the last 7 study days (same measure as the goal); fewer if he only started recently
  const first = D.rows.reduce((a, r) => r.date < a ? r.date : a, tk), span = Math.max(1, Math.min(7, Math.round((pkey(tk) - pkey(first)) / 864e5) + 1));
  let w = 0; for (let i = 0; i < span; i++) { const s = sum(rowsOf(addDays(tk, -i))); w += S().goalMode === 'useful' ? s.foc : s.mins; }
  const avg = w / 60 / span; let pace = '';
  if (avg > 0 && left > 0) { const eta = pkey(tk); eta.setDate(eta.getDate() + Math.ceil(left / avg)); pace = `${span === 7 ? "7-day avg" : "Avg so far"} ${fmtH(avg)} h/day · ${fmtH(g)} h by ${eta.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`; }
  const fp = day.mins ? Math.round(day.foc / day.mins * 100) : 0;
  const T = $('#totals'); T.innerHTML = '';
  T.append(
    el('div', { class: 'big tnum' }, el('b', { id: 'goalNum' }, fmtH(done)), el('span', {}, `/ ${fmtH(g)} h${S().goalMode === 'useful' ? ' focus' : ''}`)),
    el('div', { class: 'bar' }, el('i', { style: `width:${pct}%` })),
    el('div', { class: 'sub tnum' }, el('span', {}, left > 0 ? `${fmtH(left)} h left` : 'Goal reached'), el('span', {}, `${Math.floor(pct)}%`)),
    el('div', { class: 'day tnum', id: 'dayLine' },
      el('span', {}, (view === tk ? 'Today ' : 'This day '), el('b', { id: 'dayMins' }, fmtD(day.mins))),
      el('span', { class: 'f' }, 'Focus ', el('b', { id: 'dayFoc' }, fmtD(day.foc)), day.mins ? ` · ${fp}%` : '')),
    pace ? el('div', { class: 'pace tnum', id: 'pace' }, pace) : null);
}
let focusKeep = null;
function renderList() {
  const L = $('#list'), act = document.activeElement;
  if (act?.classList.contains('did')) focusKeep = { id: act.dataset.id, s: act.selectionStart, e: act.selectionEnd };
  L.innerHTML = '';
  const rows = rowsOf(view), tk = todayKey(), nowM = pos(Date.now()).m;
  if (!rows.length) {
    L.append(el('div', { class: 'empty' }, view === tk ? 'Tap + Hour when you start studying. Each hour gets 12 focus marks, one per focused 5 minutes.' : view > tk ? 'This day hasn\'t happened yet.' : 'Nothing logged on this day. Tap + Hour to add what you did.'));
  }
  rows.forEach((r, i) => {
    if (i) { const g = r.start - rows[i - 1].end;
      if (g >= 5) L.append(el('div', { class: 'gap tnum' }, `${fmtD(g)} break`));
      else if (g < 0) L.append(el('div', { class: 'gap ov' }, 'Overlaps the hour above')); }
    L.append(rowEl(r, view === tk && r.start <= nowM && nowM < r.end));
  });
  if (focusKeep) { const t = L.querySelector(`.did[data-id="${focusKeep.id}"]`); if (t) { t.focus(); try { t.setSelectionRange(focusKeep.s, focusKeep.e); } catch {} } focusKeep = null; }
  L.querySelectorAll('.did').forEach(grow);
}
const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
function rowEl(r, isNow) {
  const mins = r.end - r.start, next = r.end >= 1440 && r.start < 1440;
  const tbtn = k => el('span', { class: 'tb' },
    el('button', { class: 'ck', 'data-k': k, 'aria-label': `Edit ${k} time`, html: ICON.clock, onclick: () => timeSheet(r, k) }),
    el('span', { class: 'tv tnum' }, fmtT(r[k]), k === 'end' && next ? el('span', { class: 'nd' }, '+1') : null));
  let tt;
  const txt = el('textarea', { class: 'did', rows: 1, 'data-id': r.id, placeholder: 'What did you do?', 'aria-label': 'What I did',
    oninput: e => { r.text = e.target.value; r.ts = Date.now(); grow(e.target); clearTimeout(tt); tt = setTimeout(save, 250); },
    onblur: () => { clearTimeout(tt); save(); } });
  txt.value = r.text;
  const card = el('div', { class: 'row' + (isNow ? ' now' : ''), 'data-id': r.id },
    el('div', { class: 'r1' }, tbtn('start'), el('span', { class: 'dash' }, '–'), tbtn('end'),
      el('span', { class: 'dur tnum' }, fmtD(mins)),
      el('button', { class: 'del', 'aria-label': 'Delete this hour', html: ICON.x, onclick: () => delRow(r) })),
    txt, focusEl(r));
  return card;
}
function focusEl(r) {
  const n = Math.min(r.blocks, maxB(r)), max = maxB(r);
  const marks = el('div', { class: 'marks' });
  for (let i = 0; i < max; i++) marks.append(el('button', { class: 'mk' + (i < n ? ' on' : ''), 'aria-label': `Focus block ${i + 1}`, onclick: () => setBlocks(r, i + 1 === n ? i : i + 1) }, el('i')));
  return el('div', { class: 'foc' }, el('span', { class: 'cnt tnum' + (n === max ? ' full' : '') }, `${n}/${max}`), marks);
}
function setBlocks(r, n) {
  r.blocks = Math.max(0, Math.min(maxB(r), n)); r.ts = Date.now(); save();
  const card = document.querySelector(`.row[data-id="${r.id}"]`); if (card) card.querySelector('.foc').replaceWith(focusEl(r));
  renderTotals();
}
function delRow(r) {
  const i = D.rows.indexOf(r); if (i < 0) return;
  D.rows.splice(i, 1); save(); render();
  toast('Hour deleted', { label: 'Undo', fn: () => { D.rows.push(r); save(); render(); } }, 7000);
}

/* ---------------- + Hour ---------------- */
function addHour() {
  const tk = todayKey(); let date = view, start, carry = 0;
  if (view === tk) {
    const m = Math.floor(pos(Date.now()).m), p = D.pend;
    if (p && p.date === tk && m - p.last <= 60) { start = S().snap ? Math.floor(p.start / 5) * 5 : Math.floor(p.start); carry = p.n; }
    else start = S().snap ? Math.ceil(m / 5) * 5 : m;
    D.pend = null;
    if (start >= ds() + 1440) { start -= 1440; date = addDays(date, 1); }   // 11:58 PM rounds into tomorrow
  } else {
    const L = rowsOf(view); start = L.length ? L[L.length - 1].end : Math.max(ds(), 9 * 60);
    if (start >= ds() + 1440) return toast('This day is full.');
  }
  const r = { id: uid(), date, start, end: start + 60, text: '', blocks: carry, ts: Date.now() };
  D.rows.push(r); if (carry && T().state === 'done') T().mark = { id: r.id, n: carry, max: maxB(r) }; save(); view = date; render();
  const card = document.querySelector(`.row[data-id="${r.id}"]`);
  card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (date !== tk) timeSheet(r, 'start', true); else card?.querySelector('.did')?.focus({ preventScroll: true });
}

/* ---------------- time editor (bottom sheet with wheels) ---------------- */
function wheel(items, onPick) {
  const IH = 44, box = el('div', { class: 'wheel' }), list = el('div', { class: 'wl' }); box.append(list);
  let idx = 0, t;
  items.forEach((it, i) => list.append(el('div', { class: 'wi', 'data-v': it.v, onclick: () => { go(i, true); onPick(items[i].v); } }, it.label)));
  const paint = () => list.querySelectorAll('.wi').forEach((n, i) => n.classList.toggle('on', i === idx));
  function go(i, smooth) { idx = i; paint(); box.scrollTo({ top: i * IH, behavior: smooth ? 'smooth' : 'instant' }); }
  box.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const i = Math.max(0, Math.min(items.length - 1, Math.round(box.scrollTop / IH))); if (i !== idx) { idx = i; paint(); onPick(items[i].v); } }, 100); }, { passive: true });
  return { el: box, set(v) { let i = items.findIndex(x => x.v === v); if (i < 0) { let best = 0; items.forEach((x, j) => { if (Math.abs(x.v - v) < Math.abs(items[best].v - v)) best = j; }); i = best; } go(i, false); } };
}
function timeSheet(r, which, isNew) {
  let s = r.start, e = r.end, k = which;
  const h24 = S().h24, step = S().snap ? 5 : 1;
  const sh = openSheet((sh, st) => {
    const segB = kk => el('button', { 'data-k': kk, onclick: () => { k = kk; sync(); } }, kk === 'start' ? 'Start' : 'End', el('b', { class: 'tnum' }));
    const seg = el('div', { class: 'seg' }, segB('start'), segB('end'));
    const cur = () => ((k === 'start' ? s : e) % 1440 + 1440) % 1440;
    const setCur = mod => {
      if (k === 'start') { const keep = e - s === 60; let ns = mod < ds() ? mod + 1440 : mod; s = ns;
        if (keep) e = s + 60; else { while (e <= s) e += 1440; while (e - s > 1440) e -= 1440; } }
      else { e = mod; while (e <= s) e += 1440; while (e - s > 1440) e -= 1440; }
      paint();
    };
    const hourItems = h24 ? [...Array(24)].map((_, i) => ({ v: i, label: pad(i) })) : [...Array(12)].map((_, i) => ({ v: i, label: String(i || 12) }));
    const minItems = [...Array(60 / step)].map((_, i) => ({ v: i * step, label: pad(i * step) }));
    const hw = wheel(hourItems, v => { const c = cur(), ap = Math.floor(c / 60) >= 12 ? 12 : 0; setCur((h24 ? v : v + ap) * 60 + c % 60); });
    const mw = wheel(minItems, v => { const c = cur(); setCur(Math.floor(c / 60) * 60 + v); });
    const aw = h24 ? null : wheel([{ v: 0, label: 'AM' }, { v: 12, label: 'PM' }], v => { const c = cur(); setCur(((Math.floor(c / 60) % 12) + v) * 60 + c % 60); });
    const info = el('div', { class: 'info tnum' });
    const durs = [30, 45, 60, 90, 120];
    const chips = el('div', { class: 'chips' }, durs.map(d => el('button', { 'data-d': d, onclick: () => { e = s + d; paint(); } }, fmtD(d))));
    const saveB = el('button', { class: 'btn pri', id: 'tSave', onclick: () => {
      r.start = s; r.end = e; r.ts = Date.now(); r.blocks = Math.min(r.blocks, maxB(r));
      if (!D.rows.includes(r)) D.rows.push(r); save(); st.onClose = null; closeSheet(); } }, 'Save');
    function paint() {
      seg.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.k === k); b.querySelector('b').textContent = fmtT(b.dataset.k === 'start' ? s : e) + (b.dataset.k === 'end' && e >= 1440 && s < 1440 ? ' +1' : ''); });
      chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.d === e - s));
      const d = e - s, ov = overlapsOf({ id: r.id, start: s, end: e, date: r.date });
      info.className = 'info tnum'; saveB.disabled = false;
      if (d > 16 * 60) { info.classList.add('e'); info.textContent = `${fmtD(d)} is too long for one row. Check the times.`; saveB.disabled = true; }
      else if (ov.length) { info.classList.add('w'); info.textContent = `${fmtD(d)} · overlaps ${ov.map(o => fmtT(o.start) + '–' + fmtT(o.end)).join(', ')}`; }
      else info.textContent = `${fmtD(d)} · ${Math.floor(d / 5)} focus blocks${e >= 1440 && s < 1440 ? ' · ends next day' : ''}`;
    }
    function sync() { const c = cur(); hw.set(h24 ? Math.floor(c / 60) : Math.floor(c / 60) % 12); mw.set(c % 60); aw?.set(Math.floor(c / 60) >= 12 ? 12 : 0); paint(); }
    sh.classList.add('tsheet');
    sh.append(head(isNew ? 'Set the time' : 'Edit time'), seg,
      el('div', { class: 'wheels' }, hw.el, el('span', { class: 'colon' }, ':'), mw.el, aw?.el),
      info, chips,
      el('div', { class: 'btns' }, el('button', { class: 'btn', onclick: () => closeSheet() }, 'Cancel'), saveB));
    requestAnimationFrame(sync);
  });
  return sh;
}

/* ---------------- timer ---------------- */
const T = () => D.timer;
let AC, tickT, endT;
function audio() { try { AC ||= new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch {} return AC; }
function ping(kind = S().sound, vol = +S().volume) {
  if (kind === 'none' || !audio()) return;
  const t0 = AC.currentTime + 0.03, out = AC.createGain(); out.gain.value = Math.max(0, Math.min(1, vol)); out.connect(AC.destination);
  const tone = (f, at, len, type = 'sine', peak = 0.5, f2) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, at); if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + 0.18);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + len); o.connect(g).connect(out); o.start(at); o.stop(at + len + 0.05); };
  if (kind === 'chime') { tone(880, t0, 1.1, 'sine', 0.45); tone(1318.5, t0 + 0.14, 1.2, 'sine', 0.3); }
  else if (kind === 'bell') { tone(659, t0, 1.8, 'sine', 0.45); tone(1648, t0, 0.8, 'sine', 0.12); tone(2306, t0, 0.45, 'sine', 0.06); }
  else if (kind === 'wood') { tone(523, t0, 0.35, 'triangle', 0.6); tone(1046, t0, 0.18, 'sine', 0.18); }
  else if (kind === 'drop') { tone(1400, t0, 0.45, 'sine', 0.45, 520); }
}
const SOUNDS = [['chime', 'Chime'], ['bell', 'Bell'], ['wood', 'Wood'], ['drop', 'Drop'], ['none', 'None']];
const leftMs = () => { const t = T(); return t.state === 'running' ? Math.max(0, t.endAt - Date.now()) : t.state === 'paused' ? t.left : t.dur; };
const fmtMs = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

async function reg() { try { return await navigator.serviceWorker?.getRegistration(); } catch { return null; } }
async function askNotif() { try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch {} }
async function notify(title, body, opts = {}) {
  try { if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const r = await reg(); if (!r) return false;
    await r.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', silent: false, ...opts }); return true; } catch { return false; }
}
async function cancelNotif(tag) { try { const r = await reg(); (await r?.getNotifications({ tag, includeTriggered: true }))?.forEach(n => n.close()); } catch {} }
const doneText = () => `${fmtD(T().dur / 60000)} done. Tap Again for another ${fmtD(T().dur / 60000)}.`;
function schedule() {
  clearTimeout(endT); const ms = T().endAt - Date.now(); endT = setTimeout(check, ms + 30);
  // Chrome's Notification Triggers (if this phone has it) let the notification fire even if the page is frozen
  if ('TimestampTrigger' in window && Notification?.permission === 'granted') {
    T().trig = true; notify(APP_NAME, doneText(), { tag: 'timer', showTrigger: new TimestampTrigger(T().endAt), actions: [{ action: 'again', title: 'Again' }] });
  } else T().trig = false;
}
function tStart() {
  audio(); askNotif(); const t = T();
  const left = t.state === 'paused' ? t.left : t.dur;
  Object.assign(t, { state: 'running', endAt: Date.now() + left, mark: null }); save(); schedule(); paintTimer(true);
}
function tPause() { const t = T(); t.left = leftMs(); t.state = 'paused'; clearTimeout(endT); cancelNotif('timer'); save(); paintTimer(true); }
function tReset() { const t = T(); t.state = 'idle'; t.mark = null; clearTimeout(endT); cancelNotif('timer'); save(); paintTimer(true); }
function tAgain() { T().state = 'idle'; tStart(); }
function tAdjust(dir) {
  const L = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 90], m = T().dur / 60000;
  let i = L.findIndex(x => x >= m); if (i < 0) i = L.length - 1; if (L[i] !== m && dir < 0) i++;
  T().dur = L[Math.max(0, Math.min(L.length - 1, i + dir))] * 60000; save(); paintTimer(true);
}
// the hour row a moment belongs to: the one it falls inside, else the latest one that had started, else the latest one
function rowAt(t) { const { k, m } = pos(t), L = rowsOf(k); return L.find(r => r.start <= m && m <= r.end) || [...L].reverse().find(r => r.start <= m) || L[L.length - 1] || null; }
function rowIn(t) { const { k, m } = pos(t); return rowsOf(k).find(r => r.start <= m && m <= r.end) || null; }
function markFor(t) {
  const r = rowIn(t);
  if (!r) { // outside any hour: remember the block so the next + Hour starts at this timer's start and carries it
    const st = pos(t - T().dur), p = D.pend;
    if (p && p.date === st.k && st.m - p.last <= 15 && p.n < 12) { p.n++; p.last = pos(t).m; }
    else D.pend = { date: st.k, start: st.m, last: pos(t).m, n: 1 };
    return { none: `Not inside an hour, so nothing marked. + Hour will start at ${fmtT(S().snap ? Math.floor(D.pend.start / 5) * 5 : Math.floor(D.pend.start))} with ${D.pend.n} block${D.pend.n > 1 ? 's' : ''}.` };
  }
  if (r.blocks >= maxB(r)) return { none: `${fmtT(r.start)} hour is already full.` };
  r.blocks++; r.ts = Date.now(); return { id: r.id, n: r.blocks, max: maxB(r) };
}
function check() {
  const t = T(); if (t.state !== 'running' || Date.now() < t.endAt) return;
  t.state = 'done'; t.doneAt = t.endAt;
  const late = Date.now() - t.endAt;
  if (late < 90000) { ping(); if (S().vibrate) try { navigator.vibrate?.(180); } catch {} }
  t.mark = S().autoMark ? markFor(t.endAt) : { ask: 1 };
  if (document.hidden && !t.trig) notify(APP_NAME, doneText(), { tag: 'timer', actions: [{ action: 'again', title: 'Again' }] });
  if (!document.hidden) cancelNotif('timer');
  save(); render();
  if (t.mark?.id) { const c = document.querySelector(`.row[data-id="${t.mark.id}"]`); c?.classList.add('flash'); setTimeout(() => c?.classList.remove('flash'), 1200); }
}
function undoMark() { const m = T().mark, r = D.rows.find(x => x.id === m?.id); if (r && r.blocks > 0) r.blocks--; T().mark = { undone: 1 }; save(); render(); }
function askMark() { T().mark = markFor(T().doneAt); save(); render(); }
let lastPaint = '';
function paintTimer(force) {
  const box = $('#timer'), t = T(), st = t.state, s = S(), dock = $('#dock');
  const sig = st + '|' + (st === 'running' ? Math.ceil(leftMs() / 1000) : leftMs()) + '|' + JSON.stringify(t.mark) + s.hideNums + s.timerBar + t.dur;
  if (!force && sig === lastPaint) return; lastPaint = sig;
  box.className = 'timer ' + ({ running: 'run', paused: 'pause', done: 'done', idle: 'idle' })[st]; dock.classList.toggle('isdone', st === 'done');
  box.innerHTML = '';
  const frac = 1 - leftMs() / t.dur;
  if (st === 'done') {
    const m = t.mark || {}; let sub;
    const r = m.id && D.rows.find(x => x.id === m.id);
    if (m.id && r) sub = el('small', {}, `Focus ${m.n}/${m.max} · ${fmtT(r.start)} hour · `, el('span', { class: 'tlink', role: 'button', onclick: ev => { ev.stopPropagation(); undoMark(); } }, 'Undo'));
    else if (m.ask) sub = el('small', {}, el('span', { class: 'tlink', role: 'button', id: 'markBtn', onclick: ev => { ev.stopPropagation(); askMark(); } }, 'Mark a focus block'));
    else if (m.none) sub = el('small', {}, m.none);
    else sub = el('small', {}, 'Tap to start again');
    const ago = Date.now() - t.doneAt > 90000 ? ` · ${fmtD((Date.now() - t.doneAt) / 60000)} ago` : '';
    box.append(el('button', { class: 'tg', id: 'tMain', 'aria-label': 'Start again', onclick: tAgain },
      el('span', { style: 'display:flex;align-items:center;gap:8px' }, el('span', { html: ICON.again }), `Again · ${fmtD(t.dur / 60000)}`, el('span', { style: 'font-size:13px;font-weight:500;opacity:.75' }, ago)), sub),
      el('button', { class: 'tx', id: 'tReset', 'aria-label': 'Dismiss', html: ICON.x, onclick: tReset }));
    return;
  }
  const face = () => s.hideNums && st !== 'idle'
    ? (s.timerBar ? ring(frac) : el('span', { class: 'dot' }))
    : el('span', { class: 'tnum', id: 'tLeft' }, fmtMs(leftMs()));
  if (st === 'idle') {
    box.append(el('button', { class: 'tx', id: 'tMinus', 'aria-label': 'Shorter', onclick: () => tAdjust(-1) }, '−'),
      el('button', { class: 'tg', id: 'tMain', 'aria-label': 'Start timer', onclick: tStart }, el('span', { html: ICON.play }), el('span', { class: 'tnum', id: 'tLeft' }, fmtMs(t.dur))),
      el('button', { class: 'tx', id: 'tPlus', 'aria-label': 'Longer', onclick: () => tAdjust(1) }, '+'));
  } else {
    box.append(el('button', { class: 'tg', id: 'tMain', 'aria-label': st === 'running' ? 'Pause' : 'Resume', onclick: st === 'running' ? tPause : tStart },
      el('span', { html: st === 'running' ? ICON.pause : ICON.play }), face()),
      el('button', { class: 'tx', id: 'tReset', 'aria-label': 'Reset timer', html: ICON.again, onclick: tReset }));
    if (s.timerBar && !s.hideNums) box.append(el('i', { class: 'tb2', style: `width:${frac * 100}%` }));
  }
}
function ring(f) {
  const C = 2 * Math.PI * 10;
  return el('span', { html: `<svg class="ring" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" stroke="#3a3a40"/><circle cx="13" cy="13" r="10" stroke="#f2b48c" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}" transform="rotate(-90 13 13)" stroke-linecap="round"/></svg>` });
}
function tick() {
  check(); if (T().state === 'running') paintTimer();
  const tk = todayKey(); if (tk !== lastToday) { if (view === lastToday) view = tk; lastToday = tk; render(); }  // midnight / new study day
  if (++ticks % 120 === 0) checkReminder();
}
let ticks = 0;
let lastToday = todayKey();

/* ---------------- backup ---------------- */
function download(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function backup() {
  const data = { app: 'studylog', schema: SCHEMA, exported: new Date().toISOString(), settings: D.settings, rows: D.rows };
  download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'study-backup.json');
  D.lastBackup = Date.now(); D.remindSkip = todayKey(); save(); $('#banner').hidden = true;
  toast('Saved study-backup.json to Downloads');
}
function restore() {
  const inp = el('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    let j; try { j = JSON.parse(await f.text()); } catch { return toast('That file isn\'t a backup.'); }
    if (!j || j.app !== 'studylog' || !Array.isArray(j.rows)) return toast('That file isn\'t a Study Log backup.');
    if ((j.schema || 1) > SCHEMA) return toast('This backup is from a newer version. Update the app first.');
    const rows = j.rows.map(normRow).filter(Boolean);
    const how = await choose('Restore backup', `The backup has ${rows.length} hours (${fmtH(sum(rows).mins / 60)} h). You have ${D.rows.length} now.`,
      [{ v: 'merge', label: 'Merge with what I have', cls: 'pri' }, { v: 'replace', label: 'Replace everything', cls: 'dng' }, { v: null, label: 'Cancel' }]);
    if (!how) return;
    if (how === 'replace') { D.rows = rows; if (j.settings) D.settings = { ...DEF, ...j.settings }; }
    else { const by = new Map(D.rows.map(r => [r.id, r])); rows.forEach(r => { const o = by.get(r.id); if (!o || r.ts > o.ts) by.set(r.id, r); }); D.rows = [...by.values()]; }
    D.setup = true; save(); $('#first')?.remove(); render(); toast(`Restored ${rows.length} hours`);
  };
  inp.click();
}
function checkReminder() {
  const b = $('#banner'), s = S(), tk = todayKey();
  const [h, m] = s.remindAt.split(':').map(Number), at = pkey(tk); at.setHours(h, m, 0, 0); if (h * 60 + m < ds()) at.setDate(at.getDate() + 1);
  const due = s.remind && D.setup && D.rows.length && Date.now() >= at && D.remindSkip !== tk && !(D.lastBackup && pos(D.lastBackup).k === tk);
  if (!due) { b.hidden = true; return; }
  if (b.hidden) { b.innerHTML = ''; b.append(el('span', { class: 't' }, 'Back up today\'s log?'), el('button', { class: 'btn acc', id: 'bkNow', style: 'flex:none;height:40px;padding:0 16px;font-size:15px', onclick: backup }, 'Save backup'),
      el('button', { class: 'ib', 'aria-label': 'Not today', html: ICON.x, onclick: () => { D.remindSkip = tk; save(); b.hidden = true; } }));
    b.hidden = false;
    if (document.hidden && D.remindNotified !== tk) { D.remindNotified = tk; save(); notify(APP_NAME, 'Back up today\'s log? Open the app and tap Save backup.', { tag: 'backup' }); } }
}

/* ---------------- export .docx ---------------- */
function exportDocx(from, to) {
  const keys = [...new Set(D.rows.filter(r => (!from || r.date >= from) && (!to || r.date <= to)).map(r => r.date))].sort();
  if (!keys.length) return toast('Nothing logged in that range.');
  const all = { mins: 0, foc: 0 };
  const days = keys.map(k => { const L = rowsOf(k), t = sum(L); all.mins += t.mins; all.foc += t.foc;
    return { title: `${dayLabel(k, true)}  ·  ${fmtD(t.mins)} logged · ${fmtD(t.foc)} focus`,
      rows: L.map(r => [fmtT(r.start), fmtT(r.end) + (r.end >= 1440 && r.start < 1440 ? ' (+1)' : ''), r.text || '—', `${Math.min(r.blocks, maxB(r))}/${maxB(r)} · ${focusOf(r)} min`]),
      total: ['Total', '', `${L.length} ${L.length === 1 ? 'row' : 'rows'} · ${fmtD(t.mins)}`, fmtD(t.foc)] }; });
  const g = +S().goal || 1000, done = Math.round(goalHours() * 10) / 10;
  const blob = makeDocx({ title: APP_NAME, subtitle: `${dayLabel(keys[0], true)} – ${dayLabel(keys[keys.length - 1], true)}  ·  exported ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
    head: ['Start', 'End', 'What I did', 'Focus'], days,
    summary: [`This export: ${fmtD(all.mins)} logged, ${fmtD(all.foc)} focused (${all.mins ? Math.round(all.foc / all.mins * 100) : 0}%) over ${keys.length} ${keys.length === 1 ? 'day' : 'days'}.`,
      `Goal: ${fmtH(done)} / ${fmtH(g)} h${S().goalMode === 'useful' ? ' (focus time)' : ''}, ${fmtH(Math.max(0, g - done))} h left${+S().offset ? ` (includes ${fmtH(+S().offset)} h done before the app)` : ''}.`] });
  const name = `study-log-${keys[0]}${keys.length > 1 ? '_to_' + keys[keys.length - 1] : ''}.docx`;
  download(blob, name); toast('Saved ' + name);
  return blob;
}

/* ---------------- settings ---------------- */
function settingsSheet() {
  openSheet(sh => {
    const s = S(), set = (k, v) => { s[k] = v; save(); renderTotals(); paintTimer(true); };
    const sw = (k, on) => el('label', { class: 'sw' }, el('input', { type: 'checkbox', 'data-s': k, checked: on ?? s[k], onchange: e => set(k, e.target.checked) }), el('i'));
    const it = (title, hint, ctl, cls) => el('div', { class: 'it ' + (cls || '') }, el('div', { class: 'l' }, el('div', {}, title), hint ? el('small', {}, hint) : null), ctl);
    const grp = (t, ...items) => el('div', { class: 'grp' }, el('h3', {}, t), el('div', { class: 'card' }, ...items));
    const tm = el('span', { class: 'tnum', id: 'defMin' }, s.timerMin + ' min');
    const stepper = el('div', { class: 'step' },
      el('button', { 'aria-label': 'Less', onclick: () => { s.timerMin = Math.max(1, s.timerMin - (s.timerMin > 5 ? 5 : 1)); tm.textContent = s.timerMin + ' min'; if (T().state === 'idle') T().dur = s.timerMin * 60000; set('timerMin', s.timerMin); } }, '−'), tm,
      el('button', { 'aria-label': 'More', onclick: () => { s.timerMin = Math.min(120, s.timerMin + (s.timerMin >= 5 ? 5 : 1)); tm.textContent = s.timerMin + ' min'; if (T().state === 'idle') T().dur = s.timerMin * 60000; set('timerMin', s.timerMin); } }, '+'));
    const snd = el('select', { class: 'sel', 'data-s': 'sound', onchange: e => { set('sound', e.target.value); ping(); } }, SOUNDS.map(([v, l]) => el('option', { value: v, selected: v === s.sound }, l)));
    const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, 'data-s': 'volume', onchange: e => { set('volume', +e.target.value); ping(); } });
    const goalIn = el('input', { class: 'num', type: 'number', inputmode: 'numeric', min: 1, value: s.goal, 'data-s': 'goal', onchange: e => set('goal', Math.max(1, Math.round(+e.target.value) || 1000)) });
    const offIn = el('input', { class: 'num', type: 'number', inputmode: 'decimal', min: 0, step: 0.5, value: s.offset, 'data-s': 'offset', onchange: e => set('offset', Math.max(0, +e.target.value || 0)) });
    const gm = el('div', { class: 'seg sm', style: 'margin-top:8px' }, [['all', 'All logged time'], ['useful', 'Focus time only']].map(([v, l]) =>
      el('button', { class: s.goalMode === v ? 'on' : '', 'data-gm': v, onclick: e => { set('goalMode', v); gm.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, l)));
    const dsSel = el('select', { class: 'sel', 'data-s': 'dayStart', onchange: e => { const old = s.dayStart; set('dayStart', +e.target.value); reDay(old); view = todayKey(); } },
      [0, 1, 2, 3, 4, 5].map(h => el('option', { value: h, selected: h === s.dayStart }, h ? `${h}:00 AM` : 'Midnight')));
    const remT = el('input', { class: 'tin', type: 'time', value: s.remindAt, 'data-s': 'remindAt', onchange: e => { set('remindAt', e.target.value || '23:00'); D.remindSkip = ''; save(); } });
    const tk = todayKey();
    const exFrom = el('input', { class: 'tin', type: 'date', value: addDays(tk, -6), id: 'exFrom', style: 'flex:1' }), exTo = el('input', { class: 'tin', type: 'date', value: tk, id: 'exTo', style: 'flex:1' });
    const rangeBox = el('div', { class: 'row2', hidden: true }, exFrom, exTo);
    let exMode = 'day';
    const exSeg = el('div', { class: 'seg sm' }, [['day', 'This day'], ['range', 'Dates'], ['all', 'All']].map(([v, l]) =>
      el('button', { class: v === exMode ? 'on' : '', 'data-ex': v, onclick: e => { exMode = v; rangeBox.hidden = v !== 'range'; exSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, l)));
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const nb = perm === 'granted' ? el('span', { class: 'note', style: 'margin:0' }, 'On') : perm === 'denied' ? el('span', { class: 'note', style: 'margin:0' }, 'Blocked') :
      el('button', { class: 'btn', style: 'flex:none;height:40px;padding:0 14px;font-size:14px', onclick: async () => { await askNotif(); closeSheet(true); settingsSheet(); } }, 'Allow');
    sh.append(
      el('div', { class: 'sh-h' }, el('button', { class: 'ib', 'aria-label': 'Back', html: ICON.back, onclick: () => closeSheet() }), el('h2', {}, 'Settings')),
      grp('Timer',
        it('Default length', null, stepper),
        it('Auto-mark focus', 'When a timer ends, add one focus block to the current hour', sw('autoMark')),
        it('Sound', null, snd),
        it('Volume', null, el('div', { style: 'width:130px' }, vol)),
        it('Vibrate once', null, sw('vibrate')),
        it('Hide the numbers', 'Show only a ring or dot while it runs', sw('hideNums')),
        it('Progress bar', null, sw('timerBar')),
        it('Notifications', perm === 'denied' ? 'Allow them in Chrome site settings to get a ping when the phone is locked' : 'So the ping reaches you when the phone is locked', nb)),
      grp('Hours',
        it('24-hour clock', null, sw('h24')),
        it('Snap to 5 minutes', 'Times move in 5-minute steps', sw('snap')),
        it('New day starts at', 'Study after midnight counts for the day before', dsSel)),
      grp('Goal',
        it('Goal', 'hours', goalIn),
        it('Already done', 'Hours you did before using this app', offIn),
        it('Count toward the goal', null, gm, 'col')),
      grp('Backup',
        it('Daily backup reminder', null, sw('remind')),
        it('Remind at', null, remT),
        el('div', { class: 'it col' }, el('div', { class: 'l' }, el('div', { id: 'lastBk' }, 'Last backed up: ' + (D.lastBackup ? new Date(D.lastBackup).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never')),
          el('small', {}, 'Saves one file, study-backup.json, to Downloads. Keep only the newest one.')),
          el('div', { class: 'row2' }, el('button', { class: 'btn acc', id: 'bkBtn', onclick: () => { backup(); $('#lastBk').textContent = 'Last backed up: just now'; } }, 'Back up now'), el('button', { class: 'btn', id: 'rsBtn', onclick: restore }, 'Restore')))),
      grp('Export to Word',
        el('div', { class: 'it col' }, exSeg, rangeBox,
          el('button', { class: 'btn pri', id: 'exBtn', style: 'margin-top:8px', onclick: () => exportDocx(...(exMode === 'day' ? [view, view] : exMode === 'range' ? [exFrom.value, exTo.value] : [])) }, 'Export .docx'))),
      el('p', { class: 'note' }, `${APP_NAME} ${VERSION}. Your log is stored only on this phone. Clearing Chrome's site data deletes it, so keep a backup.`));
  }, 'full');
}
// when "new day starts at" changes, move rows to the study day their start time now belongs to
function reDay(old) {
  if (old === S().dayStart) return;
  D.rows.forEach(r => { const abs = pkey(r.date); abs.setMinutes(r.start); const p = pos(abs.getTime()); const d = r.end - r.start; r.date = p.k; r.start = Math.round(p.m); r.end = r.start + d; });
  save();
}

/* ---------------- stats ---------------- */
function statsSheet() {
  let n = 7;
  openSheet(sh => {
    const body = el('div');
    const seg = el('div', { class: 'seg sm' }, [7, 30].map(v => el('button', { class: v === n ? 'on' : '', 'data-n': v, onclick: e => { n = v; seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); draw(); } }, `${v} days`)));
    sh.append(head('Stats'), seg, body);
    function draw() {
      body.innerHTML = '';
      const tk = todayKey(), keys = [...Array(n)].map((_, i) => addDays(tk, i - n + 1)), sums = keys.map(k => sum(rowsOf(k)));
      const top = Math.max(60, ...sums.map(s => s.mins));
      const tot = sums.reduce((a, s) => ({ mins: a.mins + s.mins, foc: a.foc + s.foc }), { mins: 0, foc: 0 });
      const studied = sums.filter(s => s.mins).length, best = Math.max(...sums.map(s => s.mins));
      let streak = 0; for (let i = 0; ; i++) { const s = sum(rowsOf(addDays(tk, -i))); if (s.mins) streak++; else if (i) break; if (i > 3650) break; }
      body.append(
        el('div', { class: 'bars' }, keys.map((k, i) => el('div', { class: 'b' + (k === tk ? ' t' : ''), title: `${dayLabel(k)}: ${fmtD(sums[i].mins)}` },
          el('i', { style: `height:${sums[i].mins / top * 100}%` }), el('i', { class: 'f', style: `height:${sums[i].foc / top * 100}%` })))),
        el('div', { class: 'bl' }, el('span', {}, dayLabel(keys[0])), el('span', {}, 'Today')),
        el('div', { class: 'leg' }, el('span', {}, el('i'), 'Logged'), el('span', {}, el('i', { class: 'f' }), 'Focus')),
        el('div', { class: 'kpis tnum' },
          el('div', { class: 'kpi' }, el('b', {}, fmtH(tot.mins / 60) + ' h'), el('span', {}, `logged, ${fmtH(tot.mins / 60 / n)} h/day`)),
          el('div', { class: 'kpi' }, el('b', {}, (tot.mins ? Math.round(tot.foc / tot.mins * 100) : 0) + '%'), el('span', {}, `focused, ${fmtH(tot.foc / 60)} h`)),
          el('div', { class: 'kpi' }, el('b', {}, `${studied}/${n}`), el('span', {}, 'days studied')),
          el('div', { class: 'kpi' }, el('b', {}, streak + (streak === 1 ? ' day' : ' days')), el('span', {}, `streak · best day ${fmtD(best)}`))));
      // when does he focus best? by the time of day each row starts
      const parts = [['Morning', 300, 720], ['Afternoon', 720, 1020], ['Evening', 1020, 1260], ['Night', 1260, 1740]].map(([l, a, b]) => {
        const L = keys.flatMap(rowsOf).filter(r => { const m = r.start < 300 ? r.start + 1440 : r.start; return m >= a && m < b; }); return [l, sum(L)]; });
      const used = parts.filter(p => p[1].mins);
      if (used.length) {
        const bestP = used.reduce((a, p) => p[1].foc / p[1].mins > a[1].foc / a[1].mins ? p : a);
        body.append(el('div', { class: 'grp parts' }, el('h3', {}, 'Focus by time of day'), el('div', { class: 'card' },
          used.map(([l, s]) => el('div', { class: 'it' }, el('div', { class: 'l' }, el('div', {}, l + (used.length > 1 && l === bestP[0] ? '  ★' : ''))), el('div', { class: 'v tnum' }, `${fmtD(s.mins)} · ${Math.round(s.foc / s.mins * 100)}% focus`)))),
          used.length > 1 ? el('p', { class: 'note' }, `You focus best in the ${bestP[0].toLowerCase()}.`) : null));
      } else body.append(el('p', { class: 'note' }, 'No hours logged in this period yet.'));
    }
    draw();
  });
}

/* ---------------- first run ---------------- */
function firstRun() {
  const g = el('input', { type: 'number', inputmode: 'numeric', min: 1, value: 1000, id: 'frGoal' });
  const o = el('input', { type: 'number', inputmode: 'decimal', min: 0, value: 0, id: 'frDone' });
  const wrap = el('div', { class: 'sheet full on first', id: 'first' },
    el('h1', {}, APP_NAME), el('p', {}, 'Log each study hour, mark the 5-minute blocks you were focused, and watch the hours add up.'),
    el('div', { class: 'fld' }, el('label', { for: 'frGoal' }, 'Your goal (hours)'), g),
    el('div', { class: 'fld' }, el('label', { for: 'frDone' }, 'Hours already done before today'), o),
    el('div', { class: 'btns', style: 'margin-top:28px' }, el('button', { class: 'btn pri', id: 'frStart', onclick: () => {
      S().goal = Math.max(1, Math.round(+g.value) || 1000); S().offset = Math.max(0, +o.value || 0); D.setup = true; save(); wrap.remove(); render(); } }, 'Start')),
    el('button', { class: 'link', id: 'frRestore', onclick: restore }, 'New phone? Restore from a backup'));
  document.body.append(wrap);
}

/* ---------------- wiring ---------------- */
$('#prev').onclick = () => { view = addDays(view, -1); render(); };
$('#next').onclick = () => { view = addDays(view, 1); render(); };
$('#todayBtn').onclick = () => { view = todayKey(); render(); };
const dp = $('#datePick');
$('#dateBtn').onclick = () => { dp.value = view; try { dp.showPicker(); } catch { dp.focus(); dp.click(); } };
dp.onchange = () => { if (isKey(dp.value)) { view = dp.value; render(); } };
$('#addHour').onclick = addHour;
$('#setBtn').onclick = settingsSheet;
$('#statsBtn').onclick = statsSheet;
// swipe left/right on the list to change day
(() => { let x0, y0; const m = $('.main');
  m.addEventListener('touchstart', e => { if (e.target.closest('textarea,.marks')) return x0 = null; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  m.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; if (Math.abs(dx) > 80 && Math.abs(dy) < 40) { view = addDays(view, dx < 0 ? 1 : -1); render(); } }, { passive: true });
})();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); render(); } });
navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type === 'again') tAgain(); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

// if the timer was running when the app was closed, pick it back up
if (T().state === 'running') schedule();
if (!D.setup) firstRun();
check(); render();
if (new URLSearchParams(location.search).get('again') === '1') { history.replaceState(null, '', location.pathname); if (T().state === 'done') tAgain(); }
setInterval(tick, 250);
