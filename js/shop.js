/* ============================================================================
 * E-TOKO — shop.js : Etalase publik (tanpa login)
 * Beranda · Detail Produk · Keranjang · Checkout · Konfirmasi & Invoice · Cek Pesanan
 * ========================================================================== */
'use strict';

const Shop = { query: '', cat: 'Semua', sort: 'populer', favs: new Set(Store.get('favs', [])) };

/* ----------------------------------------------------------- header & footer */
function setupChrome() {
  const q = $('#q');
  q.addEventListener('input', debounce(() => {
    Shop.query = q.value.trim();
    if (AppState.current !== 'home') go('');
    else renderGrid();
  }, 250));
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (AppState.current !== 'home') go(''); setTimeout(() => $('#grid') && $('#grid').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); } });
  $('#year').textContent = new Date().getFullYear();
  $$('[data-cat-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openCategorySheet(); }));
}
function renderChrome() {
  const c = AppState.catalog; if (!c) return;
  const s = c.store;
  const wa = s.toko_wa ? 'https://wa.me/' + s.toko_wa + '?text=' + encodeURIComponent('Halo ' + s.toko_nama + ', saya ingin bertanya.') : '';
  ['#waBtn', '#footWa', '#fabWa'].forEach(sel => { const a = $(sel); if (!a) return; if (wa) { a.href = wa; a.hidden = false; } else if (sel === '#fabWa') a.hidden = true; else a.removeAttribute('href'); });
  $('#footDesc').textContent = s.toko_deskripsi || '';
  $('#footAddr').textContent = s.toko_alamat || '';
  $('#footCats').innerHTML = c.categories.map(k => '<li><a href="#/?k=' + encodeURIComponent(k.nama) + '">' + esc(k.nama) + '</a></li>').join('');
  const pays = (s.bank_list || []).map(b => b.bank).concat(s.gateway ? ['QRIS', 'E-Wallet', 'Virtual Account'] : []);
  $('#footPay').innerHTML = pays.map(p => '<span class="pay-pill">' + esc(p) + '</span>').join('');
}
function openCategorySheet() {
  const c = AppState.catalog; if (!c) return;
  const m = modal('<div class="modal-head"><h3 class="h3">Pilih Kategori</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="modal-body cat-sheet">' +
    ['Semua'].concat(c.categories.map(k => k.nama)).map(n => '<button class="cat-tile" data-k="' + esc(n) + '">' + ic(n === 'Semua' ? 'layout-grid' : catIcon(n)) + '<span>' + esc(n) + '</span></button>').join('') + '</div>', { side: true, cls: 'sheet' });
  $$('[data-k]', m.el).forEach(b => b.onclick = () => { Shop.cat = b.dataset.k; m.close(); go(Shop.cat === 'Semua' ? '' : '?k=' + encodeURIComponent(Shop.cat)); renderGrid(); });
}

/* ----------------------------------------------------------- kartu produk */
function productCard(p) {
  const habis = !p.unlimited && p.stok <= 0;
  const fav = Shop.favs.has(p.id);
  const stokTxt = p.unlimited ? (p.tipe === 'digital' ? 'Tersedia — Instant Download' : 'Tersedia') : habis ? 'Habis' : (p.tipe === 'jasa' ? 'Tersedia — ' + p.stok + ' slot' : 'Tersedia — ' + p.stok + ' stok');
  const btn = habis ? '<button class="btn btn-soft btn-block" disabled>' + ic('ban') + 'Habis Terjual</button>'
    : (p.varian && p.varian.length ? '<a class="btn btn-soft btn-block" href="#/produk/' + encodeURIComponent(p.id) + '">' + ic('sliders-horizontal') + 'Pilih Varian</a>'
      : '<button class="btn btn-soft btn-block" data-add="' + esc(p.id) + '">' + ic(p.tipe === 'digital' ? 'download' : p.tipe === 'jasa' ? 'calendar-check' : 'shopping-cart') + '+ Keranjang</button>');
  return '<article class="pcard' + (habis ? ' is-out' : '') + '">' +
    '<a href="#/produk/' + encodeURIComponent(p.id) + '" class="pcard-media" aria-label="' + esc(p.nama) + '">' + productImg(p, 500) +
    '<span class="cat-pill">' + esc(p.kategori) + '</span>' + (habis ? '<span class="out-label">STOK HABIS</span>' : '') + '</a>' +
    '<button class="fav' + (fav ? ' on' : '') + '" data-fav="' + esc(p.id) + '" aria-label="Simpan ke favorit" aria-pressed="' + fav + '">' + ic('heart') + '</button>' +
    '<div class="pcard-body">' +
    (p.terjual ? '<div class="meta-sm">' + ic('flame') + 'Terjual ' + fmtNum(p.terjual) + (p.terjual >= 100 ? '+' : '') + '</div>' : '<div class="meta-sm">' + ic('sparkles') + 'Produk baru</div>') +
    '<a href="#/produk/' + encodeURIComponent(p.id) + '" class="pcard-title">' + esc(p.nama) + '</a>' +
    '<div class="price-row"><span class="price">' + fmtRp(p.harga) + '</span>' + (p.harga_coret > p.harga ? '<s class="strike">' + fmtRp(p.harga_coret) + '</s>' : '') + '</div>' +
    '<div class="stock ' + (habis ? 'out' : p.unlimited ? 'inf' : '') + '"><span class="sdot"></span>' + stokTxt + '</div>' + btn +
    '</div></article>';
}
function bindCardActions(root) {
  root.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const p = Catalog.product(add.dataset.add); if (!p) return;
      const inCart = Cart.items.filter(x => x.id === p.id).reduce((s, x) => s + x.qty, 0);
      if (inCart + 1 > stockOf(p, '')) { toast('Stok ' + p.nama + ' tidak mencukupi.', 'warning'); return; }
      Cart.add(p, 1, '');
      add.classList.add('pulse'); setTimeout(() => add.classList.remove('pulse'), 400);
      toast(p.nama + ' ditambahkan ke keranjang', 'success', 1800);
      return;
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const id = fav.dataset.fav;
      if (Shop.favs.has(id)) Shop.favs.delete(id); else Shop.favs.add(id);
      Store.set('favs', Array.from(Shop.favs));
      fav.classList.toggle('on'); fav.setAttribute('aria-pressed', Shop.favs.has(id));
      if (Shop.cat === 'Favorit') renderGrid();
    }
  });
}

