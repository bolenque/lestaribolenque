/* ============================================================================
 * E-TOKO — core.js
 * Inti SPA: api() tahan jaringan, SWR cache perangkat, router hash,
 * keranjang optimistic, dan helper UI. (gas-pro-api + gas-instant-ux-pro)
 * ========================================================================== */
'use strict';

const GAS_URL = (window.APP_CONFIG && window.APP_CONFIG.GAS_URL) || '';
const CONFIG_OK = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(GAS_URL) && !/GANTI|XXXX/.test(GAS_URL);
const LS_PREFIX = 'etoko:v1:';

const AppState = {
  catalog: null,          // { v, store, categories, products }
  admin: null,            // diisi admin.js
  token: '',
  pages: {},
  current: null
};

/* ---------------------------------------------------------------- Storage */
const Store = {
  get(k, d) { try { const v = localStorage.getItem(LS_PREFIX + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) {
    const s = JSON.stringify(v);
    try { localStorage.setItem(LS_PREFIX + k, s); }
    catch (e) {
      try { Object.keys(localStorage).filter(x => x.indexOf(LS_PREFIX + 'c:') === 0).forEach(x => localStorage.removeItem(x)); localStorage.setItem(LS_PREFIX + k, s); } catch (e2) { /* jalan tanpa cache */ }
    }
  },
  del(k) { try { localStorage.removeItem(LS_PREFIX + k); } catch (e) { } }
};
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length; }

/* ---------------------------------------------------------------- Perf (Prinsip 0) */
const Perf = {
  rows: [],
  add(action, total, server) { this.rows.push({ action, total, server: server == null ? null : server, net: server == null ? null : total - server, at: new Date().toLocaleTimeString() }); if (this.rows.length > 200) this.rows.shift(); },
  table() { console.table(this.rows.slice(-30)); },
  summary() {
    const g = {}; this.rows.forEach(r => { const x = g[r.action] || (g[r.action] = { n: 0, total: 0, server: 0 }); x.n++; x.total += r.total; x.server += r.server || 0; });
    console.table(Object.keys(g).map(a => ({ aksi: a, panggilan: g[a].n, rata_total_ms: Math.round(g[a].total / g[a].n), rata_server_ms: Math.round(g[a].server / g[a].n) })));
  }
};
window.Perf = Perf;

/* ---------------------------------------------------------------- API (Prinsip 8) */
const READ_ACTIONS = /^(ping|boot|orderStatus|history|invoicePdf|checkPayment|voucherCheck|adminBoot|batch|dashboard|products|orders|orderDetail|proofImage|customers|customerDetail|report|admins|settings|logs|testGateway|crmList|crmDetail|blastList|notifQueue|waDevice)$/;

function newReqId() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); }

async function apiOnce(action, data, timeout, reqId) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout), t0 = performance.now();
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },        // hindari CORS preflight
      body: JSON.stringify({ action, token: AppState.token || '', reqId, data: data || {} })
    });
    const text = await res.text();
    try { const j = JSON.parse(text); Perf.add(action, Math.round(performance.now() - t0), j.ms); return j; }
    catch (e) { return { success: false, network: true, retryable: res.status >= 500 || res.status === 429, message: 'Server membalas HTTP ' + res.status + ' (bukan JSON). Pastikan deployment Web App aksesnya "Anyone".' }; }
  } catch (err) {
    return { success: false, network: true, retryable: true, message: err.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Koneksi terputus. Periksa internet Anda.' };
  } finally { clearTimeout(timer); }
}

