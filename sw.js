/* E-TOKO Service Worker — buka instan dari cache, data selalu segar dari Google Apps Script. */
const VERSI = 'etoko-v1.1.0';
const ASET = [
  './', './index.html', './manifest.json',
  './css/style.css?v=1.1.0', './js/config.js?v=1.1.0', './js/icons.js?v=1.1.0', './js/core.js?v=1.1.0', './js/shop.js?v=1.1.0',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
const CACHE_GAMBAR = 'etoko-img', CACHE_FONT = 'etoko-font', MAKS_GAMBAR = 200;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(ASET)).catch(err => console.warn('Precache sebagian gagal:', err)));
  // Tidak skipWaiting otomatis: pengguna diberi tombol "Muat ulang" saat versi baru siap.
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('etoko-v') && k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

async function batasiCache(nama, maks) {
  const c = await caches.open(nama), keys = await c.keys();
  for (let i = 0; i < keys.length - maks; i++) await c.delete(keys[i]);
}
function staleWhileRevalidate(req, nama) {
  return caches.open(nama).then(c => c.match(req, { ignoreVary: true }).then(hit => {
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); if (nama === CACHE_GAMBAR) batasiCache(CACHE_GAMBAR, MAKS_GAMBAR); } return res; }).catch(() => hit);
    return hit || net;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 1) API Google Apps Script: JANGAN pernah dari cache
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;
  // 2) Foto produk (thumbnail Drive): tampil instan dari cache, diperbarui di latar
  if (url.hostname === 'drive.google.com' && url.pathname.indexOf('/thumbnail') === 0) { e.respondWith(staleWhileRevalidate(req, CACHE_GAMBAR)); return; }
  // 3) Font
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(caches.open(CACHE_FONT).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; })))); return; }
  if (url.origin !== self.location.origin) return;
  // 4) config.js: utamakan jaringan (agar perubahan GAS_URL langsung berlaku)
  if (url.pathname.endsWith('/js/config.js')) { e.respondWith(fetch(req).then(res => { caches.open(VERSI).then(c => c.put(req, res.clone())); return res; }).catch(() => caches.match(req, { ignoreSearch: true }))); return; }
  // 5) Navigasi: tampil instan dari cache + perbarui di latar; offline → index.html
  if (req.mode === 'navigate') { e.respondWith(staleWhileRevalidate(new Request('./index.html'), VERSI).then(r => r || caches.match('./index.html'))); return; }
  // 6) Aset lain (CSS/JS/ikon berversi ?v=): cache dulu, lalu jaringan
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) caches.open(VERSI).then(c => c.put(req, res.clone())); return res; })));
});