/* ============================================================ BERANDA */
registerPage('home', {
  title: 'Beranda',
  template: () => `
  <div class="container">
    <section class="hero">
      <div class="hero-deco"></div>
      <span class="hero-tag"><span class="live-dot"></span>Etalase Multi-Kategori Indonesia</span>
      <h1 class="hero-h1" id="heroTitle">Belanja Semua Kebutuhan di Satu Toko</h1>
      <p class="hero-p" id="heroDesc">Jasa, Fashion, Elektronik, Digital & FnB — belanja langsung tanpa repot bikin akun.</p>
      <div class="hero-cta">
        <a href="#grid" class="btn btn-white" id="heroBtn">Lihat Produk Sekarang ${ic('arrow-down')}</a>
        <span class="hero-note">${ic('lock-open')} Checkout instan tanpa password</span>
      </div>
      <div class="hero-pills">
        <span>${ic('badge-check')} Pembayaran Terverifikasi</span>
        <span>${ic('message-circle')} Update via WA & Email</span>
        <span>${ic('shield-check')} Transaksi Aman</span>
      </div>
    </section>

    <div class="filter-bar">
      <div class="chips" id="chips" role="tablist" aria-label="Kategori"></div>
      <label class="sort">${ic('arrow-up-down')}<span class="sr-only">Urutkan</span>
        <select id="sortSel" aria-label="Urutkan produk">
          <option value="populer">Paling Populer</option>
          <option value="terbaru">Terbaru</option>
          <option value="murah">Harga Terendah</option>
          <option value="mahal">Harga Tertinggi</option>
        </select>
      </label>
    </div>
    <div class="result-info" id="resultInfo"></div>
    <div class="grid" id="grid">${'<div class="sk sk-card"></div>'.repeat(8)}</div>

    <section class="why">
      <span class="eyebrow">Kemudahan Berbelanja</span>
      <h2 class="h2">Mengapa Memilih <span data-store-name>E-TOKO</span>?</h2>
      <p class="muted">Didesain untuk kenyamanan belanja tanpa hambatan administratif yang rumit.</p>
      <div class="why-grid">
        <div class="why-card"><span class="why-ic">${ic('user-x')}</span><h3>Tanpa Wajib Bikin Akun</h3><p>Checkout cukup dengan nama, WhatsApp, dan email. Tidak perlu mengingat kata sandi.</p></div>
        <div class="why-card"><span class="why-ic sky">${ic('message-square-text')}</span><h3>Update via WA & Email</h3><p>Status pembayaran, pengiriman, hingga invoice PDF dikirim otomatis ke Anda.</p></div>
        <div class="why-card"><span class="why-ic">${ic('wallet')}</span><h3>Pembayaran Fleksibel</h3><p>Pembayaran otomatis (QRIS, VA, e-wallet) atau transfer bank dengan unggah bukti.</p></div>
        <div class="why-card"><span class="why-ic sky">${ic('search-check')}</span><h3>Lacak Pesanan Kapan Saja</h3><p>Cek riwayat pembelian hanya dengan nomor WhatsApp atau email Anda.</p></div>
      </div>
    </section>
    <section class="stats" id="stats"></section>
  </div>`,
  init(el) {
    bindCardActions(el);
    $('#sortSel', el).addEventListener('change', e => { Shop.sort = e.target.value; renderGrid(); });
    $('#chips', el).addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; Shop.cat = b.dataset.cat; renderChips(); renderGrid(); });
    $('#heroBtn', el).addEventListener('click', e => { e.preventDefault(); $('#chips').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  },
  show(el, parts, q) {
    if (q.k) Shop.cat = q.k;
    renderHome();
  }
});
function renderHome() {
  const el = $('.page[data-page="home"]'); if (!el) return;
  const c = AppState.catalog;
  if (!c) return;
  $('#heroTitle', el).textContent = c.store.toko_tagline || 'Belanja Semua Kebutuhan di Satu Toko';
  $('#heroDesc', el).textContent = c.store.toko_deskripsi || '';
  renderChips(); renderGrid();
  const sold = c.products.reduce((s, p) => s + (p.terjual || 0), 0);
  $('#stats', el).innerHTML = '<div><b>' + fmtNum(sold) + '+</b><span>Produk Terjual</span></div><div><b>' + fmtNum(c.products.length) + '</b><span>Produk Aktif</span></div><div><b>' + c.categories.length + '</b><span>Kategori Pilihan</span></div>';
}
function renderChips() {
  const c = AppState.catalog, box = $('#chips'); if (!c || !box) return;
  const counts = {}; c.products.forEach(p => counts[p.kategori] = (counts[p.kategori] || 0) + 1);
  const list = [{ nama: 'Semua', ikon: 'layout-grid', n: c.products.length }].concat(c.categories.map(k => ({ nama: k.nama, ikon: catIcon(k.nama), n: counts[k.nama] || 0 })));
  if (Shop.favs.size) list.push({ nama: 'Favorit', ikon: 'heart', n: Shop.favs.size });
  box.innerHTML = list.map(k => '<button class="chip' + (Shop.cat === k.nama ? ' active' : '') + '" role="tab" aria-selected="' + (Shop.cat === k.nama) + '" data-cat="' + esc(k.nama) + '">' + ic(k.ikon) + esc(k.nama) + '<span class="chip-n">' + k.n + '</span></button>').join('');
}
function filteredProducts() {
  const c = AppState.catalog; if (!c) return [];
  const q = Shop.query.toLowerCase();
  let list = c.products.filter(p =>
    (Shop.cat === 'Semua' || (Shop.cat === 'Favorit' ? Shop.favs.has(p.id) : p.kategori === Shop.cat)) &&
    (!q || (p.nama + ' ' + p.kategori + ' ' + (p.deskripsi || '') + ' ' + (p.sku || '')).toLowerCase().includes(q)));
  const avail = p => (p.unlimited || p.stok > 0) ? 0 : 1;
  const sorters = {
    populer: (a, b) => avail(a) - avail(b) || (b.unggulan - a.unggulan) || (b.terjual - a.terjual),
    terbaru: (a, b) => avail(a) - avail(b) || String(b.created_at).localeCompare(String(a.created_at)),
    murah: (a, b) => avail(a) - avail(b) || a.harga - b.harga,
    mahal: (a, b) => avail(a) - avail(b) || b.harga - a.harga
  };
  return list.sort(sorters[Shop.sort] || sorters.populer);
}
function renderGrid() {
  const grid = $('#grid'); if (!grid || !AppState.catalog) return;
  const list = filteredProducts();
  const info = $('#resultInfo');
  info.innerHTML = Shop.query ? 'Hasil pencarian <b>"' + esc(Shop.query) + '"</b> — ' + list.length + ' produk <button class="link" id="clearQ">Hapus pencarian</button>' : '';
  const cq = $('#clearQ'); if (cq) cq.onclick = () => { Shop.query = ''; $('#q').value = ''; renderGrid(); };
  if (!list.length) {
    grid.innerHTML = '<div class="empty"><div class="empty-art">' + ic('package-search') + '</div><h3>Produk tidak ditemukan</h3><p class="muted">Coba kata kunci lain atau pilih kategori berbeda.</p><button class="btn btn-primary" id="resetF">Lihat Semua Produk</button></div>';
    $('#resetF').onclick = () => { Shop.query = ''; Shop.cat = 'Semua'; $('#q').value = ''; renderChips(); renderGrid(); };
    return;
  }
  grid.innerHTML = list.map(productCard).join('');
}

