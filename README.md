# E-TOKO — Etalase Multi-Kategori

Frontend SPA (HTML/CSS/JS vanilla) untuk GitHub Pages. Backend: Google Apps Script (REST API JSON).

- **Etalase publik:** `index.html#/`: beranda, detail produk, keranjang, checkout, status pesanan & invoice, cek riwayat (tanpa akun)
- **Dashboard admin:** `index.html#/admin`: ringkasan, produk & kategori, pesanan/E-Kasir (POS), CRM, **Kontak & CRM WA**, **WhatsApp & Notifikasi (blast/antrean)**, laporan, hak akses, integrasi + **tema warna**, **migrasi data**
- **PWA (v1.1):** bisa dipasang di HP seperti aplikasi (`manifest.json`, `sw.js`, `icons/`)

## Konfigurasi
Isi URL Web App Apps Script (`.../exec`) di `js/config.js`. Hanya nilai ini yang ada di frontend; semua kunci rahasia tersimpan di Script Properties backend.

## Struktur
```
index.html        shell SPA
css/style.css     desain etalase (Lumina Commerce)
css/admin.css     desain dashboard (dimuat malas)
js/config.js      URL backend
js/icons.js       subset ikon Lucide (ISC)
js/core.js        api(), cache SWR, router, keranjang, helper UI
js/shop.js        halaman etalase
js/admin.js       dashboard admin (dimuat malas)
manifest.json     identitas aplikasi PWA
sw.js             service worker (aset dari cache, API selalu dari jaringan)
icons/            ikon aplikasi 192/512/maskable/apple-touch
```

Versi 1.1.0. Panduan pembaruan: `PANDUAN-UPDATE-v1.1.md` (dikirim terpisah dari paket ini).