/* ---- Dedupe baca in-flight + epoch tulis (gas-scale-turbo §4.2) ---- */
const _inflight = {}; let _writeEpoch = 0;
async function api(action, data, opt = {}) {
  if (!READ_ACTIONS.test(action)) { _writeEpoch++; const r = await apiRun(action, data, opt); _writeEpoch++; return r; }
  const k = _writeEpoch + '|' + action + '|' + (AppState.token || '') + '|' + JSON.stringify(data || {});
  if (_inflight[k]) return _inflight[k];
  const p = apiRun(action, data, opt); _inflight[k] = p;
  p.then(() => delete _inflight[k], () => delete _inflight[k]);
  return p;
}
async function apiRun(action, data, opt = {}) {
  if (!CONFIG_OK) return { success: false, message: 'Konfigurasi belum lengkap: isi GAS_URL di js/config.js.', config: true };
  const isRead = READ_ACTIONS.test(action);
  const reqId = isRead ? '' : (opt.reqId || newReqId());
  const tries = isRead ? 3 : 2;                 // tulis aman di-retry karena reqId sama (idempoten)
  let res;
  for (let i = 0; i < tries; i++) {
    if (i) { await sleep(1200 * i); if (navigator.onLine === false) await waitOnline(15000); }
    res = await apiOnce(action, data, isRead ? (i ? 40000 : 25000) : (opt.timeout || 90000), reqId);
    if (res.success || !res.retryable) break;
  }
  if (!res.success && res.data && res.data.code === 'AUTH' && typeof window.onSessionExpired === 'function') window.onSessionExpired();
  if (res.nq > 0) scheduleDrain();
  return res;
}
/* ---- Penggabung batch otomatis (§4.3): baca yang dipanggil pada tik yang sama → 1 eksekusi ---- */
const BATCHABLE = /^(dashboard|products|orders|customers|report|admins|settings|crmList|blastList|notifQueue|logs)$/;
const Batcher = {
  q: null,
  add(action, data) { return new Promise(res => { if (!this.q) { this.q = []; setTimeout(() => this.flush(), 0); } this.q.push({ action, data: data || {}, res }); }); },
  async flush() {
    const q = this.q; this.q = null;
    const groups = {}; q.forEach(it => { const k = it.action + '|' + JSON.stringify(it.data); (groups[k] = groups[k] || { action: it.action, data: it.data, list: [] }).list.push(it); });
    const uniq = Object.values(groups), byAction = {};
    const batchable = uniq.filter(g => BATCHABLE.test(g.action) && !byAction[g.action] && (byAction[g.action] = 1));
    const single = uniq.filter(g => batchable.indexOf(g) < 0);
    single.forEach(g => api(g.action, g.data).then(r => g.list.forEach(it => it.res(r))));
    for (let i = 0; i < batchable.length; i += 8) {
      const part = batchable.slice(i, i + 8);
      if (part.length === 1) { api(part[0].action, part[0].data).then(r => part[0].list.forEach(it => it.res(r))); continue; }
      const r = await api('batch', { calls: part.map(g => ({ action: g.action, data: g.data })) });
      part.forEach(g => { const x = r.success && r.data[g.action] ? r.data[g.action] : (r.success ? { success: false, message: 'Tidak ada hasil' } : r); g.list.forEach(it => it.res(x)); });
    }
  }
};
function apiQ(action, data) { return Batcher.add(action, data); }
/* ---- Antrean notifikasi: minta server mengirim (§4.6) ---- */
let _drainT = null, _drainN = 0;
function scheduleDrain() {
  clearTimeout(_drainT);
  _drainT = setTimeout(async () => {
    const r = await apiRun('drain', {});
    if (r.success && r.data && r.data.left > 0 && _drainN++ < 3) scheduleDrain(); else _drainN = 0;
  }, 400);
}
/* ---- Aktivitas pengguna → polling adaptif (§4.8) ---- */
const Activity = {
  at: Date.now(), last: {},
  init() { ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'].forEach(ev => addEventListener(ev, () => { this.at = Date.now(); }, { passive: true })); },
  idle() { return Date.now() - this.at > 120000; },
  due(key, activeMs, idleMs) {
    if (document.visibilityState !== 'visible') return false;
    if (Date.now() - (this.last[key] || 0) < (this.idle() ? idleMs : activeMs) - 500) return false;
    this.last[key] = Date.now(); return true;
  }
};
Activity.init();
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function waitOnline(ms) { return new Promise(r => { if (navigator.onLine !== false) return r(); const t = setTimeout(done, ms); function done() { clearTimeout(t); removeEventListener('online', done); r(); } addEventListener('online', done); }); }
/** Warmup per lingkup (§4.7): GET ?w=pub|admin, maks 1×/4 menit per lingkup per tab. */
function warmUpServer(scope) {
  scope = scope || 'pub';
  if (!CONFIG_OK) return;
  try { const k = 'etoko-warm-' + scope, t = +sessionStorage.getItem(k) || 0; if (Date.now() - t < 240000) return; sessionStorage.setItem(k, String(Date.now())); } catch (e) { }
  fetch(GAS_URL + '?w=' + scope + '&t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).catch(() => { });
}

/* ---------------------------------------------------------------- SWR (Prinsip 2) */
/** render(data, fromCache) dipanggil maks 2× dan hanya bila data berubah. */
async function swr(key, action, payload, render, opt = {}) {
  const fresh = opt.fresh == null ? 60000 : opt.fresh;
  const c = Store.get('c:' + key, null);
  if (c) render(c.data, true);
  if (c && !opt.force && Date.now() - c.t < fresh) return { success: true, data: c.data, cached: true };
  const res = await (opt.q ? apiQ : api)(action, opt.fresh0 ? Object.assign({ _fresh: true }, payload) : payload);
  if (res.success) {
    const h = hashStr(JSON.stringify(res.data));
    Store.set('c:' + key, { t: Date.now(), h, data: res.data });
    if (!c || c.h !== h) render(res.data, false);
  } else if (!c && opt.onError) opt.onError(res);
  return res;
}

/* ---------------------------------------------------------------- Router (Prinsip 1) */
const Pages = {};
function registerPage(name, def) { Pages[name] = Object.assign({ mode: 'shop' }, def); }
function go(path) { const h = '#/' + String(path || '').replace(/^#?\/?/, ''); if (location.hash === h) route(); else location.hash = h; }
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = {}; (qs || '').split('&').filter(Boolean).forEach(p => { const [k, v] = p.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
  return { parts, q };
}
let adminLoading = null;
function loadAdminBundle() {
  if (window.AdminApp) return Promise.resolve();
  if (adminLoading) return adminLoading;
  adminLoading = new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'css/admin.css?v=' + APP_ASSET_V; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'js/admin.js?v=' + APP_ASSET_V; s.onload = resolve; s.onerror = () => { adminLoading = null; reject(new Error('Gagal memuat modul admin.')); };
    document.body.appendChild(s);
  });
  return adminLoading;
}
const APP_ASSET_V = '1.1.0';

async function route() {
  const { parts, q } = parseHash();
  let name = parts[0] || 'home';
  if (name === 'admin') {
    document.body.classList.add('mode-admin');
    try { await loadAdminBundle(); } catch (e) { toast(e.message, 'error'); return; }
    return window.AdminApp.route(parts.slice(1), q);
  }
  document.body.classList.remove('mode-admin');
  const def = Pages[name] || Pages.home;
  if (!Pages[name]) name = 'home';
  const view = document.getElementById('view');
  let el = view.querySelector('.page[data-page="' + name + '"]');
  if (!el) { el = document.createElement('section'); el.className = 'page'; el.dataset.page = name; el.innerHTML = def.template(); view.appendChild(el); def.init && def.init(el); }
  view.querySelectorAll('.page').forEach(p => { p.hidden = p !== el; });
  if (AppState.current !== name) window.scrollTo(0, 0);
  AppState.current = name;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  document.title = (def.title ? (typeof def.title === 'function' ? def.title(parts) : def.title) + ' · ' : '') + storeName();
  def.show && def.show(el, parts.slice(1), q);
  refreshIcons(el);
}

/* ---------------------------------------------------------------- Format & util */
const fmtRp = n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const fmtNum = n => (Number(n) || 0).toLocaleString('id-ID');
function fmtDate(d, withTime) {
  if (!d) return '-';
  const x = new Date(d); if (isNaN(x)) return String(d);
  const opt = { day: 'numeric', month: 'short', year: 'numeric' };
  if (withTime) { opt.hour = '2-digit'; opt.minute = '2-digit'; }
  return x.toLocaleString('id-ID', opt).replace('.', ':');
}
function timeAgo(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'; if (s < 172800) return 'kemarin';
  return fmtDate(d);
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function storeName() { return (AppState.catalog && AppState.catalog.store && AppState.catalog.store.toko_nama) || 'E-TOKO'; }
function normHp(hp) { let d = String(hp || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '62' + d.slice(1); else if (d.startsWith('8')) d = '62' + d; return /^62\d{8,13}$/.test(d) ? d : ''; }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }

/* ---------------------------------------------------------------- Ikon (subset Lucide → js/icons.js) */
function ic(name, cls) {
  const b = (window.ICONS || {})[name];
  if (!b) return '';
  return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + b + '</svg>';
}
function refreshIcons(root) { $$('i[data-i]', root).forEach(el => { const t = document.createElement('template'); t.innerHTML = ic(el.dataset.i, el.className) || ''; if (t.content.firstChild) el.replaceWith(t.content.firstChild); }); }

/* ---------------------------------------------------------------- Gambar produk */
const CAT_ICON = { Elektronik: 'headphones', Fashion: 'shirt', Digital: 'download', FnB: 'utensils', Jasa: 'pen-tool' };
function catIcon(cat) {
  const c = AppState.catalog && (AppState.catalog.categories || []).find(x => x.nama === cat);
  return (c && c.ikon && window.ICONS && window.ICONS[c.ikon]) ? c.ikon : (CAT_ICON[cat] || 'shopping-bag');
}
function imgUrl(id, w) {
  if (!id) return '';
  if (/^https?:\/\//.test(id)) return id;
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + (w || 600);
}
function catTone(cat) { const t = { Elektronik: 'violet', Fashion: 'lilac', Digital: 'sky', FnB: 'amber', Jasa: 'ocean' }; return t[cat] || 'violet'; }
function productImg(p, w, cls) {
  const id = (p.foto || [])[0];
  const ph = '<div class="ph ph-' + catTone(p.kategori) + '">' + ic(catIcon(p.kategori)) + '</div>';
  if (!id) return '<div class="pimg ' + (cls || '') + '">' + ph + '</div>';
  return '<div class="pimg ' + (cls || '') + '">' + ph + '<img src="' + esc(imgUrl(id, w)) + '" alt="' + esc(p.nama) + '" loading="lazy" decoding="async" onload="this.classList.add(\'on\')" onerror="this.remove()"></div>';
}

/* ---------------------------------------------------------------- Kompres gambar sebelum unggah */
function fileToDataUrl(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Gagal membaca file.')); r.readAsDataURL(file); }); }
async function compressImage(file, maxW = 1280, quality = 0.78) {
  if (file.type === 'application/pdf') { if (file.size > 4.5 * 1024 * 1024) throw new Error('PDF maksimal 4,5 MB.'); return { name: file.name, data: await fileToDataUrl(file) }; }
  if (!/^image\//.test(file.type)) throw new Error('Hanya gambar (JPG/PNG/WebP) atau PDF.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Gambar tidak valid.')); i.src = url; });
    const scale = Math.min(1, maxW / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { name: file.name.replace(/\.\w+$/, '') + '.jpg', data: c.toDataURL('image/jpeg', quality) };
  } finally { URL.revokeObjectURL(url); }
}

/* ---------------------------------------------------------------- Toast & Modal */
function toast(msg, type = 'success', ms = 3200) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  const icon = { success: 'circle-check', error: 'circle-alert', info: 'info', warning: 'triangle-alert' }[type] || 'info';
  el.className = 'toast toast-' + type; el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = ic(icon) + '<span>' + esc(msg) + '</span><button class="toast-x" aria-label="Tutup">' + ic('x') + '</button>';
  root.appendChild(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.querySelector('.toast-x').onclick = close;
  setTimeout(close, ms);
}
function modal(html, opt = {}) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap' + (opt.side ? ' modal-side' : '');
  wrap.innerHTML = '<div class="modal-bg"></div><div class="modal ' + (opt.cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
  root.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const prevFocus = document.activeElement;
  const close = () => { wrap.classList.add('out'); setTimeout(() => { wrap.remove(); if (!root.children.length) document.body.classList.remove('no-scroll'); prevFocus && prevFocus.focus && prevFocus.focus(); }, 160); document.removeEventListener('keydown', onKey); opt.onClose && opt.onClose(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.querySelector('.modal-bg').onclick = () => { if (!opt.sticky) close(); };
  $$('[data-close]', wrap).forEach(b => b.onclick = close);
  refreshIcons(wrap);
  setTimeout(() => { const f = wrap.querySelector('[autofocus], input, textarea, select, button'); f && f.focus(); }, 50);
  return { el: wrap.querySelector('.modal'), close };
}
function confirmDialog(title, msg, okLabel = 'Ya, lanjutkan', danger = false) {
  return new Promise(resolve => {
    let done = false;
    const m = modal('<div class="modal-body"><h3 class="h3">' + esc(title) + '</h3><p class="muted mt-2">' + esc(msg) + '</p></div><div class="modal-foot"><button class="btn btn-ghost" data-close>Batal</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + esc(okLabel) + '</button></div>', { cls: 'modal-sm', onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector('[data-ok]').onclick = () => { done = true; resolve(true); m.close(); };
  });
}
function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + esc(label || 'Memproses...'); }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}
function copyText(t) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Disalin ke clipboard', 'info', 1800)).catch(() => toast('Salin manual: ' + t, 'info')); }
function badge(status) {
  const map = {
    'Baru': 'sky', 'Menunggu Pembayaran': 'amber', 'Menunggu Verifikasi': 'amber', 'Diproses': 'violet', 'Dikirim': 'ocean',
    'Selesai': 'green', 'Lunas': 'green', 'Aktif': 'green', 'Dibatalkan': 'red', 'Ditolak': 'red', 'Kedaluwarsa': 'slate', 'Habis': 'slate', 'Nonaktif': 'slate'
  };
  return '<span class="badge b-' + (map[status] || 'slate') + '">' + esc(status) + '</span>';
}

/* ---------------------------------------------------------------- Keranjang (Prinsip 2: optimistic + localStorage) */
const Cart = {
  items: Store.get('cart', []),
  key(id, v) { return id + '::' + (v || ''); },
  save() { Store.set('cart', this.items); this.emit(); },
  emit() { document.dispatchEvent(new CustomEvent('cart:change')); updateCartBadge(); },
  add(p, qty = 1, varian = '') {
    const k = this.key(p.id, varian), it = this.items.find(x => x.k === k);
    const price = priceOf(p, varian);
    if (it) it.qty = Math.min(999, it.qty + qty);
    else this.items.push({ k, id: p.id, nama: p.nama, varian, harga: price, qty, kategori: p.kategori, tipe: p.tipe, foto: (p.foto || [])[0] || '' });
    this.save();
  },
  setQty(k, q) { const it = this.items.find(x => x.k === k); if (!it) return; it.qty = Math.max(1, Math.min(999, q)); this.save(); },
  remove(k) { this.items = this.items.filter(x => x.k !== k); this.save(); },
  clear() { this.items = []; this.save(); },
  count() { return this.items.reduce((s, x) => s + x.qty, 0); },
  /** Sinkronkan harga/nama dengan katalog terbaru (harga final tetap dihitung server). */
  reconcile() {
    if (!AppState.catalog) return;
    const map = {}; AppState.catalog.products.forEach(p => map[p.id] = p);
    let changed = false;
    this.items = this.items.filter(it => { const p = map[it.id]; if (!p) { changed = true; return false; } const pr = priceOf(p, it.varian); if (pr !== it.harga || p.nama !== it.nama) { it.harga = pr; it.nama = p.nama; changed = true; } it.tipe = p.tipe; return true; });
    if (changed) this.save();
  },
  subtotal() { return this.items.reduce((s, x) => s + x.harga * x.qty, 0); },
  needsShipping() { return this.items.some(x => x.tipe === 'fisik'); }
};
function priceOf(p, varian) { const v = (p.varian || []).find(x => x.nama === varian); return v && v.harga > 0 ? v.harga : p.harga; }
function stockOf(p, varian) { if (p.unlimited) return Infinity; const v = (p.varian || []).find(x => x.nama === varian); return v && v.stok != null ? v.stok : p.stok; }
function updateCartBadge() { const n = Cart.count(); $$('[data-cart-count]').forEach(b => { b.textContent = n > 99 ? '99+' : n; b.hidden = !n; }); }
window.addEventListener('storage', e => { if (e.key === LS_PREFIX + 'cart') { Cart.items = Store.get('cart', []); Cart.emit(); } });

/* ---------------------------------------------------------------- Katalog (boot + versi) */
const Catalog = {
  listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  apply(data, fromCache) {
    AppState.catalog = data;
    if (data && data.store && data.store.tema) Theme.apply(data.store.tema);
    Cart.reconcile();
    applyStoreIdentity();
    this.listeners.forEach(fn => { try { fn(data, fromCache); } catch (e) { console.error(e); } });
  },
  async load(force) {
    const c = Store.get('c:catalog', null);
    if (c && !AppState.catalog) this.apply(c.data, true);
    if (c && !force && Date.now() - c.t < 60000) return;
    const res = await api('boot', { v: c ? c.data.v : '' });
    if (res.success) {
      if (res.data.same) { c.t = Date.now(); Store.set('c:catalog', c); return; }
      Store.set('c:catalog', { t: Date.now(), data: res.data });
      this.apply(res.data, false);
    } else if (!c) this.listeners.forEach(fn => fn(null, false, res));
  },
  product(id) { return AppState.catalog && AppState.catalog.products.find(p => p.id === id); }
};
function applyStoreIdentity() {
  const s = AppState.catalog && AppState.catalog.store; if (!s) return;
  $$('[data-store-name]').forEach(e => e.textContent = s.toko_nama);
  $$('[data-store-logo]').forEach(e => { e.innerHTML = s.toko_logo ? '<img src="' + esc(imgUrl(s.toko_logo, 120)) + '" alt="">' : ic('shopping-bag'); });
}

/* ---------------------------------------------------------------- Boot */
/* ---------------------------------------------------------------- TEMA DINAMIS */
const Theme = {
  hex2rgb(h) { const n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; },
  rgb2hex(r) { return '#' + r.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase(); },
  mix(a, b, t) { const x = this.hex2rgb(a), y = this.hex2rgb(b); return this.rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); },
  lum(h) { return this.hex2rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); },
  contrast(a, b) { const x = this.lum(a), y = this.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); },
  /** Gelapkan warna sampai kontras terhadap putih ≥ target (WCAG). */
  ensure(h, target) { let c = h, i = 0; while (this.contrast(c, '#FFFFFF') < target && i++ < 20) c = this.mix(c, '#000000', 0.08); return c; },
  RADIUS: { tajam: ['8px', '6px'], standar: ['16px', '10px'], bulat: ['22px', '14px'] },
  derive(t) {
    const hex = /^#[0-9a-fA-F]{6}$/;
    const p0 = hex.test(t && t.primary) ? t.primary : '#7C3AED', s = hex.test(t && t.secondary) ? t.secondary : '#38BDF8';
    const p = this.ensure(p0, 4.5);                     // tombol teks putih selalu terbaca
    const neutral = this.mix(p, '#64748B', 0.55);
    const rad = this.RADIUS[(t && t.radius) || 'standar'] || this.RADIUS.standar;
    const sg = this.lum(s) > 0.6 ? this.ensure(s, 2.2) : s;   // ujung gradasi tidak terlalu terang untuk teks putih
    return {
      '--primary': p, '--primary-d': this.mix(p, '#000000', 0.22), '--primary-dd': this.mix(p, '#000000', 0.38), '--primary-light': this.mix(p, '#FFFFFF', 0.18),
      '--primary-rgb': this.hex2rgb(p).join(', '), '--sky': s, '--sky-rgb': this.hex2rgb(s).join(', '), '--ocean': this.ensure(this.mix(s, '#000000', 0.2), 3.2),
      '--tint': this.mix(p, '#FFFFFF', 0.88), '--tint2': this.mix(p, '#FFFFFF', 0.76), '--surface': this.mix(p, '#FFFFFF', 0.965),
      '--sky-tint': this.mix(s, '#FFFFFF', 0.86), '--sky-tint2': this.mix(s, '#FFFFFF', 0.7),
      '--text': this.mix(p, '#0B1020', 0.8), '--text-rgb': this.hex2rgb(this.mix(p, '#0B1020', 0.8)).join(', '), '--border': this.mix(neutral, '#FFFFFF', 0.83),
      '--sk1': this.mix(p, '#FFFFFF', 0.95), '--sk2': this.mix(p, '#FFFFFF', 0.9), '--row-hover': this.mix(p, '#FFFFFF', 0.975), '--bg-soft': this.mix(p, '#FFFFFF', 0.985), '--grid': this.mix(p, '#FFFFFF', 0.9),
      '--grad': 'linear-gradient(135deg, ' + p + ' 0%, ' + sg + ' 100%)', '--r-card': rad[0], '--r-ctl': rad[1]
    };
  },
  apply(t, opt) {
    const vars = this.derive(t || {}), root = document.documentElement.style;
    Object.keys(vars).forEach(k => root.setProperty(k, vars[k]));
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', vars['--primary']);
    if (!(opt && opt.preview)) { Store.set('tema', t); try { localStorage.setItem('etoko:tema-vars', JSON.stringify(vars)); } catch (e) { } }
    document.dispatchEvent(new CustomEvent('theme:change'));
  },
  css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
};

/* ---------------------------------------------------------------- PWA (gas-pwa-github) */
const PWA = {
  prompt: null,
  isIOS: /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream,
  standalone: () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  init() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing; if (!nw) return;
          nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) PWA.updateReady(nw); });
        });
      }).catch(e => console.warn('SW gagal:', e));
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && PWA._userUpdate) { reloaded = true; location.reload(); } });
    }
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); PWA.prompt = e; PWA.refresh(); });
    addEventListener('appinstalled', () => { PWA.prompt = null; PWA.refresh(); toast('Aplikasi terpasang di perangkat Anda.', 'success'); });
    document.addEventListener('click', e => { if (e.target.closest('[data-install]')) { e.preventDefault(); PWA.install(); } });
    PWA.refresh();
  },
  canInstall() { return !this.standalone() && (!!this.prompt || this.isIOS); },
  refresh() { $$('[data-install]').forEach(b => { b.hidden = !PWA.canInstall(); }); },
  async install() {
    if (this.prompt) { this.prompt.prompt(); const r = await this.prompt.userChoice; if (r.outcome === 'accepted') this.prompt = null; this.refresh(); return; }
    modal('<div class="modal-body center"><span class="big-ic">' + ic('smartphone') + '</span><h3 class="h3">Pasang di iPhone/iPad</h3><ol class="ios-steps"><li>Buka halaman ini di <b>Safari</b>.</li><li>Ketuk tombol <b>Bagikan</b> ' + ic('share') + ' di bawah layar.</li><li>Pilih <b>Tambahkan ke Layar Utama</b> ' + ic('square-plus') + '.</li><li>Ketuk <b>Tambah</b>. Ikon toko muncul seperti aplikasi.</li></ol></div><div class="modal-foot"><button class="btn btn-primary" data-close>Mengerti</button></div>', { cls: 'modal-sm' });
  },
  updateReady(worker) {
    const root = document.getElementById('toast-root'), el = document.createElement('div');
    el.className = 'toast toast-info'; el.innerHTML = ic('refresh-cw') + '<span>Versi baru tersedia.</span><button class="btn btn-sm btn-primary">Muat ulang</button>';
    root.appendChild(el); refreshIcons(el);
    el.querySelector('button').onclick = () => { PWA._userUpdate = true; worker.postMessage('SKIP_WAITING'); };
  }
};

document.addEventListener('DOMContentLoaded', () => {
  PWA.init();
  refreshIcons(document);
  updateCartBadge();
  if (!CONFIG_OK) document.getElementById('config-warning').hidden = false;
  warmUpServer(location.hash.indexOf('#/admin') === 0 ? 'admin' : 'pub');
  Catalog.load();
  window.addEventListener('hashchange', route);
  route();
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 120000) { warmUpServer(document.body.classList.contains('mode-admin') ? 'admin' : 'pub'); if (!document.body.classList.contains('mode-admin')) Catalog.load(); }
  });
});