/* ============================================================ DETAIL PRODUK */
const Detail = { id: '', varian: '', qty: 1, img: 0 };
registerPage('produk', {
  title: parts => { const p = Catalog.product(parts[1]); return p ? p.nama : 'Detail Produk'; },
  template: () => '<div class="container" id="detailBox"></div>',
  init(el) {
    bindCardActions(el);
    el.addEventListener('click', e => {
      const p = Catalog.product(Detail.id); if (!p) return;
      const v = e.target.closest('[data-var]');
      if (v) { Detail.varian = v.dataset.var; Detail.qty = 1; renderDetail(); return; }
      const th = e.target.closest('[data-thumb]');
      if (th) { Detail.img = +th.dataset.thumb; renderDetail(); return; }
      const st = e.target.closest('[data-step]');
      if (st) { const max = stockOf(p, Detail.varian); Detail.qty = Math.max(1, Math.min(max === Infinity ? 999 : max, Detail.qty + (+st.dataset.step))); $('#dQty').value = Detail.qty; return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) { $$('[data-tab]', el).forEach(t => t.classList.toggle('active', t === tab)); $$('[data-pane]', el).forEach(pn => pn.hidden = pn.dataset.pane !== tab.dataset.tab); return; }
      const act = e.target.closest('[data-buy]');
      if (act) {
        if (p.varian.length && !Detail.varian) { toast('Pilih varian terlebih dahulu.', 'warning'); return; }
        const inCart = Cart.items.filter(x => x.id === p.id && x.varian === Detail.varian).reduce((s, x) => s + x.qty, 0);
        if (inCart + Detail.qty > stockOf(p, Detail.varian)) { toast('Stok tidak mencukupi (tersisa ' + stockOf(p, Detail.varian) + ').', 'warning'); return; }
        Cart.add(p, Detail.qty, Detail.varian);
        if (act.dataset.buy === 'now') go('checkout');
        else toast(p.nama + ' (' + Detail.qty + ') ditambahkan ke keranjang', 'success', 2000);
      }
    });
    el.addEventListener('change', e => { if (e.target.id === 'dQty') { const p = Catalog.product(Detail.id), max = stockOf(p, Detail.varian); Detail.qty = Math.max(1, Math.min(max === Infinity ? 999 : max, parseInt(e.target.value, 10) || 1)); e.target.value = Detail.qty; } });
  },
  show(el, parts) {
    if (Detail.id !== parts[0]) { Detail.id = parts[0]; Detail.varian = ''; Detail.qty = 1; Detail.img = 0; }
    renderDetail();
  }
});
function renderDetail() {
  const box = $('#detailBox'); if (!box) return;
  if (!AppState.catalog) { box.innerHTML = '<div class="detail"><div class="sk sk-media"></div><div><div class="sk sk-line w60"></div><div class="sk sk-line w40"></div><div class="sk sk-line"></div></div></div>'; return; }
  const p = Catalog.product(Detail.id);
  if (!p) { box.innerHTML = '<div class="empty"><div class="empty-art">' + ic('package-x') + '</div><h3>Produk tidak ditemukan</h3><p class="muted">Produk mungkin sudah tidak dijual.</p><a class="btn btn-primary" href="#/">Kembali ke Beranda</a></div>'; return; }
  if (p.varian.length === 1 && !Detail.varian) Detail.varian = p.varian[0].nama;
  const price = priceOf(p, Detail.varian), stok = stockOf(p, Detail.varian), habis = stok <= 0;
  const fotos = p.foto.length ? p.foto : [''];
  const main = fotos[Detail.img] ? productImg({ foto: [fotos[Detail.img]], kategori: p.kategori, nama: p.nama }, 900, 'big') : productImg(p, 900, 'big');
  const related = AppState.catalog.products.filter(x => x.kategori === p.kategori && x.id !== p.id).slice(0, 4);
  const tipeInfo = { fisik: 'Dikirim ke alamat Anda. Ongkos kirim flat ' + fmtRp(AppState.catalog.store.ongkir_flat) + (AppState.catalog.store.ongkir_gratis_min ? ', gratis untuk belanja ≥ ' + fmtRp(AppState.catalog.store.ongkir_gratis_min) : '') + '.', digital: 'Produk digital — tautan/berkas dikirim otomatis ke WhatsApp & email setelah pembayaran terverifikasi.', jasa: 'Layanan jasa — tim kami menghubungi Anda via WhatsApp untuk penjadwalan setelah pembayaran.' };
  box.innerHTML =
    '<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Beranda</a>' + ic('chevron-right') + '<a href="#/?k=' + encodeURIComponent(p.kategori) + '">' + esc(p.kategori) + '</a>' + ic('chevron-right') + '<span>' + esc(p.nama) + '</span></nav>' +
    '<div class="detail">' +
    '<div class="gallery"><div class="gallery-main">' + main + '</div>' +
    (p.foto.length > 1 ? '<div class="thumbs">' + p.foto.map((f, i) => '<button class="thumb' + (i === Detail.img ? ' active' : '') + '" data-thumb="' + i + '" aria-label="Foto ' + (i + 1) + '">' + productImg({ foto: [f], kategori: p.kategori, nama: p.nama }, 160) + '</button>').join('') + '</div>' : '') + '</div>' +
    '<div class="dinfo">' +
    '<span class="cat-pill static">' + ic(catIcon(p.kategori)) + esc(p.kategori) + '</span>' +
    '<h1 class="h1">' + esc(p.nama) + '</h1>' +
    '<div class="meta-sm">' + (p.terjual ? ic('flame') + 'Terjual ' + fmtNum(p.terjual) + ' · ' : '') + 'SKU ' + esc(p.sku || '-') + '</div>' +
    '<div class="dprice"><span class="price xl">' + fmtRp(price) + '</span>' + (p.harga_coret > price ? '<s class="strike">' + fmtRp(p.harga_coret) + '</s><span class="badge b-green">-' + Math.round((1 - price / p.harga_coret) * 100) + '%</span>' : '') + '</div>' +
    '<div class="stock big ' + (habis ? 'out' : p.unlimited ? 'inf' : '') + '"><span class="sdot"></span>' + (habis ? 'Stok habis' : p.unlimited ? 'Tersedia' : 'Tersedia — ' + stok + (p.tipe === 'jasa' ? ' slot' : ' stok')) + '</div>' +
    (p.varian.length ? '<div class="field"><span class="label">Pilih Varian</span><div class="var-pills">' + p.varian.map(v => { const vs = p.unlimited ? 1 : (v.stok == null ? p.stok : v.stok); return '<button class="var-pill' + (Detail.varian === v.nama ? ' active' : '') + '" data-var="' + esc(v.nama) + '"' + (vs <= 0 ? ' disabled' : '') + '>' + esc(v.nama) + (v.harga > 0 && v.harga !== p.harga ? ' · ' + fmtRp(v.harga) : '') + '</button>'; }).join('') + '</div></div>' : '') +
    '<div class="field"><span class="label">Jumlah</span><div class="stepper big"><button data-step="-1" aria-label="Kurangi">' + ic('minus') + '</button><input id="dQty" type="number" min="1" value="' + Detail.qty + '" aria-label="Jumlah"><button data-step="1" aria-label="Tambah">' + ic('plus') + '</button></div></div>' +
    '<div class="dactions"><button class="btn btn-primary btn-lg btn-block" data-buy="cart"' + (habis ? ' disabled' : '') + '>' + ic('shopping-cart') + 'Tambah ke Keranjang</button>' +
    '<button class="btn btn-outline btn-lg btn-block" data-buy="now"' + (habis ? ' disabled' : '') + '>' + ic('zap') + 'Beli Sekarang</button></div>' +
    '<div class="assure">' + ic('shield-check') + '<span>Transaksi aman · Notifikasi otomatis via WhatsApp & Email</span></div>' +
    '</div></div>' +
    '<div class="tabs"><button class="tab active" data-tab="desc">Deskripsi</button><button class="tab" data-tab="info">Info Pengiriman / Layanan</button></div>' +
    '<div class="tab-pane prose" data-pane="desc">' + esc(p.deskripsi || 'Belum ada deskripsi.').replace(/\n/g, '<br>') + '</div>' +
    '<div class="tab-pane prose" data-pane="info" hidden>' + esc(tipeInfo[p.tipe] || tipeInfo.fisik) + '</div>' +
    (related.length ? '<h2 class="h2 mt-8">Produk Serupa</h2><div class="grid">' + related.map(productCard).join('') + '</div>' : '');
}

/* ============================================================ KERANJANG */
const Voucher = { kode: Store.get('voucher', ''), diskon: 0, ket: '' };
registerPage('keranjang', {
  title: 'Keranjang',
  template: () => `
  <div class="container">
    <nav class="crumbs"><a href="#/">Beranda</a>${ic('chevron-right')}<span>Keranjang Belanja</span></nav>
    <div class="page-head"><h1 class="h1">Keranjang Belanja <span class="badge b-violet" id="cartN"></span></h1><span class="secure-pill">${ic('shield-check')}Transaksi Aman & Terenkripsi</span></div>
    <div class="cart-layout" id="cartBox"></div>
  </div>`,
  init(el) {
    document.addEventListener('cart:change', () => { if (AppState.current === 'keranjang') renderCart(); });
    el.addEventListener('click', async e => {
      const st = e.target.closest('[data-qstep]');
      if (st) { const it = Cart.items.find(x => x.k === st.dataset.k), p = Catalog.product(it.id); const nq = it.qty + (+st.dataset.qstep); if (p && nq > stockOf(p, it.varian)) { toast('Stok tersisa ' + stockOf(p, it.varian) + '.', 'warning'); return; } if (nq < 1) return; Cart.setQty(it.k, nq); return; }
      const rm = e.target.closest('[data-rm]');
      if (rm) { const it = Cart.items.find(x => x.k === rm.dataset.rm); Cart.remove(rm.dataset.rm); toast((it ? it.nama : 'Item') + ' dihapus', 'info', 1800); return; }
      if (e.target.closest('#clearCart')) { if (await confirmDialog('Kosongkan keranjang?', 'Semua item akan dihapus dari keranjang.', 'Kosongkan', true)) Cart.clear(); return; }
      if (e.target.closest('#applyV')) { applyVoucher($('#vInput').value); return; }
      if (e.target.closest('#rmV')) { Voucher.kode = ''; Voucher.diskon = 0; Store.set('voucher', ''); renderCart(); }
    });
    el.addEventListener('keydown', e => { if (e.target.id === 'vInput' && e.key === 'Enter') applyVoucher(e.target.value); });
  },
  show() { renderCart(); if (Voucher.kode && !Voucher.diskon) applyVoucher(Voucher.kode, true); }
});
async function applyVoucher(kode, silent) {
  kode = String(kode || '').trim().toUpperCase();
  if (!kode) return;
  const btn = $('#applyV'); setBusy(btn, true, 'Cek...');
  const res = await api('voucherCheck', { kode, subtotal: Cart.subtotal() });
  setBusy(btn, false);
  if (res.success) { Voucher.kode = res.data.kode; Voucher.diskon = res.data.diskon; Voucher.ket = res.data.ket; Store.set('voucher', Voucher.kode); if (!silent) toast('Voucher ' + Voucher.kode + ' diterapkan', 'success'); }
  else { Voucher.kode = ''; Voucher.diskon = 0; Store.set('voucher', ''); if (!silent) toast(res.message, 'error'); }
  renderCart(); if (AppState.current === 'checkout') renderCheckoutSummary();
}
function shippingCost(sub) { const s = AppState.catalog ? AppState.catalog.store : { ongkir_flat: 0, ongkir_gratis_min: 0 }; if (!Cart.needsShipping()) return 0; return s.ongkir_gratis_min > 0 && sub - Voucher.diskon >= s.ongkir_gratis_min ? 0 : (s.ongkir_flat || 0); }
function summaryHtml(btnHtml) {
  const sub = Cart.subtotal(), dis = Math.min(Voucher.diskon, sub), ong = shippingCost(sub), tot = Math.max(0, sub - dis + ong);
  return '<div class="sum-row"><span>Total Harga (' + Cart.count() + ' barang)</span><b>' + fmtRp(sub) + '</b></div>' +
    (dis ? '<div class="sum-row"><span>Diskon Voucher ' + ic('ticket-percent') + '</span><b class="txt-green">-' + fmtRp(dis) + '</b></div>' : '') +
    '<div class="sum-row"><span>Ongkos Kirim</span>' + (Cart.needsShipping() ? (ong ? '<b>' + fmtRp(ong) + '</b>' : '<span class="badge b-green">GRATIS</span>') : '<span class="muted small">Tidak perlu kirim</span>') + '</div>' +
    '<div class="sum-total"><div><b>Total Tagihan</b><small>Harga final dihitung ulang oleh sistem</small></div><span class="price xl">' + fmtRp(tot) + '</span></div>' + (btnHtml || '');
}
function renderCart() {
  const box = $('#cartBox'); if (!box) return;
  $('#cartN').textContent = Cart.count() + ' Item';
  if (!Cart.items.length) {
    box.innerHTML = '<div class="empty wide"><div class="empty-art">' + ic('shopping-bag') + '</div><h3>Keranjang masih kosong</h3><p class="muted">Yuk, temukan produk favoritmu di etalase.</p><a class="btn btn-primary" href="#/">Mulai Belanja</a></div>';
    return;
  }
  const s = AppState.catalog ? AppState.catalog.store : {};
  box.innerHTML =
    '<div class="card cart-list"><div class="cart-head"><span><b>' + Cart.items.length + '</b> produk di keranjang</span><button class="link danger" id="clearCart">' + ic('trash-2') + 'Hapus Semua</button></div>' +
    Cart.items.map(it => {
      const p = Catalog.product(it.id) || it;
      return '<div class="cart-item">' + productImg({ foto: it.foto ? [it.foto] : [], kategori: it.kategori, nama: it.nama }, 200, 'sm') +
        '<div class="ci-info"><div class="ci-meta"><span class="cat-pill static sm t-' + catTone(it.kategori) + '">' + esc(it.kategori) + '</span>' + (it.tipe === 'digital' ? '<span class="meta-sm">' + ic('zap') + 'Pengiriman Otomatis</span>' : '') + '</div>' +
        '<a href="#/produk/' + encodeURIComponent(it.id) + '" class="ci-name">' + esc(it.nama) + '</a>' + (it.varian ? '<div class="ci-var">Varian: <b>' + esc(it.varian) + '</b></div>' : '') +
        '<div class="price">' + fmtRp(it.harga * it.qty) + (it.qty > 1 ? ' <small class="muted">(' + fmtRp(it.harga) + ' / pcs)</small>' : '') + '</div></div>' +
        '<div class="ci-act"><div class="stepper"><button data-qstep="-1" data-k="' + esc(it.k) + '" aria-label="Kurangi"' + (it.qty <= 1 ? ' disabled' : '') + '>' + ic('minus') + '</button><span>' + it.qty + '</span><button data-qstep="1" data-k="' + esc(it.k) + '" aria-label="Tambah"' + (p.unlimited === false && it.qty >= stockOf(p, it.varian) ? ' disabled' : '') + '>' + ic('plus') + '</button></div>' +
        '<button class="iconbtn" data-rm="' + esc(it.k) + '" aria-label="Hapus ' + esc(it.nama) + '">' + ic('trash-2') + '</button></div></div>';
    }).join('') +
    (s.vouchers_ada || Voucher.kode ? '<div class="voucher-box"><span class="label">Kupon Promo & Voucher Diskon</span>' +
      (Voucher.kode ? '<div class="voucher-ok">' + ic('circle-check') + '<div><b>' + esc(Voucher.kode) + '</b><small>' + esc(Voucher.ket || 'Voucher diterapkan') + '</small></div><b class="txt-green">-' + fmtRp(Voucher.diskon) + '</b><button class="iconbtn" id="rmV" aria-label="Hapus voucher">' + ic('x') + '</button></div>'
        : '<div class="voucher-in"><label class="input-ic">' + ic('ticket') + '<input id="vInput" placeholder="Masukkan kode voucher" autocomplete="off"></label><button class="btn btn-primary" id="applyV">Terapkan</button></div>') + '</div>' : '') +
    '</div>' +
    '<aside class="card summary sticky"><h3 class="h3 with-ic"><span class="ic-box">' + ic('shopping-cart') + '</span>Ringkasan Pesanan</h3>' + summaryHtml('<a class="btn btn-primary btn-lg btn-block" href="#/checkout">Lanjut ke Checkout ' + ic('arrow-right') + '</a>') +
    '<div class="info-box sky">' + ic('zap') + '<div><b>Belanja Instan Tanpa Login!</b><p>Data kontak & alamat diisi cepat pada langkah checkout berikutnya.</p></div></div>' +
    '</aside>' +
    '<div class="trust-row"><div>' + ic('truck') + '<span><b>Ongkir Hemat</b><small>Gratis mulai ' + fmtRp(s.ongkir_gratis_min || 0) + '</small></span></div><div>' + ic('shield-check') + '<span><b>Pembayaran Terverifikasi</b><small>Diperiksa sebelum diproses</small></span></div><div>' + ic('headset') + '<span><b>Layanan via WhatsApp</b><small>Bantuan cepat & ramah</small></span></div></div>';
  refreshIcons(box);
}

/* ============================================================ CHECKOUT */
const Ck = { metode: '', bukti: null, busy: false, reqId: '' };
registerPage('checkout', {
  title: 'Checkout',
  template: () => `
  <div class="container">
    <ol class="stepper-steps" aria-label="Langkah checkout">
      <li class="done"><span>${ic('check')}</span>Keranjang</li>
      <li class="active"><span>2</span>Data & Pembayaran</li>
      <li><span>3</span>Selesai</li>
    </ol>
    <div class="ck-layout" id="ckBox"></div>
  </div>`,
  init(el) {
    el.addEventListener('input', debounce(e => { if (e.target.closest('#ckForm')) saveDraft(); }, 400));
    el.addEventListener('click', e => {
      const pm = e.target.closest('[data-pm]');
      if (pm && !pm.classList.contains('disabled')) { Ck.metode = pm.dataset.pm; renderPayment(); return; }
      const cp = e.target.closest('[data-copy]'); if (cp) { copyText(cp.dataset.copy); return; }
      if (e.target.closest('#rmBukti')) { Ck.bukti = null; renderPayment(); return; }
      if (e.target.closest('#ckSubmit')) submitCheckout();
    });
    el.addEventListener('change', async e => { if (e.target.id === 'buktiFile') handleBukti(e.target.files[0]); });
    el.addEventListener('dragover', e => { const dz = e.target.closest('.dropzone'); if (dz) { e.preventDefault(); dz.classList.add('over'); } });
    el.addEventListener('dragleave', e => { const dz = e.target.closest('.dropzone'); if (dz) dz.classList.remove('over'); });
    el.addEventListener('drop', e => { const dz = e.target.closest('.dropzone'); if (dz) { e.preventDefault(); dz.classList.remove('over'); handleBukti(e.dataTransfer.files[0]); } });
    document.addEventListener('cart:change', () => { if (AppState.current === 'checkout') renderCheckoutSummary(); });
  },
  show() { renderCheckout(); }
});
function saveDraft() { const f = $('#ckForm'); if (!f) return; const d = {}; new FormData(f).forEach((v, k) => d[k] = v); Store.set('buyer', d); }
async function handleBukti(file) {
  if (!file) return;
  try { Ck.bukti = Object.assign(await compressImage(file, 1400, 0.8), { size: file.size, type: file.type, preview: file.type !== 'application/pdf' }); renderPayment(); }
  catch (e) { toast(e.message, 'error'); }
}
function renderCheckout() {
  const box = $('#ckBox'); if (!box) return;
  if (!Cart.items.length) { box.innerHTML = '<div class="empty wide"><div class="empty-art">' + ic('shopping-cart') + '</div><h3>Keranjang kosong</h3><p class="muted">Tambahkan produk dulu sebelum checkout.</p><a class="btn btn-primary" href="#/">Lihat Produk</a></div>'; return; }
  const d = Store.get('buyer', {}), ship = Cart.needsShipping();
  const s = AppState.catalog ? AppState.catalog.store : {};
  if (!Ck.metode) Ck.metode = s.gateway ? 'gateway' : 'manual';
  if (Ck.metode === 'gateway' && !s.gateway) Ck.metode = 'manual';
  Ck.reqId = Ck.reqId || newReqId();
  box.innerHTML =
    '<form class="ck-main" id="ckForm" novalidate onsubmit="return false">' +
    '<section class="card"><h3 class="h3 with-ic"><span class="ic-box">' + ic('user-round') + '</span>Data Pembeli</h3>' +
    '<div class="form-grid">' +
    fieldHtml('nama', 'Nama Lengkap', 'text', d.nama, 'Nama sesuai identitas', true, 'span-2', 'name') +
    fieldHtml('hp', 'No. WhatsApp', 'tel', d.hp, '08xxxxxxxxxx', true, '', 'tel') +
    fieldHtml('email', 'Email', 'email', d.email, 'nama@email.com', true, '', 'email') +
    (ship ? '<div class="field span-2"><label class="label" for="f-alamat">Alamat Pengiriman <span class="req">*</span></label><textarea id="f-alamat" name="alamat" rows="3" placeholder="Nama jalan, nomor rumah, kelurahan, kecamatan, kota, kode pos" autocomplete="street-address">' + esc(d.alamat || '') + '</textarea><small class="err" data-err="alamat"></small></div>' : '') +
    '<div class="field span-2"><label class="label" for="f-catatan">Catatan <span class="muted">(opsional)</span></label><input id="f-catatan" name="catatan" value="' + esc(d.catatan || '') + '" placeholder="Mis. warna cadangan, jadwal jasa, dll."></div>' +
    '</div><div class="info-box sky mt-3">' + ic('info') + '<p>No. WhatsApp & email dipakai untuk melacak pesanan Anda — <b>tanpa perlu akun</b>.</p></div></section>' +
    '<section class="card"><h3 class="h3 with-ic"><span class="ic-box">' + ic('wallet') + '</span>Metode Pembayaran</h3><div id="payBox"></div></section>' +
    '</form>' +
    '<aside class="card summary sticky" id="ckSummary"></aside>';
  renderPayment(); renderCheckoutSummary();
  refreshIcons(box);
}
function fieldHtml(name, label, type, val, ph, req, cls, ac) {
  return '<div class="field ' + (cls || '') + '"><label class="label" for="f-' + name + '">' + label + (req ? ' <span class="req">*</span>' : '') + '</label><input id="f-' + name + '" name="' + name + '" type="' + type + '" value="' + esc(val || '') + '" placeholder="' + esc(ph) + '"' + (ac ? ' autocomplete="' + ac + '"' : '') + (type === 'tel' ? ' inputmode="tel"' : '') + '><small class="err" data-err="' + name + '"></small></div>';
}
function renderPayment() {
  const box = $('#payBox'); if (!box) return;
  const s = AppState.catalog ? AppState.catalog.store : {};
  const banks = (s.bank_list || []);
  box.innerHTML =
    '<div class="pay-options">' +
    '<button type="button" class="pay-card' + (Ck.metode === 'gateway' ? ' active' : '') + (s.gateway ? '' : ' disabled') + '" data-pm="gateway" aria-pressed="' + (Ck.metode === 'gateway') + '"' + (s.gateway ? '' : ' aria-disabled="true"') + '><span class="radio"></span><span class="pc-ic">' + ic('zap') + '</span><span><b>Bayar Otomatis</b><small>' + (s.gateway ? 'QRIS, Virtual Account, e-wallet — terverifikasi instan' : 'Sedang tidak tersedia') + '</small></span></button>' +
    '<button type="button" class="pay-card' + (Ck.metode === 'manual' ? ' active' : '') + '" data-pm="manual" aria-pressed="' + (Ck.metode === 'manual') + '"><span class="radio"></span><span class="pc-ic sky">' + ic('landmark') + '</span><span><b>Transfer Manual</b><small>Transfer bank lalu unggah bukti</small></span></button>' +
    '</div>' +
    (!s.gateway ? '<div class="info-box amber mt-3">' + ic('triangle-alert') + '<p>Pembayaran otomatis sedang tidak tersedia. Silakan gunakan transfer manual.</p></div>' : '') +
    (Ck.metode === 'manual' ? '<div class="bank-list">' + banks.map(b => '<div class="bank"><span class="bank-logo">' + esc(b.bank) + '</span><div><b class="mono">' + esc(b.no) + '</b><small>a.n. ' + esc(b.nama) + '</small></div><button type="button" class="btn btn-ghost btn-sm" data-copy="' + esc(b.no) + '">' + ic('copy') + 'Salin</button></div>').join('') + '</div>' +
      (Ck.bukti ? '<div class="file-ok">' + (Ck.bukti.preview ? '<img src="' + Ck.bukti.data + '" alt="Pratinjau bukti">' : '<span class="file-ic">' + ic('file-text') + '</span>') + '<div><b>' + esc(Ck.bukti.name) + '</b><small>Siap dikirim bersama pesanan</small></div><button type="button" class="iconbtn" id="rmBukti" aria-label="Hapus file">' + ic('x') + '</button></div>'
        : '<label class="dropzone" for="buktiFile">' + ic('cloud-upload') + '<b>Unggah Bukti Transfer</b><small>Seret file ke sini atau klik — JPG, PNG, PDF (maks 5 MB)</small><input id="buktiFile" type="file" accept="image/*,application/pdf" hidden></label><p class="muted small mt-2">Belum transfer? Anda tetap bisa membuat pesanan dan mengunggah bukti nanti dari halaman status pesanan.</p>') : '<div class="info-box violet mt-3">' + ic('shield-check') + '<p>Setelah klik <b>Buat Pesanan</b>, Anda diarahkan ke halaman pembayaran aman. Status otomatis berubah menjadi <b>Lunas</b> setelah pembayaran berhasil.</p></div>');
  refreshIcons(box);
}
function renderCheckoutSummary() {
  const box = $('#ckSummary'); if (!box) return;
  box.innerHTML = '<h3 class="h3">Ringkasan Pesanan</h3><div class="mini-items">' + Cart.items.map(it => '<div class="mini-item"><span>' + esc(it.nama) + (it.varian ? ' <small class="muted">(' + esc(it.varian) + ')</small>' : '') + ' <b>× ' + it.qty + '</b></span><span>' + fmtRp(it.harga * it.qty) + '</span></div>').join('') + '</div>' +
    summaryHtml('<label class="check mt-3"><input type="checkbox" id="agree" checked><span>Saya setuju dengan syarat & ketentuan toko</span></label><button class="btn btn-accent btn-lg btn-block" id="ckSubmit">' + ic('lock') + 'Buat Pesanan</button><a href="#/keranjang" class="link center mt-2">' + ic('arrow-left') + 'Kembali ke keranjang</a>');
  refreshIcons(box);
}
function validateCheckout() {
  const f = $('#ckForm'), d = {}; new FormData(f).forEach((v, k) => d[k] = String(v).trim());
  const errs = {};
  if ((d.nama || '').length < 2) errs.nama = 'Nama lengkap wajib diisi.';
  if (!normHp(d.hp)) errs.hp = 'Nomor WhatsApp tidak valid. Contoh: 081234567890.';
  if (!validEmail(d.email)) errs.email = 'Format email tidak valid.';
  if (Cart.needsShipping() && (d.alamat || '').length < 8) errs.alamat = 'Alamat lengkap wajib diisi untuk produk fisik.';
  $$('[data-err]', f).forEach(e => { e.textContent = errs[e.dataset.err] || ''; const inp = f.elements[e.dataset.err]; if (inp) { inp.classList.toggle('invalid', !!errs[e.dataset.err]); inp.setAttribute('aria-invalid', !!errs[e.dataset.err]); } });
  const first = Object.keys(errs)[0];
  if (first) { f.elements[first].focus(); return null; }
  return d;
}
async function submitCheckout() {
  if (Ck.busy) return;
  const d = validateCheckout(); if (!d) { toast('Lengkapi data pembeli terlebih dahulu.', 'warning'); return; }
  if (!$('#agree').checked) { toast('Centang persetujuan syarat & ketentuan.', 'warning'); return; }
  const btn = $('#ckSubmit'); Ck.busy = true; setBusy(btn, true, 'Membuat pesanan...');
  const payload = { buyer: d, items: Cart.items.map(it => ({ id: it.id, varian: it.varian, qty: it.qty, nama: it.nama })), metode: Ck.metode, voucher: Voucher.kode, returnUrl: location.href.split('#')[0] };
  if (Ck.metode === 'manual' && Ck.bukti) payload.bukti = { name: Ck.bukti.name, data: Ck.bukti.data };
  const res = await api('checkout', payload, { reqId: Ck.reqId });
  Ck.busy = false; setBusy(btn, false);
  if (!res.success) { toast(res.message || 'Gagal membuat pesanan.', 'error', 5000); if (/stok|tersedia|varian/i.test(res.message || '')) Catalog.load(true); return; }
  const o = res.data.order;
  const mine = Store.get('myorders', []); mine.unshift({ id: o.id, key: res.data.key, t: Date.now() }); Store.set('myorders', mine.slice(0, 20));
  Store.set('c:order:' + o.id, { t: Date.now(), h: '', data: { order: o, key: res.data.key } });
  Store.set('lastKontak', d.hp);
  Cart.clear(); Ck.bukti = null; Ck.reqId = ''; Voucher.kode = ''; Voucher.diskon = 0; Store.set('voucher', '');
  Catalog.load(true);
  if (res.data.payUrl) { toast('Mengarahkan ke halaman pembayaran...', 'info'); go('pesanan/' + o.id + '/' + res.data.key); setTimeout(() => { location.href = res.data.payUrl; }, 700); return; }
  if (res.data.gatewayGagal) toast('Halaman pembayaran otomatis gagal dibuat. Silakan transfer manual & unggah bukti.', 'warning', 6000);
  go('pesanan/' + o.id + '/' + res.data.key);
}

/* ============================================================ KONFIRMASI / STATUS PESANAN */
const OrderPg = { id: '', key: '', poll: null, pollN: 0, upBukti: null };
registerPage('pesanan', {
  title: 'Status Pesanan',
  template: () => '<div class="container narrow" id="orderBox"></div>',
  init(el) {
    el.addEventListener('click', async e => {
      const cp = e.target.closest('[data-copy]'); if (cp) { copyText(cp.dataset.copy); return; }
      if (e.target.closest('#btnPdf')) { const b = e.target.closest('#btnPdf'); setBusy(b, true, 'Menyiapkan PDF...'); const r = await api('invoicePdf', { id: OrderPg.id, key: OrderPg.key }); setBusy(b, false); if (r.success) { window.open(r.data.url, '_blank', 'noopener'); loadOrder(true); } else toast(r.message, 'error'); return; }
      if (e.target.closest('#btnCekBayar')) { const b = e.target.closest('#btnCekBayar'); setBusy(b, true, 'Mengecek...'); const r = await api('checkPayment', { id: OrderPg.id, key: OrderPg.key }); setBusy(b, false); if (r.success) { saveOrderCache(r.data.order); renderOrder(r.data.order); toast(r.data.order.status_bayar === 'Lunas' ? 'Pembayaran diterima. Terima kasih!' : 'Pembayaran belum terdeteksi.', r.data.order.status_bayar === 'Lunas' ? 'success' : 'info'); } else toast(r.message, 'error'); return; }
      if (e.target.closest('#btnKirimBukti')) { submitProof(e.target.closest('#btnKirimBukti')); return; }
      if (e.target.closest('#rmUp')) { OrderPg.upBukti = null; renderProofBox(); return; }
      if (e.target.closest('#btnPrint')) window.print();
    });
    el.addEventListener('change', async e => { if (e.target.id === 'upFile') { try { OrderPg.upBukti = await compressImage(e.target.files[0], 1400, 0.8); renderProofBox(); } catch (x) { toast(x.message, 'error'); } } });
    el.addEventListener('submit', e => { if (e.target.id === 'lookupForm') { e.preventDefault(); const k = e.target.kontak.value.trim(); lookupOrder(k); } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && AppState.current === 'pesanan') loadOrder(true); });
  },
  show(el, parts) {
    OrderPg.id = (parts[0] || '').toUpperCase(); OrderPg.key = parts[1] || '';
    if (!OrderPg.key) { const m = Store.get('myorders', []).find(x => x.id === OrderPg.id); if (m) OrderPg.key = m.key; }
    OrderPg.upBukti = null;
    loadOrder(false);
  }
});
function saveOrderCache(o) { Store.set('c:order:' + o.id, { t: Date.now(), h: hashStr(JSON.stringify(o)), data: { order: o, key: OrderPg.key } }); }
async function loadOrder(force) {
  const box = $('#orderBox'); if (!box) return;
  clearTimeout(OrderPg.poll);
  if (!OrderPg.key) { renderLookup(); return; }
  const cached = Store.get('c:order:' + OrderPg.id, null);
  if (!cached) box.innerHTML = '<div class="card"><div class="sk sk-line w60"></div><div class="sk sk-line w40"></div><div class="sk sk-block"></div></div>';
  const res = await swr('order:' + OrderPg.id, 'orderStatus', { id: OrderPg.id, key: OrderPg.key }, data => renderOrder(data.order), { fresh: force ? 0 : 15000, onError: r => { box.innerHTML = '<div class="card empty">' + '<div class="empty-art">' + ic('wifi-off') + '</div><h3>Gagal memuat pesanan</h3><p class="muted">' + esc(r.message) + '</p><button class="btn btn-primary" onclick="loadOrder(true)">Coba lagi</button></div>'; refreshIcons(box); } });
  // Polling hemat: hanya saat menunggu pembayaran gateway & tab terlihat
  const o = res && res.data && res.data.order;
  if (o && o.status_bayar === 'Menunggu Pembayaran' && o.metode === 'gateway' && OrderPg.pollN < 30) {
    OrderPg.poll = setTimeout(async () => {
      if (document.visibilityState !== 'visible' || AppState.current !== 'pesanan') return;
      OrderPg.pollN++;
      const r = await api('checkPayment', { id: OrderPg.id, key: OrderPg.key });
      if (r.success) { saveOrderCache(r.data.order); renderOrder(r.data.order); if (r.data.order.status_bayar === 'Lunas') toast('Pembayaran diterima. Terima kasih!', 'success'); else loadOrder(false); }
    }, Math.min(30000, 8000 + OrderPg.pollN * 2000));
  }
}
function renderLookup(msg) {
  const box = $('#orderBox');
  box.innerHTML = '<div class="card center-card"><span class="big-ic">' + ic('search-check') + '</span><h1 class="h2">Verifikasi Pesanan</h1><p class="muted">Masukkan No. WhatsApp atau email yang dipakai saat checkout untuk melihat pesanan <b>' + esc(OrderPg.id) + '</b>.</p>' +
    '<form id="lookupForm" class="lookup"><label class="input-ic">' + ic('smartphone') + '<input name="kontak" placeholder="08xx atau email@contoh.com" required autocomplete="tel"></label><button class="btn btn-primary">Lihat Pesanan</button></form>' + (msg ? '<p class="err mt-2">' + esc(msg) + '</p>' : '') + '</div>';
  refreshIcons(box);
}
async function lookupOrder(kontak) {
  const btn = $('#lookupForm button'); setBusy(btn, true, 'Mencari...');
  const r = await api('orderStatus', { id: OrderPg.id, kontak });
  setBusy(btn, false);
  if (!r.success) { renderLookup(r.message); return; }
  OrderPg.key = r.data.key;
  const mine = Store.get('myorders', []); mine.unshift({ id: OrderPg.id, key: r.data.key, t: Date.now() }); Store.set('myorders', mine.slice(0, 20));
  history.replaceState(null, '', '#/pesanan/' + OrderPg.id + '/' + r.data.key);
  saveOrderCache(r.data.order); renderOrder(r.data.order);
}
const STEPS = ['Pesanan Dibuat', 'Pembayaran Diterima', 'Diproses', 'Dikirim', 'Selesai'];
function orderStepIndex(o) {
  if (o.status_pesanan === 'Selesai') return 4;
  if (o.status_pesanan === 'Dikirim') return 3;
  if (o.status_bayar === 'Lunas') return o.status_pesanan === 'Diproses' ? 2 : 1;
  return 0;
}
function renderOrder(o) {
  const box = $('#orderBox'); if (!box || !o) return;
  const s = AppState.catalog ? AppState.catalog.store : { bank_list: [] };
  const lunas = o.status_bayar === 'Lunas', batal = o.status_pesanan === 'Dibatalkan';
  const needProof = !batal && o.metode !== 'gateway' && (o.status_bayar === 'Menunggu Pembayaran' || o.status_bayar === 'Ditolak');
  const needGateway = !batal && o.metode === 'gateway' && o.status_bayar === 'Menunggu Pembayaran';
  const head = batal ? ['circle-x', 'red', 'Pesanan Dibatalkan', 'Pesanan ini telah dibatalkan.']
    : lunas ? ['circle-check', 'green', o.status_pesanan === 'Selesai' ? 'Pesanan Selesai' : 'Pembayaran Diterima!', 'Terima kasih! Pesanan Anda ' + (o.status_pesanan === 'Selesai' ? 'telah selesai.' : 'sedang kami proses.')]
      : o.status_bayar === 'Menunggu Verifikasi' ? ['hourglass', 'amber', 'Menunggu Verifikasi', 'Bukti transfer sudah kami terima dan sedang diperiksa.']
        : ['circle-check', 'violet', 'Pesanan Berhasil Dibuat!', needGateway ? 'Selesaikan pembayaran agar pesanan segera diproses.' : 'Silakan transfer dan unggah bukti pembayaran.'];
  const step = orderStepIndex(o);
  box.innerHTML =
    '<div class="order-hero ' + head[1] + '"><span class="oh-ic">' + ic(head[0]) + '</span><h1 class="h2">' + head[2] + '</h1><p>' + head[3] + '</p>' +
    '<div class="oh-id">Nomor Pesanan: <b class="mono">' + esc(o.id) + '</b><button class="iconbtn sm" data-copy="' + esc(o.id) + '" aria-label="Salin nomor pesanan">' + ic('copy') + '</button></div>' +
    '<div class="oh-badges">' + badge(o.status_bayar) + badge(o.status_pesanan) + '</div></div>' +
    (!batal ? '<div class="card"><ol class="track">' + STEPS.map((t, i) => '<li class="' + (i < step ? 'done' : i === step ? 'now' : '') + '"><span class="tdot">' + (i < step ? ic('check') : i + 1) + '</span><span class="tlabel">' + t + '</span></li>').join('') + '</ol></div>' : '') +
    (needGateway ? '<div class="card pay-cta"><div><h3 class="h3">Selesaikan Pembayaran</h3><p class="muted">Total <b class="price">' + fmtRp(o.total) + '</b> — QRIS, Virtual Account, atau e-wallet.</p></div><div class="row-gap">' + (o.gateway_url ? '<a class="btn btn-accent btn-lg" href="' + esc(o.gateway_url) + '">' + ic('zap') + 'Bayar Sekarang</a>' : '') + '<button class="btn btn-outline" id="btnCekBayar">' + ic('refresh-cw') + 'Cek Pembayaran</button></div></div>' : '') +
    (needProof ? '<div class="card"><h3 class="h3 with-ic"><span class="ic-box">' + ic('landmark') + '</span>' + (o.status_bayar === 'Ditolak' ? 'Unggah Ulang Bukti Transfer' : 'Transfer & Unggah Bukti') + '</h3>' +
      (o.status_bayar === 'Ditolak' ? '<div class="info-box red">' + ic('circle-alert') + '<p>Bukti sebelumnya belum dapat diverifikasi. Silakan unggah bukti yang jelas.</p></div>' : '') +
      '<p class="muted">Transfer tepat <b class="price">' + fmtRp(o.total) + '</b> ke salah satu rekening:</p><div class="bank-list">' + (s.bank_list || []).map(b => '<div class="bank"><span class="bank-logo">' + esc(b.bank) + '</span><div><b class="mono">' + esc(b.no) + '</b><small>a.n. ' + esc(b.nama) + '</small></div><button class="btn btn-ghost btn-sm" data-copy="' + esc(b.no) + '">' + ic('copy') + 'Salin</button></div>').join('') + '</div><div id="proofBox"></div></div>' : '') +
    '<div class="card invoice" id="invoiceCard"><div class="inv-head"><div><span class="brand-mark sm" data-store-logo>' + ic('shopping-bag') + '</span><b>' + esc(storeName()) + '</b><small class="muted d-block">' + esc(s.toko_alamat || '') + '</small></div><div class="ta-r"><b>INVOICE</b><small class="d-block mono">' + esc(o.invoice_no) + '</small><small class="d-block muted">' + fmtDate(o.tanggal, true) + '</small></div></div>' +
    '<div class="inv-to"><small class="muted">Ditagihkan kepada</small><b>' + esc(o.nama) + '</b><small>' + esc(o.email || '') + (o.hp ? ' · ' + esc(o.hp) : '') + '</small>' + (o.alamat ? '<small>' + esc(o.alamat) + '</small>' : '') + '</div>' +
    '<table class="inv-table"><thead><tr><th>Produk</th><th class="ta-c">Qty</th><th class="ta-r">Harga</th><th class="ta-r">Subtotal</th></tr></thead><tbody>' +
    o.items.map(it => '<tr><td>' + esc(it.nama) + (it.varian ? '<small class="d-block muted">' + esc(it.varian) + '</small>' : '') + '</td><td class="ta-c">' + it.qty + '</td><td class="ta-r">' + fmtRp(it.harga) + '</td><td class="ta-r">' + fmtRp(it.harga * it.qty) + '</td></tr>').join('') +
    '</tbody></table><div class="inv-sum"><div><span>Subtotal</span><span>' + fmtRp(o.subtotal) + '</span></div>' + (o.diskon ? '<div><span>Diskon ' + esc(o.voucher || '') + '</span><span class="txt-green">-' + fmtRp(o.diskon) + '</span></div>' : '') + (o.ongkir ? '<div><span>Ongkos kirim</span><span>' + fmtRp(o.ongkir) + '</span></div>' : '') + '<div class="tot"><span>Total</span><span class="price">' + fmtRp(o.total) + '</span></div></div>' +
    (o.resi ? '<div class="info-box violet">' + ic('truck') + '<p>No. resi pengiriman: <b class="mono">' + esc(o.resi) + '</b> <button class="link" data-copy="' + esc(o.resi) + '">Salin</button></p></div>' : '') +
    '</div>' +
    '<div class="order-actions no-print"><button class="btn btn-primary" id="btnPdf">' + ic('file-down') + 'Unduh Invoice (PDF)</button><button class="btn btn-outline" id="btnPrint">' + ic('printer') + 'Cetak</button><a class="btn btn-ghost" href="#/">' + ic('house') + 'Kembali ke Beranda</a></div>' +
    (o.timeline && o.timeline.length ? '<div class="card no-print"><h3 class="h3">Riwayat Status</h3><ul class="timeline">' + o.timeline.slice().reverse().map(t => '<li><span class="tl-dot"></span><div><b>' + esc(t.a) + '</b><small class="muted">' + fmtDate(t.t, true) + '</small></div></li>').join('') + '</ul></div>' : '') +
    '<div class="info-box sky no-print">' + ic('message-circle') + '<p>Detail pesanan & pembaruan status dikirim otomatis ke WhatsApp dan email Anda. Simpan tautan halaman ini untuk mengecek kapan saja.</p></div>';
  if (needProof) renderProofBox();
  applyStoreIdentity();
  refreshIcons(box);
}
function renderProofBox() {
  const b = $('#proofBox'); if (!b) return;
  b.innerHTML = OrderPg.upBukti
    ? '<div class="file-ok">' + (/^data:image/.test(OrderPg.upBukti.data) ? '<img src="' + OrderPg.upBukti.data + '" alt="">' : '<span class="file-ic">' + ic('file-text') + '</span>') + '<div><b>' + esc(OrderPg.upBukti.name) + '</b><small>Siap dikirim</small></div><button class="iconbtn" id="rmUp" aria-label="Hapus">' + ic('x') + '</button></div><button class="btn btn-primary btn-block mt-3" id="btnKirimBukti">' + ic('send') + 'Kirim Bukti Transfer</button>'
    : '<label class="dropzone" for="upFile">' + ic('cloud-upload') + '<b>Pilih / Foto Bukti Transfer</b><small>JPG, PNG, atau PDF (maks 5 MB)</small><input id="upFile" type="file" accept="image/*,application/pdf" hidden></label>';
  refreshIcons(b);
}
async function submitProof(btn) {
  if (!OrderPg.upBukti) return;
  setBusy(btn, true, 'Mengunggah...');
  const r = await api('uploadProof', { id: OrderPg.id, key: OrderPg.key, bukti: OrderPg.upBukti });
  setBusy(btn, false);
  if (!r.success) { toast(r.message, 'error'); return; }
  OrderPg.upBukti = null; saveOrderCache(r.data.order); renderOrder(r.data.order); toast(r.message, 'success', 4000);
}

/* ============================================================ CEK PESANAN / RIWAYAT */
registerPage('cek', {
  title: 'Cek Pesanan',
  template: () => `
  <div class="container narrow">
    <div class="card center-card">
      <span class="big-ic">${ic('receipt')}</span>
      <h1 class="h2">Cek Riwayat Pesanan</h1>
      <p class="muted">Masukkan No. WhatsApp atau email yang dipakai saat checkout.</p>
      <form id="histForm" class="lookup"><label class="input-ic">${ic('smartphone')}<input name="kontak" id="histInput" placeholder="08xx / email@contoh.com" required></label><button class="btn btn-primary">${ic('search')}Cari</button></form>
    </div>
    <div id="histBox"></div>
  </div>`,
  init(el) {
    el.addEventListener('submit', e => { if (e.target.id === 'histForm') { e.preventDefault(); searchHistory(e.target.kontak.value.trim()); } });
  },
  show(el) {
    const last = Store.get('lastKontak', '');
    if (last && !$('#histInput').value) { $('#histInput').value = last; searchHistory(last, true); }
    else if (!last) renderMyOrders();
  }
});
function renderMyOrders() {
  const mine = Store.get('myorders', []);
  $('#histBox').innerHTML = mine.length ? '<h3 class="h3 mt-6">Pesanan dari perangkat ini</h3><div class="hist-list">' + mine.map(m => '<a class="card hist-mini" href="#/pesanan/' + m.id + '/' + m.key + '"><span class="mono"><b>' + esc(m.id) + '</b></span><small class="muted">' + timeAgo(m.t) + '</small>' + ic('chevron-right') + '</a>').join('') + '</div>' : '';
  refreshIcons($('#histBox'));
}
async function searchHistory(kontak, silent) {
  if (!normHp(kontak) && !validEmail(kontak)) { if (!silent) toast('Masukkan nomor WhatsApp atau email yang valid.', 'warning'); return; }
  Store.set('lastKontak', kontak);
  const box = $('#histBox');
  await swr('hist:' + kontak.toLowerCase(), 'history', { kontak }, data => {
    const list = data.orders || [];
    box.innerHTML = '<p class="result-info mt-6">Ditemukan <b>' + list.length + '</b> pesanan untuk <b>' + esc(kontak) + '</b></p>' + (list.length ? '<div class="hist-list">' + list.map(o =>
      '<a class="card hist-card" href="#/pesanan/' + o.id + '/' + o.key + '"><div class="hc-top"><div><b class="mono">' + esc(o.id) + '</b><small class="muted d-block">' + fmtDate(o.tanggal, true) + '</small></div><div class="hc-badges">' + badge(o.status_bayar) + badge(o.status_pesanan) + '</div></div>' +
      '<div class="hc-mid"><span>' + esc(o.items[0] ? o.items[0].nama : '') + (o.items.length > 1 ? ' <small class="muted">+' + (o.items.length - 1) + ' produk lain</small>' : '') + '</span><b class="price">' + fmtRp(o.total) + '</b></div>' +
      '<div class="hc-foot"><span>Lihat detail & invoice</span>' + ic('chevron-right') + '</div></a>').join('') + '</div>'
      : '<div class="empty"><div class="empty-art">' + ic('inbox') + '</div><h3>Belum ada pesanan dengan kontak ini</h3><p class="muted">Pastikan nomor/email sama seperti saat checkout.</p></div>');
    refreshIcons(box);
  }, { fresh: 20000, onError: r => { box.innerHTML = '<div class="empty"><h3>Gagal memuat</h3><p class="muted">' + esc(r.message) + '</p></div>'; } });
}

/* ============================================================ INIT */
Catalog.onChange((data, fromCache, err) => {
  if (!data) {
    const grid = $('#grid');
    if (grid) grid.innerHTML = '<div class="empty"><div class="empty-art">' + ic('wifi-off') + '</div><h3>Gagal memuat katalog</h3><p class="muted">' + esc(err ? err.message : '') + '</p><button class="btn btn-primary" onclick="Catalog.load(true)">Coba lagi</button></div>';
    return;
  }
  renderChrome();
  if (AppState.current === 'home') renderHome();
  if (AppState.current === 'produk') renderDetail();
  if (AppState.current === 'keranjang') renderCart();
  if (AppState.current === 'checkout') { renderPayment(); renderCheckoutSummary(); }
});
document.addEventListener('DOMContentLoaded', () => { setupChrome(); const sk = $('.boot-skeleton'); if (sk) sk.remove(); });
