/* ============================================================================
 * E-TOKO — admin.js : Dashboard Admin/Owner (dimuat malas saat membuka #/admin)
 * Ringkasan · Produk & Kategori · Form Produk · Pesanan/E-Kasir · CRM · Laporan
 * Hak Akses Admin (Owner) · Pengaturan & Integrasi (Owner)
 * v1.1: Kontak & CRM WhatsApp · WhatsApp & Notifikasi (blast/antrean) · Migrasi Data · Tema warna dinamis
 * ========================================================================== */
'use strict';
(function () {
  const Adm = {
    me: null, store: null, categories: [], badges: { verifikasi: 0, baru: 0 },
    products: null, orders: null, customers: null, admins: null, settings: null,
    current: '', pollT: null, pollGap: 20000, booted: false
  };
  const MOD_LABEL = {
    dashboard: ['Dashboard & Ringkasan Penjualan', 'Overview omzet harian & pesanan aktif', 'layout-dashboard'],
    produk: ['Manajemen Produk (Katalog, Stok, Harga)', 'Tambah, ubah stok & harga, hapus produk', 'package'],
    pesanan: ['E-Kasir & Manajemen Pesanan (POS)', 'Lihat pesanan, ubah status, transaksi kasir', 'shopping-basket'],
    verifikasi: ['Verifikasi Pembayaran & Bukti Transfer', 'Validasi bukti transfer → status Lunas', 'receipt-text'],
    crm: ['CRM & Data Pelanggan', 'Kontak WhatsApp, riwayat, catatan pelanggan', 'users'],
    laporan: ['Laporan Keuangan & Omzet', 'Grafik & tabel penjualan, produk terlaris', 'chart-column'],
    ekspor: ['Ekspor Data (CSV/Excel)', 'Unduh data pesanan, produk, pelanggan', 'file-down'],
    blast: ['WhatsApp Blast & Antrean Notifikasi', 'Kirim blast WA per batch, pantau antrean notifikasi', 'send']
  };
  const NAV = [
    { id: 'ringkasan', label: 'Ringkasan', icon: 'layout-dashboard', perm: 'dashboard' },
    { id: 'produk', label: 'Produk & Kategori', icon: 'package', perm: 'produk' },
    { id: 'pesanan', label: 'Pesanan / E-Kasir', icon: 'shopping-basket', perm: 'pesanan', badge: true },
    { id: 'crm', label: 'Customer CRM', icon: 'users', perm: 'crm' },
    { id: 'kontak', label: 'Kontak & CRM WA', icon: 'contact', perm: 'crm' },
    { id: 'notifikasi', label: 'WhatsApp & Notifikasi', icon: 'message-circle', perm: 'blast' },
    { id: 'laporan', label: 'Laporan Penjualan', icon: 'chart-column', perm: 'laporan' },
    { sep: 'Khusus Owner' },
    { id: 'akses', label: 'Hak Akses Admin', icon: 'shield-check', owner: true },
    { id: 'integrasi', label: 'Pengaturan & Integrasi', icon: 'settings-2', owner: true },
    { id: 'migrasi', label: 'Migrasi Data', icon: 'database-zap', owner: true }
  ];
  const isOwner = () => Adm.me && Adm.me.role === 'Owner';
  const can = (mod, lvl) => isOwner() || !!(Adm.me && Adm.me.izin && Adm.me.izin[mod] && Adm.me.izin[mod][lvl || 'lihat']);
  const akey = k => 'a:' + (Adm.me ? Adm.me.id : 'x') + ':' + k;
  const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const pct = (a, b) => b ? Math.round((a - b) / b * 1000) / 10 : (a ? 100 : 0);
  const ymd = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };

  /* ======================================================== SESI */
  function loadSession() {
    const s = Store.get('adm:session', null);
    if (s && s.exp > Date.now()) { AppState.token = s.token; Adm.me = s.me; return true; }
    return false;
  }
  function saveSession(token, me) { AppState.token = token; Adm.me = me; Store.set('adm:session', { token, me, exp: Date.now() + 11.5 * 3600e3 }); }
  function clearSession() { AppState.token = ''; Adm.me = null; Adm.booted = false; Store.del('adm:session'); Adm.products = Adm.orders = Adm.customers = Adm.admins = Adm.settings = null; }
  window.onSessionExpired = () => { if (!AppState.token) return; clearSession(); toast('Sesi berakhir. Silakan masuk kembali.', 'warning'); go('admin/login'); };
  function applyBoot(b) {
    Adm.me = b.me; Adm.store = b.store; Adm.categories = b.categories || []; Adm.badges = b.badges || Adm.badges;
    if (b.dashboard) Store.set('c:' + akey('dashboard'), { t: Date.now(), h: hashStr(JSON.stringify(b.dashboard)), data: b.dashboard });
    const s = Store.get('adm:session', null); if (s) { s.me = b.me; Store.set('adm:session', s); }
    Store.set('c:' + akey('boot'), { t: Date.now(), data: b });
    Adm.booted = true;
    renderShell();
  }
  async function ensureBoot() {
    if (Adm.booted) return;
    const c = Store.get('c:' + akey('boot'), null);
    if (c) { applyBoot(c.data); if (Date.now() - c.t < 60000) return; }
    const r = await api('adminBoot', {});
    if (r.success) applyBoot(r.data);
  }
  /** Prefetch menu yang sering dibuka dalam SATU panggilan saat idle (Prinsip 3). */
  function prefetch() {
    const calls = [];
    if (can('produk')) calls.push({ action: 'products' });
    if (can('pesanan')) calls.push({ action: 'orders' });
    if (can('crm')) calls.push({ action: 'customers' });
    if (!calls.length) return;
    const run = async () => {
      const r = await api('batch', { calls });
      if (!r.success) return;
      Object.keys(r.data).forEach(a => { const x = r.data[a]; if (x.success) { Store.set('c:' + akey(a), { t: Date.now(), h: hashStr(JSON.stringify(x.data)), data: x.data }); ingest(a, x.data); } });
    };
    if (window.requestIdleCallback) setTimeout(() => requestIdleCallback(run, { timeout: 3000 }), 800);
    else setTimeout(run, 1200);
  }
  function ingest(action, data) {
    if (action === 'products') { Adm.products = data.products; Adm.categories = data.categories; }
    if (action === 'orders') { Adm.orders = data.orders; Adm.badges = data.badges; renderBadges(); }
    if (action === 'customers') Adm.customers = data.customers;
  }
  /** SWR khusus admin: data disimpan ke state lalu halaman dirender. */
  function aswr(action, payload, render, opt) {
    const key = action + (opt && opt.suffix ? ':' + opt.suffix : '');
    return swr(akey(key), action, payload, (data, fromCache) => { ingest(action, data); render(data, fromCache); }, Object.assign({ fresh: 45000 }, opt || {}));
  }

  /* ======================================================== SHELL */
  function shellHtml() {
    return `
    <div class="adm" id="adm">
      <aside class="side" id="side">
        <div class="side-head"><span class="brand-mark" data-store-logo>${ic('store')}</span><div><b data-store-name>E-TOKO</b><small>Merchant Hub</small></div>
          <button class="iconbtn side-x" id="sideX" aria-label="Tutup menu">${ic('x')}</button></div>
        <nav class="side-nav" id="sideNav"></nav>
        <div class="side-user" id="sideUser"></div>
      </aside>
      <div class="side-bg" id="sideBg"></div>
      <div class="adm-main">
        <header class="adm-top">
          <button class="iconbtn adm-burger" id="burger" aria-label="Buka menu">${ic('menu')}</button>
          <div class="adm-crumb"><a href="#/admin">Dashboard</a>${ic('chevron-right')}<span id="crumb">E-TOKO Control</span></div>
          <label class="adm-search">${ic('search')}<input id="admQ" placeholder="Cari pesanan, SKU, atau customer (Ctrl+K)" aria-label="Pencarian global"></label>
          <button class="iconbtn" id="bell" aria-label="Notifikasi">${ic('bell')}<span class="bell-dot" id="bellDot" hidden></span></button>
          <a class="iconbtn" href="#/" target="_blank" rel="noopener" aria-label="Lihat toko" title="Lihat etalase">${ic('external-link')}</a>
          <button class="adm-avatar" id="avatarBtn" aria-label="Menu akun"><span class="av">${ic('user-round')}</span><span class="role-chip" id="roleChip">Owner</span></button>
        </header>
        <main class="adm-view" id="admView"></main>
      </div>
    </div>`;
  }
  function renderShell() {
    const sh = $('#adminShell');
    if (!$('#adm')) {
      sh.innerHTML = shellHtml();
      $('#burger').onclick = () => $('#adm').classList.add('side-open');
      $('#sideX').onclick = $('#sideBg').onclick = () => $('#adm').classList.remove('side-open');
      $('#bell').onclick = () => go('admin/pesanan?tab=verifikasi');
      $('#avatarBtn').onclick = accountMenu;
      const q = $('#admQ');
      q.addEventListener('keydown', e => { if (e.key === 'Enter' && q.value.trim()) globalSearch(q.value.trim()); });
      document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && document.body.classList.contains('mode-admin')) { e.preventDefault(); q.focus(); } });
      sh.addEventListener('click', e => { if (e.target.closest('.side-nav a')) $('#adm').classList.remove('side-open'); });
    }
    if (!Adm.me) return;
    $('#sideNav').innerHTML = NAV.map(n => {
      if (n.sep) return isOwner() ? '<div class="side-sep">' + ic('lock') + esc(n.sep) + '</div>' : '';
      if (n.owner && !isOwner()) return '';
      if (n.perm && !can(n.perm)) return '';
      return '<a href="#/admin/' + n.id + '" data-anav="' + n.id + '">' + ic(n.icon) + '<span>' + n.label + '</span>' + (n.badge ? '<span class="nav-badge" id="navBadge" hidden></span>' : '') + '</a>';
    }).join('');
    $('#sideUser').innerHTML = '<span class="av">' + esc(initials(Adm.me.nama)) + '</span><div><b>' + esc(Adm.me.nama) + '</b><small>' + esc(Adm.me.label || Adm.me.role) + '</small></div><button class="iconbtn" id="logoutBtn" aria-label="Keluar" title="Keluar">' + ic('log-out') + '</button>';
    $('#logoutBtn').onclick = logout;
    $('#roleChip').textContent = Adm.me.role === 'Owner' ? 'Owner' : (Adm.me.label || 'Admin');
    if (Adm.store) $$('#adminShell [data-store-name]').forEach(e => e.textContent = Adm.store.toko_nama);
    renderBadges(); markNav();
  }
  function renderBadges() {
    const b = $('#navBadge'); if (b) { const n = Adm.badges.verifikasi + Adm.badges.baru; b.textContent = n > 99 ? '99+' : n; b.hidden = !n; }
    const d = $('#bellDot'); if (d) d.hidden = !Adm.badges.verifikasi;
  }
  function markNav() { $$('[data-anav]').forEach(a => a.classList.toggle('active', a.dataset.anav === Adm.current)); }
  function accountMenu() {
    const m = modal('<div class="modal-head"><h3 class="h3">Akun Saya</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="modal-body"><div class="acc-card"><span class="av lg">' + esc(initials(Adm.me.nama)) + '</span><div><b>' + esc(Adm.me.nama) + '</b><small class="muted d-block">' + esc(Adm.me.email) + '</small>' + badge(Adm.me.role === 'Owner' ? 'Aktif' : 'Aktif').replace('Aktif', esc(Adm.me.label || Adm.me.role)) + '</div></div>' +
      '<h4 class="mt-6">Ganti Kata Sandi</h4><form id="pwForm" class="stack"><input type="password" name="lama" placeholder="Kata sandi lama" autocomplete="current-password" required><input type="password" name="baru" placeholder="Kata sandi baru (min 10, huruf+angka)" autocomplete="new-password" required><button class="btn btn-primary">' + ic('key-round') + 'Simpan Sandi Baru</button></form></div>' +
      '<div class="modal-foot"><button class="btn btn-danger-soft" id="accLogout">' + ic('log-out') + 'Keluar</button></div>', { cls: 'modal-sm' });
    m.el.querySelector('#accLogout').onclick = () => { m.close(); logout(); };
    m.el.querySelector('#pwForm').onsubmit = async e => {
      e.preventDefault(); const f = e.target, b = f.querySelector('button'); setBusy(b, true, 'Menyimpan...');
      const r = await api('changePassword', { lama: f.lama.value, baru: f.baru.value }); setBusy(b, false);
      if (r.success) { saveSession(r.data.token, Adm.me); toast(r.message, 'success'); m.close(); } else toast(r.message, 'error');
    };
  }
  async function logout() { if (!(await confirmDialog('Keluar dari dashboard?', 'Anda perlu masuk kembali untuk mengelola toko.', 'Keluar'))) return; clearSession(); go('admin/login'); }
  function globalSearch(q) {
    if (/^(ORD|POS)-/i.test(q)) { go('admin/pesanan?id=' + encodeURIComponent(q.toUpperCase())); return; }
    if (normHp(q) || validEmail(q)) { go('admin/crm?q=' + encodeURIComponent(q)); return; }
    if (can('produk') && Adm.products && Adm.products.some(p => (p.sku || '').toLowerCase() === q.toLowerCase())) { go('admin/produk?q=' + encodeURIComponent(q)); return; }
    go('admin/pesanan?q=' + encodeURIComponent(q));
  }

  /* ======================================================== ROUTER ADMIN */
  const APages = {};
  function apage(name, def) { APages[name] = def; }
  async function route(parts, q) {
    const shell = $('#adminShell');
    let name = parts[0] || 'ringkasan';
    if (name === 'login' || !loadSession()) {
      stopPoll();
      shell.innerHTML = loginHtml(); bindLogin(); refreshIcons(shell);
      document.title = 'Masuk Dashboard · ' + storeName();
      return;
    }
    if (!$('#adm')) { renderShell(); if (Adm.booted || Store.get('c:' + akey('boot'), null)) prefetch(); }
    ensureBoot();
    const def = APages[name];
    if (!def) name = 'ringkasan';
    const d = APages[name];
    if (d.owner && !isOwner()) { toast('Halaman ini khusus Owner.', 'warning'); go('admin'); return; }
    if (d.perm && !can(d.perm)) { const first = NAV.find(n => n.id && !n.owner && can(n.perm)); if (first && first.id !== name) { go('admin/' + first.id); return; } }
    const view = $('#admView');
    let el = view.querySelector('.apage[data-apage="' + name + '"]');
    if (!el) { el = document.createElement('section'); el.className = 'apage'; el.dataset.apage = name; el.innerHTML = d.template(); view.appendChild(el); d.init && d.init(el); refreshIcons(el); }
    view.querySelectorAll('.apage').forEach(p => p.hidden = p !== el);
    if (Adm.current === 'integrasi' && name !== 'integrasi' && ST.dirty) Theme.apply(Store.get('tema', null) || (Adm.store && Adm.store.tema) || {}, { preview: true });
    if (Adm.current !== name) $('.adm-main').scrollTop = 0, window.scrollTo(0, 0);
    Adm.current = name; markNav();
    $('#crumb').textContent = d.title;
    document.title = d.title + ' · Admin ' + storeName();
    stopPoll();
    d.show && d.show(el, parts.slice(1), q);
    refreshIcons(el);
  }

  /* ======================================================== LOGIN */
  function loginHtml() {
    return `
    <div class="login">
      <div class="login-art">
        <div class="la-in">
          <span class="brand-mark lg">${ic('store')}</span>
          <h1>Kelola toko Anda<br>dengan mudah.</h1>
          <p>Pesanan, pembayaran, stok, pelanggan, dan laporan — semua dalam satu dashboard yang cepat.</p>
          <ul><li>${ic('circle-check')}Verifikasi pembayaran sekali klik</li><li>${ic('circle-check')}Notifikasi WhatsApp & Email otomatis</li><li>${ic('circle-check')}Laporan penjualan real-time</li></ul>
        </div>
      </div>
      <div class="login-form">
        <form class="card login-card" id="loginForm" novalidate>
          <a href="#/" class="brand">${'<span class="brand-mark">' + ic('shopping-bag') + '</span>'}<span>${esc(storeName())}</span></a>
          <h2 class="h2">Masuk Dashboard</h2>
          <p class="muted">Halaman ini khusus Owner & staf toko.</p>
          <div class="info-box red" id="loginErr" hidden></div>
          <div class="field"><label class="label" for="lEmail">Email</label><label class="input-ic">${ic('mail')}<input id="lEmail" name="email" type="email" autocomplete="username" placeholder="nama@toko.id" required></label></div>
          <div class="field"><label class="label" for="lPass">Kata Sandi</label><label class="input-ic">${ic('lock')}<input id="lPass" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required><button type="button" class="iconbtn sm" id="togglePw" aria-label="Tampilkan sandi">${ic('eye')}</button></label></div>
          <div class="login-row"><label class="check"><input type="checkbox" checked disabled><span>Tetap masuk 12 jam</span></label><button type="button" class="link" id="forgot">Lupa kata sandi?</button></div>
          <button class="btn btn-primary btn-lg btn-block" id="loginBtn">${ic('log-in')}Masuk</button>
          <a href="#/" class="link center">${ic('arrow-left')}Kembali ke etalase</a>
        </form>
      </div>
    </div>`;
  }
  function bindLogin() {
    const f = $('#loginForm');
    $('#togglePw').onclick = () => { const p = $('#lPass'); p.type = p.type === 'password' ? 'text' : 'password'; };
    $('#forgot').onclick = () => modal('<div class="modal-body"><h3 class="h3">Lupa kata sandi?</h3><p class="muted"><b>Admin/staf:</b> minta Owner mengatur ulang sandi Anda dari menu <i>Hak Akses Admin → Reset Sandi</i>.</p><p class="muted"><b>Owner:</b> buka editor Apps Script, pilih fungsi <code>resetSandiOwner</code>, klik ▶ Run, lalu lihat sandi baru di Execution Log.</p></div><div class="modal-foot"><button class="btn btn-primary" data-close>Mengerti</button></div>', { cls: 'modal-sm' });
    f.onsubmit = async e => {
      e.preventDefault();
      const err = $('#loginErr'); err.hidden = true;
      const email = f.email.value.trim(), password = f.password.value;
      if (!validEmail(email) || !password) { err.innerHTML = ic('circle-alert') + '<p>Isi email dan kata sandi dengan benar.</p>'; err.hidden = false; return; }
      const b = $('#loginBtn'); setBusy(b, true, 'Memeriksa...');
      const r = await api('login', { email, password });
      setBusy(b, false);
      if (!r.success) { err.innerHTML = ic('circle-alert') + '<p>' + esc(r.message) + '</p>'; err.hidden = false; refreshIcons(err); return; }
      saveSession(r.data.token, r.data.boot.me);
      $('#adminShell').innerHTML = '';
      applyBoot(r.data.boot);
      toast(r.message, 'success');
      const first = can('dashboard') ? 'ringkasan' : (NAV.find(n => n.id && !n.owner && can(n.perm)) || { id: 'ringkasan' }).id;
      go('admin/' + first);
      prefetch();
    };
  }

  /* ======================================================== POLLING HEMAT (Prinsip 10) */
  function stopPoll() { clearTimeout(Adm.pollT); Adm.pollT = null; }
  function startPoll(fn) {
    stopPoll(); Adm.pollGap = 20000;
    const tick = async () => {
      if (document.visibilityState === 'visible' && document.body.classList.contains('mode-admin')) {
        const changed = await fn();
        Adm.pollGap = Activity.idle() ? 60000 : changed ? 20000 : Math.min(60000, Adm.pollGap + 10000);
      }
      Adm.pollT = setTimeout(tick, Adm.pollGap);
    };
    Adm.pollT = setTimeout(tick, Adm.pollGap);
  }
  async function refreshOrders(force) {
    const before = Adm.orders ? hashStr(JSON.stringify(Adm.orders)) : '';
    await aswr('orders', {}, () => { if (Adm.current === 'pesanan') renderOrders(); if (Adm.current === 'ringkasan') renderDashboard(); }, { fresh: force ? 0 : 15000 });
    return before !== (Adm.orders ? hashStr(JSON.stringify(Adm.orders)) : '');
  }

  /* ======================================================== GRAFIK SVG (tanpa library) */
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1); }
  function shortRp(n) { n = Number(n) || 0; if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + 'M'; if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'jt'; if (n >= 1e3) return Math.round(n / 1e3) + 'rb'; return String(n); }
  function lineChart(labels, series, opt = {}) {
    const W = 640, H = opt.h || 260, pl = 48, pr = 12, pt = 16, pb = 30;
    const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
    const x = i => pl + (labels.length < 2 ? 0 : i * (W - pl - pr) / (labels.length - 1));
    const y = v => pt + (H - pt - pb) * (1 - v / max);
    const smooth = pts => pts.map((p, i) => { if (!i) return 'M' + p[0] + ',' + p[1]; const q = pts[i - 1], cx = (q[0] + p[0]) / 2; return 'C' + cx + ',' + q[1] + ' ' + cx + ',' + p[1] + ' ' + p[0] + ',' + p[1]; }).join(' ');
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = max * i / 4, yy = y(v); g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '" class="grid-l"/><text x="' + (pl - 8) + '" y="' + (yy + 4) + '" class="ax" text-anchor="end">' + shortRp(v) + '</text>'; }
    labels.forEach((l, i) => { g += '<text x="' + x(i) + '" y="' + (H - 8) + '" class="ax' + (i === labels.length - 1 ? ' ax-hi' : '') + '" text-anchor="middle">' + esc(l) + '</text>'; });
    series.slice().reverse().forEach((s, si) => {
      const pts = s.values.map((v, i) => [x(i), y(v)]);
      const d = smooth(pts);
      if (s.area) g += '<path d="' + d + ' L' + x(s.values.length - 1) + ',' + y(0) + ' L' + x(0) + ',' + y(0) + 'Z" fill="url(#ga)" />';
      g += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.area ? 3 : 2.5) + '" stroke-linecap="round"/>';
    });
    labels.forEach((l, i) => { g += '<rect x="' + (x(i) - (W - pl - pr) / labels.length / 2) + '" y="' + pt + '" width="' + ((W - pl - pr) / labels.length) + '" height="' + (H - pt - pb) + '" fill="transparent" data-tip="' + esc(opt.tipLabels ? opt.tipLabels[i] : l) + '|' + series.map(s => s.name + ': ' + fmtRp(s.values[i])).join('|') + '"/>'; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="' + esc(opt.label || 'Grafik') + '"><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + Theme.css('--primary') + '" stop-opacity=".22"/><stop offset="1" stop-color="' + Theme.css('--primary') + '" stop-opacity="0"/></linearGradient></defs>' + g + '</svg>';
  }
  const palette = () => { const p = Theme.css('--primary') || '#7C3AED', k = Theme.css('--sky') || '#38BDF8'; return [p, k, Theme.mix(p, '#000000', .3), Theme.mix(k, '#000000', .3), Theme.mix(p, '#FFFFFF', .55), Theme.mix(k, '#FFFFFF', .5), Theme.mix(p, '#FFFFFF', .3)]; };
  function donut(items, center) {
    const total = items.reduce((s, x) => s + x.value, 0) || 1, R = 70, C = 2 * Math.PI * R, PALETTE = palette();
    let off = 0;
    const arcs = items.map((it, i) => { const len = it.value / total * C; const s = '<circle r="' + R + '" cx="90" cy="90" fill="none" stroke="' + PALETTE[i % PALETTE.length] + '" stroke-width="22" stroke-dasharray="' + Math.max(0, len - 2) + ' ' + (C - len + 2) + '" stroke-dashoffset="' + (-off) + '" data-tip="' + esc(it.label) + '|' + fmtRp(it.value) + ' (' + Math.round(it.value / total * 100) + '%)"/>'; off += len; return s; }).join('');
    return '<svg viewBox="0 0 180 180" class="donut" role="img" aria-label="Penjualan per kategori"><g transform="rotate(-90 90 90)"><circle r="' + R + '" cx="90" cy="90" fill="none" stroke="' + Theme.css('--tint') + '" stroke-width="22"/>' + arcs + '</g><text x="90" y="82" text-anchor="middle" class="dn-l">' + esc(center[0]) + '</text><text x="90" y="104" text-anchor="middle" class="dn-v">' + esc(center[1]) + '</text></svg>';
  }
  function barChart(labels, values, opt = {}) {
    const W = 760, H = opt.h || 240, pl = 48, pb = 28, pt = 12;
    const max = niceMax(Math.max(1, ...values)), n = values.length || 1, bw = (W - pl - 8) / n;
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = max * i / 4, yy = pt + (H - pt - pb) * (1 - i / 4); g += '<line x1="' + pl + '" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" class="grid-l"/><text x="' + (pl - 8) + '" y="' + (yy + 4) + '" class="ax" text-anchor="end">' + shortRp(v) + '</text>'; }
    const step = Math.ceil(n / 12);
    values.forEach((v, i) => {
      const h = (H - pt - pb) * v / max, xx = pl + i * bw + bw * .15, w = Math.max(2, bw * .7);
      g += '<rect x="' + xx + '" y="' + (H - pb - h) + '" width="' + w + '" height="' + Math.max(0, h) + '" rx="' + Math.min(6, w / 3) + '" class="bar' + (i === n - 1 ? ' hi' : '') + '" data-tip="' + esc(labels[i]) + '|' + fmtRp(v) + '"/>';
      if (i % step === 0) g += '<text x="' + (xx + w / 2) + '" y="' + (H - 8) + '" class="ax" text-anchor="middle">' + esc(opt.short ? opt.short(labels[i]) : labels[i]) + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="' + esc(opt.label || 'Grafik batang') + '"><defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + Theme.css('--primary-light') + '"/><stop offset="1" stop-color="' + Theme.css('--primary') + '"/></linearGradient></defs>' + g + '</svg>';
  }
  function spark(values, color) {
    if (!values.length) return '';
    const W = 120, H = 28, max = Math.max(...values, 1), min = Math.min(...values, 0);
    const pts = values.map((v, i) => (i * W / Math.max(1, values.length - 1)).toFixed(1) + ',' + (H - 3 - (H - 6) * (v - min) / Math.max(1, max - min)).toFixed(1)).join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="spark" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  // Tooltip grafik
  let tipEl;
  document.addEventListener('mousemove', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || !document.body.classList.contains('mode-admin')) { if (tipEl) tipEl.hidden = true; return; }
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
    const [h, ...rows] = t.dataset.tip.split('|');
    tipEl.innerHTML = '<b>' + esc(h) + '</b>' + rows.map(r => '<span>' + esc(r) + '</span>').join('');
    tipEl.hidden = false;
    const x = Math.min(window.innerWidth - tipEl.offsetWidth - 12, e.clientX + 14);
    tipEl.style.transform = 'translate(' + x + 'px,' + (e.clientY - tipEl.offsetHeight - 12) + 'px)';
  });

  /* ======================================================== CSV */
  function downloadCsv(name, header, rows) {
    if (!can('ekspor')) { toast('Anda tidak memiliki izin ekspor data.', 'warning'); return; }
    const escc = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [header].concat(rows).map(r => r.map(escc).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name + '_' + ymd(new Date()) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('File ' + a.download + ' diunduh (bisa dibuka di Excel).', 'success');
  }
  function parseCsv(text) {
    const rows = []; let row = [], cur = '', q = false;
    const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim().toLowerCase().replace(/^﻿/, ''));
    return rows.filter(r => r.join('').trim()).map(r => { const o = {}; head.forEach((h, i) => o[h] = (r[i] || '').trim()); return o; });
  }

  /* ======================================================== HELPER UI */
  function statCard(o) {
    return '<div class="stat' + (o.hero ? ' hero-stat' : '') + '"><div class="stat-top"><span class="stat-l">' + esc(o.label) + '</span><span class="stat-ic ' + (o.tone || '') + '">' + ic(o.icon) + '</span></div><div class="stat-v">' + o.value + (o.unit ? '<small>' + esc(o.unit) + '</small>' : '') + '</div>' +
      (o.sub ? '<div class="stat-sub">' + o.sub + '</div>' : '') + (o.spark || '') + '</div>';
  }
  function trendPill(p, txt) { const up = p >= 0; return '<span class="trend ' + (up ? 'up' : 'down') + '">' + ic(up ? 'trending-up' : 'trending-down') + (up ? '+' : '') + p + '%</span> <span>' + esc(txt) + '</span>'; }
  function pager(total, page, size, onAttr) {
    const pages = Math.max(1, Math.ceil(total / size)); if (pages <= 1) return '<div class="pager"><span class="muted small">Menampilkan ' + total + ' data</span></div>';
    const from = (page - 1) * size + 1, to = Math.min(total, page * size);
    let nums = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
    return '<div class="pager"><span class="muted small">Menampilkan ' + from + '–' + to + ' dari ' + total + '</span><div class="pg">' +
      '<button ' + onAttr + '="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + ' aria-label="Sebelumnya">' + ic('chevron-left') + '</button>' +
      nums.map(n => n === '…' ? '<span>…</span>' : '<button ' + onAttr + '="' + n + '" class="' + (n === page ? 'on' : '') + '">' + n + '</button>').join('') +
      '<button ' + onAttr + '="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + ' aria-label="Berikutnya">' + ic('chevron-right') + '</button></div></div>';
  }
  function toggle(id, on, attrs) { return '<label class="switch"><input type="checkbox" ' + (id ? 'id="' + id + '" ' : '') + (on ? 'checked ' : '') + (attrs || '') + '><span></span></label>'; }
  function waLink(hp, txt) { return hp ? 'https://wa.me/' + hp + (txt ? '?text=' + encodeURIComponent(txt) : '') : '#'; }
  function errorState(r, retry) { return '<div class="card empty"><div class="empty-art">' + ic('wifi-off') + '</div><h3>Gagal memuat data</h3><p class="muted">' + esc(r.message || '') + '</p><button class="btn btn-primary" data-retry="' + retry + '">' + ic('refresh-cw') + 'Coba lagi</button></div>'; }
  function skeletonRows(n) { return Array.from({ length: n }, () => '<div class="sk sk-line"></div>').join(''); }

  /* ======================================================== 1. RINGKASAN */
  const Dash = { range: 'today', data: null };
  apage('ringkasan', {
    title: 'Ringkasan', perm: 'dashboard',
    template: () => `
      <div class="ahead"><div><h1 class="ah1" id="hello">Halo!</h1><p class="muted">Berikut ringkasan performa toko dan aktivitas transaksi.</p></div>
        <div class="seg" id="dashSeg" role="tablist"><button data-r="today" class="on">Hari Ini</button><button data-r="7">7 Hari</button><button data-r="30">30 Hari</button></div></div>
      <div class="stats4" id="dashStats">${'<div class="stat sk" style="height:150px"></div>'.repeat(4)}</div>
      <div class="dash-row"><div class="card"><div class="card-h"><div><h3 class="h3">Tren Penjualan 7 Hari Terakhir</h3><p class="muted small">Perbandingan omzet pekan berjalan vs pekan sebelumnya</p></div><div class="legend"><span><i style="background:var(--primary)"></i>Pekan Ini</span><span><i style="background:var(--sky)"></i>Pekan Lalu</span></div></div><div id="trendChart" class="chart-box"><div class="sk" style="height:240px"></div></div></div>
        <div class="card"><div class="card-h"><h3 class="h3">Penjualan per Kategori</h3><span class="muted small">30 hari</span></div><div id="catChart"></div></div></div>
      <div class="card insight" id="insight" hidden></div>
      <div class="dash-row"><div class="card p0"><div class="card-h pad"><h3 class="h3">Pesanan Terbaru <span class="badge b-violet" id="recentN"></span></h3><a href="#/admin/pesanan" class="link">Lihat Semua ${ic('arrow-right')}</a></div><div id="recentBox"></div></div>
        <div class="card"><div class="card-h"><h3 class="h3 with-ic"><span class="ic-box amber">${ic('triangle-alert')}</span>Stok Menipis</h3><span class="badge b-violet" id="lowN"></span></div><p class="muted small">Produk di bawah batas minimum inventaris.</p><div id="lowBox"></div></div></div>`,
    init(el) {
      $('#dashSeg', el).onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; Dash.range = b.dataset.r; $$('#dashSeg button', el).forEach(x => x.classList.toggle('on', x === b)); renderDashboard(); if (Dash.range !== 'today' && !Adm.orders && can('pesanan')) refreshOrders(); };
      el.addEventListener('click', e => { const s = e.target.closest('[data-addstok]'); if (s) quickStock(s.dataset.addstok); const r = e.target.closest('[data-openorder]'); if (r) go('admin/pesanan?id=' + r.dataset.openorder); const rt = e.target.closest('[data-retry]'); if (rt) loadDashboard(true); });
    },
    show() { loadDashboard(false); if (can('pesanan')) startPoll(async () => { const c = await refreshOrders(true); if (c) loadDashboard(true); return c; }); }
  });
  function loadDashboard(force) {
    aswr('dashboard', {}, d => { Dash.data = d; renderDashboard(); }, { fresh: force ? 0 : 30000, onError: r => { $('#dashStats').innerHTML = errorState(r, 'dash'); refreshIcons($('#dashStats')); } });
  }
  function rangeStats() {
    const d = Dash.data; if (!d) return null;
    if (Dash.range === 'today' || !Adm.orders) return { omzet: d.omzet_hari_ini, omzetPrev: d.omzet_kemarin, pesanan: d.pesanan_hari_ini, pesananPrev: d.pesanan_kemarin, item: d.item_hari_ini, itemPrev: d.item_kemarin, pelanggan: d.pelanggan_hari_ini, label: 'vs kemarin' };
    const days = +Dash.range, now = Date.now(), cut = now - days * 864e5, cut2 = now - 2 * days * 864e5;
    const paid = o => o.status_bayar === 'Lunas' && o.status_pesanan !== 'Dibatalkan';
    const cur = Adm.orders.filter(o => new Date(o.tanggal).getTime() >= cut), prev = Adm.orders.filter(o => { const t = new Date(o.tanggal).getTime(); return t >= cut2 && t < cut; });
    const sum = (l, f) => l.reduce((s, o) => s + f(o), 0);
    const items = l => sum(l.filter(paid), o => o.items.reduce((a, it) => a + it.qty, 0));
    return { omzet: sum(cur.filter(paid), o => o.total), omzetPrev: sum(prev.filter(paid), o => o.total), pesanan: cur.length, pesananPrev: prev.length, item: items(cur), itemPrev: items(prev), pelanggan: new Set(cur.map(o => o.hp)).size, label: 'vs ' + days + ' hari sebelumnya' };
  }
  function renderDashboard() {
    const d = Dash.data, el = $('.apage[data-apage="ringkasan"]'); if (!d || !el) return;
    $('#hello', el).innerHTML = 'Halo, ' + esc((Adm.me.nama || '').split(' ')[0]) + ' <span class="badge b-green">' + ic('circle') + 'Toko Buka</span>';
    const s = rangeStats(), trendVals = d.trend.map(x => x.omzet);
    $('#dashStats', el).innerHTML =
      statCard({ hero: true, label: 'Penjualan ' + (Dash.range === 'today' ? 'Hari Ini' : Dash.range + ' Hari'), icon: 'shopping-bag', value: fmtRp(s.omzet), sub: trendPill(pct(s.omzet, s.omzetPrev), s.label) }) +
      statCard({ label: 'Pesanan Masuk', icon: 'clipboard-list', value: fmtNum(s.pesanan), unit: ' Pesanan', sub: '<span class="badge b-amber">' + ic('hourglass', 'xs') + d.perlu_verifikasi + ' menunggu verifikasi</span>' }) +
      statCard({ label: 'Produk Terjual', icon: 'package-check', value: fmtNum(s.item), unit: ' Item', sub: trendPill(pct(s.item, s.itemPrev), s.label) }) +
      statCard({ label: 'Pelanggan Bertransaksi', icon: 'user-plus', tone: 'sky', value: fmtNum(s.pelanggan), unit: ' Pelanggan', sub: '<span class="muted">Unik berdasarkan No. WA</span>' });
    const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    $('#trendChart', el).innerHTML = lineChart(d.trend.map(x => days[new Date(x.tanggal + 'T12:00').getDay()] + ' (' + x.tanggal.slice(8) + ')'), [{ name: 'Pekan ini', color: Theme.css('--primary'), values: trendVals, area: true }, { name: 'Pekan lalu', color: Theme.css('--sky'), values: d.trend_prev.map(x => x.omzet) }], { label: 'Tren penjualan 7 hari', tipLabels: d.trend.map(x => fmtDate(x.tanggal)) });
    const cats = Object.keys(d.kategori).map(k => ({ label: k, value: d.kategori[k] })).sort((a, b) => b.value - a.value);
    const tot = cats.reduce((a, x) => a + x.value, 0);
    $('#catChart', el).innerHTML = cats.length ? '<div class="donut-wrap">' + donut(cats, ['Total Omzet', 'Rp ' + shortRp(tot)]) + '</div><ul class="cat-legend">' + cats.map((c, i, a, P = palette()) => '<li><i style="background:' + P[i % P.length] + '"></i><span>' + esc(c.label) + ' (' + Math.round(c.value / tot * 100) + '%)</span><b>' + fmtRp(c.value) + '</b></li>').join('') + '</ul>' : '<div class="empty sm"><p class="muted">Belum ada penjualan lunas 30 hari terakhir.</p></div>';
    $('#recentN', el).textContent = d.recent.length + ' Terbaru';
    $('#recentBox', el).innerHTML = d.recent.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No. Pesanan</th><th>Customer</th><th>Item</th><th class="ta-r">Total</th><th>Status</th></tr></thead><tbody>' + d.recent.map(o => '<tr class="click" data-openorder="' + esc(o.id) + '"><td><b class="txt-violet mono">#' + esc(o.id) + '</b><small class="d-block muted">' + timeAgo(o.tanggal) + '</small></td><td><div class="who"><span class="av sm">' + esc(initials(o.nama)) + '</span>' + esc(o.nama) + '</div></td><td><span class="cat-pill static sm t-' + catTone(o.kategori) + '">' + esc(o.kategori || '-') + '</span> <span class="clip">' + esc(o.item) + (o.n > 1 ? ' +' + (o.n - 1) : '') + '</span></td><td class="ta-r"><b>' + fmtRp(o.total) + '</b></td><td>' + badge(o.status_bayar === 'Lunas' ? o.status_pesanan : o.status_bayar) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty sm"><p class="muted">Belum ada pesanan.</p></div>';
    $('#lowN', el).textContent = d.low_stock.length + ' Item Kritis';
    $('#lowBox', el).innerHTML = d.low_stock.length ? d.low_stock.map(p => '<div class="low-item">' + productImg(p, 120, 'xs') + '<div><b class="clip">' + esc(p.nama) + '</b><small class="muted">' + esc(p.kategori) + ' • SKU: ' + esc(p.sku || '-') + '</small></div><div class="ta-r"><span class="badge b-red">Sisa ' + p.stok + '</span>' + (can('produk', 'ubah') ? '<button class="link sm" data-addstok="' + esc(p.id) + '">' + ic('plus') + 'Stok</button>' : '') + '</div></div>').join('') : '<div class="empty sm"><span class="empty-art sm">' + ic('package-check') + '</span><p class="muted">Semua stok aman.</p></div>';
    // Insight otomatis (analisis teks dari data)
    const ins = [];
    const dOmzet = pct(d.omzet_hari_ini, d.omzet_kemarin);
    if (d.omzet_hari_ini || d.omzet_kemarin) ins.push([dOmzet >= 0 ? 'trending-up' : 'trending-down', 'Omzet hari ini ' + (dOmzet >= 0 ? 'naik ' : 'turun ') + Math.abs(dOmzet) + '% dibanding kemarin (' + fmtRp(d.omzet_hari_ini) + ').']);
    if (cats.length) ins.push(['crown', 'Kategori terlaris 30 hari: <b>' + esc(cats[0].label) + '</b> (' + Math.round(cats[0].value / tot * 100) + '% omzet).']);
    const wk = trendVals.reduce((a, b) => a + b, 0), wkp = d.trend_prev.reduce((a, b) => a + b.omzet, 0);
    if (wk || wkp) ins.push(['calendar-range', 'Omzet 7 hari: ' + fmtRp(wk) + ' — ' + (wk >= wkp ? 'lebih tinggi ' : 'lebih rendah ') + Math.abs(pct(wk, wkp)) + '% dari pekan lalu.']);
    if (d.perlu_verifikasi) ins.push(['hourglass', '<b>' + d.perlu_verifikasi + ' pembayaran</b> menunggu verifikasi — segera cek agar pesanan cepat diproses.']);
    if (d.low_stock.length) ins.push(['package-x', d.low_stock.length + ' produk stok kritis. Pertimbangkan restok: ' + esc(d.low_stock.slice(0, 2).map(p => p.nama).join(', ')) + '.']);
    const ib = $('#insight', el);
    ib.hidden = !ins.length;
    ib.innerHTML = '<div class="card-h"><h3 class="h3 with-ic"><span class="ic-box grad">' + ic('sparkles') + '</span>Insight Otomatis</h3><span class="muted small">Dianalisis dari data toko</span></div><ul class="ins-list">' + ins.map(x => '<li>' + ic(x[0]) + '<span>' + x[1] + '</span></li>').join('') + '</ul>';
    refreshIcons(el);
  }
  async function quickStock(id) {
    const p = (Adm.products || []).find(x => x.id === id) || (Dash.data.low_stock || []).find(x => x.id === id);
    const m = modal('<div class="modal-head"><h3 class="h3">Tambah Stok</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="modal-body"><p><b>' + esc(p ? p.nama : id) + '</b><br><span class="muted">Stok saat ini: ' + (p ? p.stok : '-') + '</span></p><div class="field"><label class="label" for="qsN">Stok baru (total)</label><input id="qsN" type="number" min="0" value="' + ((p ? p.stok : 0) + 10) + '"></div></div><div class="modal-foot"><button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="qsOk">Simpan Stok</button></div>', { cls: 'modal-sm' });
    m.el.querySelector('#qsOk').onclick = async () => {
      const b = m.el.querySelector('#qsOk'); setBusy(b, true, 'Menyimpan...');
      const r = await api('productBulk', { ids: [id], op: 'stok', stok: +$('#qsN').value });
      setBusy(b, false);
      if (r.success) { toast('Stok diperbarui.', 'success'); m.close(); Store.del('c:' + akey('products')); loadDashboard(true); } else toast(r.message, 'error');
    };
  }

  /* ======================================================== 2. PRODUK & KATEGORI */
  const PL = { tab: 'semua', q: '', kat: '', stok: '', sort: 'baru', page: 1, sel: new Set() };
  apage('produk', {
    title: 'Produk & Kategori', perm: 'produk',
    template: () => `
      <div class="ahead"><div><span class="eyebrow">Inventaris & Etalase Publik</span><h1 class="ah1">Katalog & Manajemen Produk</h1><p class="muted">Kelola inventaris, harga jual multi-kategori, dan visibilitas etalase publik.</p></div>
        <div class="row-gap"><label class="btn btn-ghost" id="impBtn">${ic('file-up')}Impor CSV<input type="file" accept=".csv,text/csv" id="impFile" hidden></label><button class="btn btn-ghost" id="expBtn">${ic('download')}Ekspor Katalog</button><a class="btn btn-primary" href="#/admin/produk-baru" id="addBtn">${ic('plus')}Tambah Produk Baru</a></div></div>
      <div class="stats4" id="prodStats"></div>
      <div class="atabs" id="prodTabs"></div>
      <div id="prodBody"><div class="card">${skeletonRows(6)}</div></div>`,
    init(el) {
      $('#prodTabs', el).onclick = e => { const t = e.target.closest('[data-tab]'); if (!t) return; PL.tab = t.dataset.tab; PL.page = 1; PL.sel.clear(); renderProducts(); };
      $('#expBtn', el).onclick = () => downloadCsv('produk', ['sku', 'nama', 'kategori', 'tipe', 'harga', 'harga_coret', 'hpp', 'stok', 'unlimited', 'aktif', 'terjual', 'deskripsi'], (Adm.products || []).map(p => [p.sku, p.nama, p.kategori, p.tipe, p.harga, p.harga_coret, p.hpp, p.stok, p.unlimited, p.aktif, p.terjual, p.deskripsi]));
      $('#impFile', el).onchange = e => importCsv(e.target.files[0]).finally(() => { e.target.value = ''; });
      el.addEventListener('input', debounce(e => { if (e.target.id === 'pQ') { PL.q = e.target.value.trim().toLowerCase(); PL.page = 1; renderProductTable(); } }, 200));
      el.addEventListener('change', async e => {
        const t = e.target;
        if (t.id === 'pKat') { PL.kat = t.value; PL.page = 1; renderProductTable(); }
        if (t.id === 'pStok') { PL.stok = t.value; PL.page = 1; renderProductTable(); }
        if (t.id === 'pSort') { PL.sort = t.value; renderProductTable(); }
        if (t.matches('[data-sel]')) { t.checked ? PL.sel.add(t.dataset.sel) : PL.sel.delete(t.dataset.sel); renderBulkBar(); }
        if (t.id === 'selAll') { pageProducts().forEach(p => t.checked ? PL.sel.add(p.id) : PL.sel.delete(p.id)); renderProductTable(); }
        if (t.matches('[data-vis]')) toggleVisibility(t.dataset.vis, t.checked, t);
      });
      el.addEventListener('click', async e => {
        const pg = e.target.closest('[data-pg]'); if (pg && !pg.disabled) { PL.page = +pg.dataset.pg; renderProductTable(); return; }
        const del = e.target.closest('[data-delp]'); if (del) { deleteProduct(del.dataset.delp); return; }
        const b = e.target.closest('[data-bulk]'); if (b) { bulkAction(b.dataset.bulk); return; }
        const ck = e.target.closest('[data-editcat]'); if (ck) { categoryModal(ck.dataset.editcat); return; }
        const dk = e.target.closest('[data-delcat]'); if (dk) { deleteCategory(dk.dataset.delcat); return; }
        if (e.target.closest('#addCat')) categoryModal('');
        if (e.target.closest('[data-retry]')) loadProducts(true);
      });
    },
    show(el, parts, q) {
      $('#addBtn', el).hidden = !can('produk', 'ubah'); $('#impBtn', el).hidden = !can('produk', 'ubah');
      if (q.q) PL.q = q.q.toLowerCase();
      loadProducts(false);
    }
  });
  function loadProducts(force) {
    if (Adm.products) renderProducts();
    aswr('products', {}, () => renderProducts(), { fresh: force ? 0 : 45000, onError: r => { $('#prodBody').innerHTML = errorState(r, 'p'); refreshIcons($('#prodBody')); } });
  }
  function stockState(p) { if (p.unlimited) return 'inf'; if (p.stok <= 0) return 'habis'; if (p.stok <= (p.batas_kritis || 5)) return 'kritis'; return 'aman'; }
  function renderProducts() {
    const el = $('.apage[data-apage="produk"]'); if (!el || !Adm.products) return;
    const P = Adm.products, act = P.filter(p => p.aktif), kritis = P.filter(p => p.aktif && stockState(p) === 'kritis'), habis = P.filter(p => stockState(p) === 'habis');
    $('#prodStats', el).innerHTML =
      statCard({ label: 'Total Produk Aktif', icon: 'archive', value: act.length, sub: '<span class="badge b-violet">' + P.length + ' total</span>' }) +
      statCard({ label: 'Perlu Restok Segera', icon: 'triangle-alert', tone: 'red', value: '<span class="txt-red">' + kritis.length + '</span>', sub: '<span class="badge b-red">Stok Kritis</span>' }) +
      statCard({ label: 'Stok Kosong', icon: 'ban', tone: 'slate', value: habis.length, sub: '<span class="badge b-slate">Tutup Etalase</span>' }) +
      statCard({ label: 'Kategori Berjalan', icon: 'shapes', tone: 'sky', value: Adm.categories.length, sub: Adm.categories.slice(0, 4).map(c => '<span class="mini-chip">' + esc(c.nama) + '</span>').join('') });
    const tabs = [['semua', 'Semua Produk', P.length], ['menipis', 'Stok Menipis', kritis.length + habis.length], ['nonaktif', 'Nonaktif / Draft', P.filter(p => !p.aktif).length], ['kategori', 'Manajemen Kategori', Adm.categories.length]];
    $('#prodTabs', el).innerHTML = tabs.map(t => '<button data-tab="' + t[0] + '" class="' + (PL.tab === t[0] ? 'on' : '') + '">' + t[1] + '<span class="cnt">' + t[2] + '</span></button>').join('');
    if (PL.tab === 'kategori') return renderCategories();
    const body = $('#prodBody', el);
    if (!$('#pQ', body)) {
      body.innerHTML = '<div class="card filters"><label class="input-ic grow">' + ic('search') + '<input id="pQ" placeholder="Cari nama produk, SKU..." value="' + esc(PL.q) + '"></label>' +
        '<select id="pKat" aria-label="Filter kategori"><option value="">Semua Kategori</option>' + Adm.categories.map(c => '<option>' + esc(c.nama) + '</option>').join('') + '</select>' +
        '<select id="pStok" aria-label="Filter stok"><option value="">Semua Stok</option><option value="aman">Aman</option><option value="kritis">Kritis</option><option value="habis">Habis</option><option value="inf">Unlimited</option></select>' +
        '<select id="pSort" aria-label="Urutkan"><option value="baru">Terbaru Ditambahkan</option><option value="laris">Terlaris</option><option value="nama">Nama A–Z</option><option value="murah">Harga Terendah</option><option value="mahal">Harga Tertinggi</option><option value="stok">Stok Terkecil</option></select></div>' +
        '<div id="bulkBar"></div><div class="card p0" id="pTable"></div>';
    }
    $('#pKat', body).value = PL.kat; $('#pStok', body).value = PL.stok; $('#pSort', body).value = PL.sort;
    renderProductTable();
  }
  function filteredAdminProducts() {
    let l = Adm.products.slice();
    if (PL.tab === 'menipis') l = l.filter(p => ['kritis', 'habis'].includes(stockState(p)));
    if (PL.tab === 'nonaktif') l = l.filter(p => !p.aktif);
    if (PL.q) l = l.filter(p => (p.nama + ' ' + p.sku + ' ' + p.kategori).toLowerCase().includes(PL.q));
    if (PL.kat) l = l.filter(p => p.kategori === PL.kat);
    if (PL.stok) l = l.filter(p => stockState(p) === PL.stok);
    const s = { baru: (a, b) => String(b.created_at).localeCompare(String(a.created_at)), laris: (a, b) => b.terjual - a.terjual, nama: (a, b) => a.nama.localeCompare(b.nama), murah: (a, b) => a.harga - b.harga, mahal: (a, b) => b.harga - a.harga, stok: (a, b) => (a.unlimited ? 1e9 : a.stok) - (b.unlimited ? 1e9 : b.stok) };
    return l.sort(s[PL.sort]);
  }
  function pageProducts() { const l = filteredAdminProducts(); return l.slice((PL.page - 1) * 20, PL.page * 20); }
  function renderProductTable() {
    const box = $('#pTable'); if (!box) return;
    const all = filteredAdminProducts(), list = all.slice((PL.page - 1) * 20, PL.page * 20), ce = can('produk', 'ubah'), cd = can('produk', 'hapus');
    const stockPill = p => { const s = stockState(p); return s === 'inf' ? '<span class="spill inf">' + ic('infinity') + 'Unlimited</span>' : s === 'habis' ? '<span class="spill habis"><i></i>0 unit (Habis)</span>' : s === 'kritis' ? '<span class="spill kritis"><i></i>' + p.stok + ' unit (Kritis)</span>' : '<span class="spill aman"><i></i>' + p.stok + ' unit (Aman)</span>'; };
    box.innerHTML = list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + (ce ? '<th class="w-ck"><input type="checkbox" id="selAll" aria-label="Pilih semua"' + (list.every(p => PL.sel.has(p.id)) ? ' checked' : '') + '></th>' : '') + '<th>Produk & SKU</th><th>Kategori</th><th class="ta-r">Harga Jual</th><th>Stok Inventaris</th><th class="ta-c">Etalase Publik</th><th class="ta-r">Terjual</th><th class="ta-r">Aksi</th></tr></thead><tbody>' +
      list.map(p => '<tr class="' + (PL.sel.has(p.id) ? 'sel' : '') + '">' + (ce ? '<td><input type="checkbox" data-sel="' + esc(p.id) + '" aria-label="Pilih ' + esc(p.nama) + '"' + (PL.sel.has(p.id) ? ' checked' : '') + '></td>' : '') +
        '<td><div class="prod-cell">' + productImg(p, 120, 'xs') + '<div><a href="#/admin/produk-edit/' + encodeURIComponent(p.id) + '" class="pc-name">' + esc(p.nama) + '</a><small><span class="sku">SKU: ' + esc(p.sku || '-') + '</span>' + (p.varian && p.varian.length ? ' • ' + p.varian.length + ' varian' : '') + (p.unggulan ? ' • <span class="txt-violet">Unggulan</span>' : '') + '</small></div></div></td>' +
        '<td><span class="cat-pill static sm t-' + catTone(p.kategori) + '">' + esc(p.kategori) + '</span></td><td class="ta-r"><b class="txt-violet">' + fmtRp(p.harga) + '</b>' + (p.harga_coret > p.harga ? '<s class="d-block strike">' + fmtRp(p.harga_coret) + '</s>' : '') + '</td><td>' + stockPill(p) + '</td>' +
        '<td class="ta-c">' + toggle('', p.aktif, 'data-vis="' + esc(p.id) + '" aria-label="Tampilkan di etalase"' + (ce ? '' : ' disabled')) + '</td><td class="ta-r">' + fmtNum(p.terjual) + '</td>' +
        '<td class="ta-r nowrap">' + (ce ? '<a class="iconbtn sm" href="#/admin/produk-edit/' + encodeURIComponent(p.id) + '" aria-label="Ubah" title="Ubah">' + ic('pencil') + '</a>' : '') + '<a class="iconbtn sm" href="#/produk/' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener" aria-label="Lihat di toko" title="Lihat di toko">' + ic('eye') + '</a>' + (cd ? '<button class="iconbtn sm danger" data-delp="' + esc(p.id) + '" aria-label="Hapus" title="Hapus">' + ic('trash-2') + '</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>' + pager(all.length, PL.page, 20, 'data-pg')
      : '<div class="empty"><div class="empty-art">' + ic('package-search') + '</div><h3>Tidak ada produk</h3><p class="muted">Ubah filter atau tambahkan produk baru.</p>' + (ce ? '<a class="btn btn-primary" href="#/admin/produk-baru">' + ic('plus') + 'Tambah Produk</a>' : '') + '</div>';
    renderBulkBar(); refreshIcons(box);
  }
  function renderBulkBar() {
    const bb = $('#bulkBar'); if (!bb) return;
    const n = PL.sel.size;
    bb.innerHTML = n ? '<div class="bulk"><span class="bulk-n">' + n + '</span><b>' + n + ' produk terpilih untuk aksi massal</b><div class="row-gap"><button class="btn btn-sm btn-glass" data-bulk="aktif">' + ic('eye') + 'Tampilkan</button><button class="btn btn-sm btn-glass" data-bulk="nonaktif">' + ic('eye-off') + 'Sembunyikan</button><button class="btn btn-sm btn-glass" data-bulk="stok">' + ic('package-plus') + 'Perbarui Stok Massal</button>' + (can('produk', 'hapus') ? '<button class="btn btn-sm btn-danger" data-bulk="hapus">' + ic('trash-2') + 'Hapus Terpilih</button>' : '') + '<button class="btn btn-sm btn-text" data-bulk="batal">Batal</button></div></div>' : '';
    refreshIcons(bb);
  }
  async function toggleVisibility(id, on, input) {
    const p = Adm.products.find(x => x.id === id); const prev = p.aktif;
    p.aktif = on;                                   // optimistic
    const r = await api('productBulk', { ids: [id], op: on ? 'aktif' : 'nonaktif' });
    if (!r.success) { p.aktif = prev; input.checked = prev; toast(r.message, 'error'); return; }
    toast(on ? 'Produk tampil di etalase.' : 'Produk disembunyikan dari etalase.', 'success', 1800);
    Store.del('c:' + akey('products')); Store.del('c:catalog');
    if (PL.tab === 'nonaktif') renderProducts();
  }
  async function bulkAction(op) {
    const ids = Array.from(PL.sel);
    if (op === 'batal') { PL.sel.clear(); renderProductTable(); return; }
    let extra = {};
    if (op === 'hapus' && !(await confirmDialog('Hapus ' + ids.length + ' produk?', 'Produk akan dihapus permanen dari katalog. Riwayat pesanan tetap tersimpan.', 'Hapus', true))) return;
    if (op === 'stok') { const v = prompt('Atur stok untuk ' + ids.length + ' produk terpilih menjadi:', '10'); if (v === null) return; extra.stok = Math.max(0, parseInt(v, 10) || 0); }
    const r = await api('productBulk', Object.assign({ ids, op }, extra));
    if (!r.success) { toast(r.message, 'error'); return; }
    toast(r.message, 'success'); PL.sel.clear(); Store.del('c:catalog'); loadProducts(true);
  }
  async function deleteProduct(id) {
    const p = Adm.products.find(x => x.id === id);
    if (!(await confirmDialog('Hapus produk?', '"' + (p ? p.nama : id) + '" akan dihapus permanen dari katalog.', 'Hapus', true))) return;
    Adm.products = Adm.products.filter(x => x.id !== id); renderProducts();        // optimistic
    const r = await api('productDelete', { id });
    if (!r.success) { toast(r.message, 'error'); loadProducts(true); return; }
    toast('Produk dihapus.', 'success'); Store.del('c:' + akey('products')); Store.del('c:catalog');
  }
  async function importCsv(file) {
    if (!file) return;
    const rows = parseCsv(await file.text());
    if (!rows.length) { toast('CSV kosong atau format tidak dikenali.', 'error'); return; }
    if (!('nama' in rows[0]) || !('harga' in rows[0]) || !('kategori' in rows[0])) {
      modal('<div class="modal-body"><h3 class="h3">Format CSV tidak sesuai</h3><p class="muted">Baris pertama wajib berisi judul kolom. Minimal: <code>nama, kategori, harga</code>. Opsional: <code>sku, tipe (fisik/digital/jasa), harga_coret, hpp, stok, unlimited, deskripsi, foto</code>.</p><p class="muted small">Tip: klik <b>Ekspor Katalog</b> untuk mendapatkan contoh format.</p></div><div class="modal-foot"><button class="btn btn-primary" data-close>OK</button></div>', { cls: 'modal-sm' }); return;
    }
    if (!(await confirmDialog('Impor ' + rows.length + ' produk?', 'Produk baru akan ditambahkan ke katalog dan langsung tampil di etalase.', 'Impor Sekarang'))) return;
    toast('Mengimpor ' + rows.length + ' baris...', 'info');
    const r = await api('productImport', { rows });
    if (!r.success) { toast(r.message, 'error'); return; }
    toast(r.message, r.data.gagal.length ? 'warning' : 'success', 5000);
    if (r.data.gagal.length) console.table(r.data.gagal);
    loadProducts(true);
  }
  function renderCategories() {
    const body = $('#prodBody'), counts = {};
    Adm.products.forEach(p => counts[p.kategori] = (counts[p.kategori] || 0) + 1);
    const ce = can('produk', 'ubah');
    body.innerHTML = '<div class="card p0"><div class="card-h pad"><div><h3 class="h3">Kategori & Tag</h3><p class="muted small">Urutan menentukan tampilan chip kategori di etalase.</p></div>' + (ce ? '<button class="btn btn-primary btn-sm" id="addCat">' + ic('plus') + 'Kategori Baru</button>' : '') + '</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Kategori</th><th>Ikon</th><th class="ta-r">Jumlah Produk</th><th class="ta-c">Status</th><th class="ta-r">Aksi</th></tr></thead><tbody>' +
      Adm.categories.slice().sort((a, b) => a.urutan - b.urutan).map(c => '<tr><td>' + c.urutan + '</td><td><b>' + esc(c.nama) + '</b></td><td><span class="ic-box">' + ic(c.ikon || 'tag') + '</span></td><td class="ta-r">' + (counts[c.nama] || 0) + '</td><td class="ta-c">' + badge(String(c.aktif).toUpperCase() === 'TRUE' || c.aktif === true ? 'Aktif' : 'Nonaktif') + '</td><td class="ta-r">' + (ce ? '<button class="iconbtn sm" data-editcat="' + esc(c.id) + '" aria-label="Ubah">' + ic('pencil') + '</button>' : '') + (can('produk', 'hapus') ? '<button class="iconbtn sm danger" data-delcat="' + esc(c.id) + '" aria-label="Hapus">' + ic('trash-2') + '</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div></div>';
    refreshIcons(body);
  }
  const ICON_CHOICES = ['headphones', 'shirt', 'download', 'utensils', 'pen-tool', 'tag', 'gift', 'smartphone', 'book-open', 'coffee', 'gem', 'heart-pulse', 'car', 'house', 'baby', 'dumbbell', 'palette', 'wrench'];
  function categoryModal(id) {
    const c = Adm.categories.find(x => x.id === id) || { nama: '', ikon: 'tag', urutan: Adm.categories.length + 1, aktif: true };
    const m = modal('<div class="modal-head"><h3 class="h3">' + (id ? 'Ubah' : 'Tambah') + ' Kategori</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="modal-body stack">' +
      '<div class="field"><label class="label" for="cNama">Nama Kategori</label><input id="cNama" value="' + esc(c.nama) + '" maxlength="60" placeholder="Mis. Kesehatan"></div>' +
      '<div class="field"><span class="label">Ikon</span><div class="icon-pick">' + ICON_CHOICES.map(n => '<button type="button" class="' + (c.ikon === n ? 'on' : '') + '" data-icn="' + n + '" aria-label="' + n + '">' + ic(n) + '</button>').join('') + '</div></div>' +
      '<div class="form-grid"><div class="field"><label class="label" for="cUrut">Urutan</label><input id="cUrut" type="number" min="1" value="' + c.urutan + '"></div><div class="field"><span class="label">Aktif</span>' + toggle('cAktif', c.aktif === true || String(c.aktif).toUpperCase() === 'TRUE') + '</div></div></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="cSave">Simpan</button></div>', { cls: 'modal-sm' });
    let icon = c.ikon || 'tag';
    m.el.querySelector('.icon-pick').onclick = e => { const b = e.target.closest('[data-icn]'); if (!b) return; icon = b.dataset.icn; $$('.icon-pick button', m.el).forEach(x => x.classList.toggle('on', x === b)); };
    m.el.querySelector('#cSave').onclick = async () => {
      const b = m.el.querySelector('#cSave'); setBusy(b, true, 'Menyimpan...');
      const r = await api('categorySave', { id, nama: $('#cNama').value, ikon: icon, urutan: +$('#cUrut').value, aktif: $('#cAktif').checked });
      setBusy(b, false);
      if (!r.success) { toast(r.message, 'error'); return; }
      Adm.categories = r.data.categories; toast(r.message, 'success'); m.close(); Store.del('c:catalog'); loadProducts(true);
    };
  }
  async function deleteCategory(id) {
    const c = Adm.categories.find(x => x.id === id);
    if (!(await confirmDialog('Hapus kategori?', 'Kategori "' + (c ? c.nama : '') + '" akan dihapus.', 'Hapus', true))) return;
    const r = await api('categoryDelete', { id });
    if (!r.success) { toast(r.message, 'error'); return; }
    Adm.categories = r.data.categories; toast(r.message, 'success'); renderProducts();
  }

  /* ======================================================== 3. FORM PRODUK */
  const PF = { id: '', data: null, uploading: 0, dirty: false };
  function blankProduct() { return { id: '', nama: '', kategori: (Adm.categories[0] || {}).nama || '', tipe: 'fisik', harga: '', harga_coret: '', hpp: '', stok: 0, unlimited: false, batas_kritis: 5, sku: '', deskripsi: '', varian: [], foto: [], aktif: true, unggulan: false, berat: '' }; }
  const formPage = {
    title: 'Form Produk', perm: 'produk',
    template: () => '<div id="pfBox"></div>',
    init(el) {
      el.addEventListener('input', e => { if (e.target.closest('#pfForm')) { PF.dirty = true; collectForm(); if (['fHarga', 'fHpp', 'fCoret'].includes(e.target.id)) renderMargin(); saveDraftDebounced(); } });
      el.addEventListener('change', e => {
        if (e.target.id === 'fFoto') { uploadPhotos(Array.from(e.target.files)); e.target.value = ''; }
        if (e.target.id === 'fVarOn') { collectForm(); if (e.target.checked && !PF.data.varian.length) PF.data.varian = [{ nama: '', harga: '', stok: '' }]; if (!e.target.checked) PF.data.varian = []; renderForm(); }
        if (e.target.id === 'fUnl') { collectForm(); renderForm(); }
        if (e.target.name === 'tipe') { collectForm(); renderForm(); }
      });
      el.addEventListener('click', e => {
        const k = e.target.closest('[data-kat]'); if (k) { collectForm(); PF.data.kategori = k.dataset.kat; PF.dirty = true; renderForm(); return; }
        const rf = e.target.closest('[data-rmfoto]'); if (rf) { collectForm(); PF.data.foto.splice(+rf.dataset.rmfoto, 1); PF.dirty = true; renderForm(); return; }
        const mf = e.target.closest('[data-mainfoto]'); if (mf) { collectForm(); const i = +mf.dataset.mainfoto; PF.data.foto.unshift(PF.data.foto.splice(i, 1)[0]); renderForm(); return; }
        const rv = e.target.closest('[data-rmvar]'); if (rv) { collectForm(); PF.data.varian.splice(+rv.dataset.rmvar, 1); renderForm(); return; }
        if (e.target.closest('#addVar')) { collectForm(); PF.data.varian.push({ nama: '', harga: '', stok: '' }); renderForm(); return; }
        if (e.target.closest('#addUrl')) { const u = prompt('Tempel URL gambar (https://...) atau ID file Google Drive:'); if (u && u.trim()) { collectForm(); PF.data.foto.push(u.trim()); PF.dirty = true; renderForm(); } return; }
        if (e.target.closest('#pfSave')) saveProduct();
        if (e.target.closest('#pfDiscard')) discardDraft();
        if (e.target.closest('#pfPreview') && PF.data.id) window.open('#/produk/' + PF.data.id, '_blank');
      });
    },
    async show(el, parts) {
      const id = parts[0] || '';
      PF.id = id; PF.dirty = false;
      if (!Adm.products && id) { $('#pfBox').innerHTML = '<div class="card">' + skeletonRows(8) + '</div>'; await aswr('products', {}, () => { }); }
      const draft = Store.get(akey('draft:' + (id || 'new')), null);
      const base = id ? JSON.parse(JSON.stringify((Adm.products || []).find(p => p.id === id) || null)) : blankProduct();
      if (id && !base) { $('#pfBox').innerHTML = '<div class="card empty"><h3>Produk tidak ditemukan</h3><a class="btn btn-primary" href="#/admin/produk">Kembali</a></div>'; return; }
      PF.data = draft && draft.data ? draft.data : base;
      PF.draftAt = draft ? draft.t : 0;
      renderForm();
    }
  };
  apage('produk-baru', Object.assign({}, formPage, { title: 'Tambah Produk Baru' }));
  apage('produk-edit', Object.assign({}, formPage, { title: 'Ubah Produk' }));
  const saveDraftDebounced = debounce(() => { if (!PF.data) return; PF.draftAt = Date.now(); Store.set(akey('draft:' + (PF.id || 'new')), { t: PF.draftAt, data: PF.data }); const s = $('#draftInfo'); if (s) s.innerHTML = '<i class="dot ok"></i>Draf otomatis tersimpan ' + timeAgo(PF.draftAt) + ' di perangkat ini.'; }, 800);
  function collectForm() {
    const f = $('#pfForm'); if (!f) return;
    const d = PF.data, v = id => { const x = f.querySelector('#' + id); return x ? x.value : ''; };
    d.nama = v('fNama'); d.deskripsi = v('fDesk'); d.harga = v('fHarga'); d.harga_coret = v('fCoret'); d.hpp = v('fHpp');
    d.sku = v('fSku'); d.stok = v('fStok'); d.batas_kritis = v('fKritis'); d.berat = v('fBerat');
    d.unlimited = $('#fUnl') ? $('#fUnl').checked : d.unlimited; d.aktif = $('#fAktif') ? $('#fAktif').checked : d.aktif; d.unggulan = $('#fUnggul') ? $('#fUnggul').checked : d.unggulan;
    const t = f.querySelector('input[name=tipe]:checked'); if (t) d.tipe = t.value;
    d.varian = $$('.var-row', f).map(r => ({ nama: r.querySelector('[data-v=nama]').value, sku: r.querySelector('[data-v=sku]').value, harga: r.querySelector('[data-v=harga]').value, stok: r.querySelector('[data-v=stok]').value }));
  }
  function renderMargin() {
    const box = $('#marginBox'); if (!box) return;
    const h = +PF.data.harga || 0, hpp = +PF.data.hpp || 0, c = +PF.data.harga_coret || 0;
    const hemat = $('#hematPill'); if (hemat) { hemat.hidden = !(c > h && h > 0); hemat.textContent = '-' + Math.round((1 - h / c) * 100) + '% Hemat'; }
    if (!h || !hpp) { box.innerHTML = '<small class="muted">Isi harga jual & HPP untuk melihat estimasi margin.</small>'; return; }
    const m = h - hpp, p = Math.round(m / h * 1000) / 10;
    box.innerHTML = '<div class="mg-top"><span>ESTIMASI MARGIN LABA</span><span class="badge ' + (m >= 0 ? 'b-sky' : 'b-red') + '">' + (m >= 0 ? '+' : '') + p + '%</span></div><div class="mg-v">' + fmtRp(m) + ' <small>/ unit terjual</small></div><div class="mg-bar"><i style="width:' + Math.max(0, Math.min(100, p)) + '%"></i></div>';
  }
  function renderForm() {
    const d = PF.data, box = $('#pfBox'); if (!box) return;
    const ce = can('produk', 'ubah'), varOn = d.varian.length > 0;
    box.innerHTML =
      '<div class="ahead"><div><a href="#/admin/produk" class="link">' + ic('arrow-left') + 'Kembali ke Katalog Produk</a><h1 class="ah1 mt-2">' + (d.id ? 'Ubah Produk' : 'Tambah Produk Baru') + '</h1><p class="muted">Lengkapi spesifikasi, tetapkan varian & inventaris, lalu terbitkan ke etalase publik.</p></div>' +
      '<div class="row-gap">' + (d.id ? '<button class="btn btn-ghost" id="pfPreview">' + ic('eye') + 'Pratinjau di Toko</button>' : '') + '</div></div>' +
      '<form id="pfForm" class="pf" onsubmit="return false" novalidate><div class="pf-main">' +
      // Informasi dasar
      '<section class="card"><div class="card-h"><h3 class="h3 with-ic"><span class="ic-box">' + ic('file-text') + '</span>Informasi Dasar Produk</h3><span class="badge b-slate">Wajib Diisi</span></div>' +
      '<div class="field"><label class="label" for="fNama">Nama Produk Lengkap <span class="req">*</span></label><input id="fNama" maxlength="150" value="' + esc(d.nama) + '" placeholder="Mis. Wireless Noise-Cancelling Headphones Pro"><small class="muted ta-r" id="namaCount">' + String(d.nama).length + '/150 karakter</small></div>' +
      '<div class="field mt-3"><span class="label">Kategori Retail & Layanan <span class="req">*</span></span><div class="kat-tiles">' + Adm.categories.map(c => '<button type="button" class="kat-tile' + (d.kategori === c.nama ? ' on' : '') + '" data-kat="' + esc(c.nama) + '">' + ic(c.ikon || catIcon(c.nama)) + '<span>' + esc(c.nama) + '</span></button>').join('') + '</div></div>' +
      '<div class="field mt-3"><label class="label" for="fDesk">Deskripsi Rinci Produk</label><textarea id="fDesk" rows="6" maxlength="5000" placeholder="Jelaskan keunggulan, spesifikasi, garansi, isi paket...">' + esc(d.deskripsi) + '</textarea></div></section>' +
      // Media
      '<section class="card"><div class="card-h"><div><h3 class="h3 with-ic"><span class="ic-box">' + ic('images') + '</span>Media & Galeri Visual</h3><p class="muted small">Rasio 1:1 direkomendasikan. Foto pertama menjadi foto utama.</p></div><span class="badge b-violet">' + d.foto.length + ' / 8 Terisi</span></div>' +
      (d.foto.length < 8 ? '<label class="dropzone" for="fFoto">' + ic('cloud-upload') + '<b>Tarik & lepas foto produk, atau klik untuk memilih</b><small>PNG, JPG, WebP — dikompres otomatis sebelum diunggah ke Google Drive</small><input id="fFoto" type="file" accept="image/*" multiple hidden></label>' : '') +
      (PF.uploading ? '<div class="info-box violet mt-3"><span class="spin"></span><p>Mengunggah ' + PF.uploading + ' foto...</p></div>' : '') +
      '<div class="photo-grid">' + d.foto.map((f, i) => '<div class="photo">' + productImg({ foto: [f], kategori: d.kategori, nama: d.nama }, 300) + (i === 0 ? '<span class="ph-main">Foto Utama</span>' : '<button type="button" class="ph-set" data-mainfoto="' + i + '">Jadikan utama</button>') + '<button type="button" class="ph-x" data-rmfoto="' + i + '" aria-label="Hapus foto">' + ic('x') + '</button></div>').join('') +
      (d.foto.length < 8 ? '<button type="button" class="photo add" id="addUrl">' + ic('link') + '<span>Tambah via URL</span></button>' : '') + '</div></section>' +
      // Varian
      '<section class="card"><div class="card-h"><div><h3 class="h3 with-ic"><span class="ic-box">' + ic('swatch-book') + '</span>Variasi & Pilihan Produk</h3><p class="muted small">Aktifkan bila produk punya pilihan warna, ukuran, atau kapasitas.</p></div>' + toggle('fVarOn', varOn) + '</div>' +
      (varOn ? '<div class="tbl-wrap"><table class="tbl var-tbl"><thead><tr><th>Nama Varian</th><th>SKU Khusus</th><th>Harga Jual (Rp)</th><th>Stok</th><th></th></tr></thead><tbody>' + d.varian.map((v, i) => '<tr class="var-row"><td><input data-v="nama" value="' + esc(v.nama) + '" placeholder="Mis. Midnight Violet / XL"></td><td><input data-v="sku" value="' + esc(v.sku || '') + '" placeholder="Opsional"></td><td><input data-v="harga" type="number" min="0" value="' + esc(v.harga) + '" placeholder="Ikuti harga utama"></td><td><input data-v="stok" type="number" min="0" value="' + esc(v.stok) + '" placeholder="-"></td><td><button type="button" class="iconbtn sm danger" data-rmvar="' + i + '" aria-label="Hapus varian">' + ic('trash-2') + '</button></td></tr>').join('') + '</tbody></table></div><button type="button" class="btn btn-soft btn-block mt-3" id="addVar">' + ic('plus') + 'Tambah Kombinasi Varian Baru</button><p class="muted small mt-2">Bila semua varian diisi stoknya, stok total dihitung otomatis dari jumlah stok varian.</p>' : '') + '</section>' +
      // Logistik
      '<section class="card"><h3 class="h3 with-ic"><span class="ic-box">' + ic('truck') + '</span>Tipe Produk & Pemenuhan</h3><div class="tipe-opts">' +
      [['fisik', 'package', 'Produk Fisik', 'Dikirim ke alamat pembeli (kena ongkir)'], ['digital', 'download', 'Produk Digital', 'File/tautan dikirim setelah bayar'], ['jasa', 'calendar-check', 'Layanan / Jasa', 'Dijadwalkan via WhatsApp']].map(t => '<label class="tipe' + (d.tipe === t[0] ? ' on' : '') + '"><input type="radio" name="tipe" value="' + t[0] + '"' + (d.tipe === t[0] ? ' checked' : '') + '>' + ic(t[1]) + '<span><b>' + t[2] + '</b><small>' + t[3] + '</small></span></label>').join('') + '</div>' +
      (d.tipe === 'fisik' ? '<div class="form-grid mt-3"><div class="field"><label class="label" for="fBerat">Berat Produk (gram)</label><input id="fBerat" type="number" min="0" value="' + esc(d.berat) + '" placeholder="Mis. 380"></div></div>' : '') + '</section>' +
      '</div><aside class="pf-side">' +
      // Harga
      '<section class="card"><h3 class="h3 with-ic"><span class="ic-box">' + ic('banknote') + '</span>Harga & Finansial</h3>' +
      '<div class="field"><label class="label" for="fHarga">Harga Jual Utama (Etalase) <span class="req">*</span></label><label class="rp"><span>Rp</span><input id="fHarga" type="number" min="0" value="' + esc(d.harga) + '" placeholder="0"></label></div>' +
      '<div class="field mt-3"><label class="label" for="fCoret">Harga Coret / MSRP <span class="badge b-sky" id="hematPill" hidden></span></label><label class="rp"><span>Rp</span><input id="fCoret" type="number" min="0" value="' + esc(d.harga_coret) + '" placeholder="Opsional"></label></div>' +
      '<div class="field mt-3"><label class="label" for="fHpp">Harga Pokok Penjualan (HPP)</label><label class="rp"><span>Rp</span><input id="fHpp" type="number" min="0" value="' + esc(d.hpp) + '" placeholder="Opsional"></label><small class="muted">Data rahasia: pembeli tidak dapat melihat HPP.</small></div>' +
      '<div class="margin" id="marginBox"></div></section>' +
      // Inventaris
      '<section class="card"><h3 class="h3 with-ic"><span class="ic-box">' + ic('warehouse') + '</span>Inventaris & SKU</h3>' +
      '<div class="field"><label class="label" for="fSku">SKU Induk</label><input id="fSku" value="' + esc(d.sku) + '" placeholder="Kosongkan untuk dibuat otomatis"></div>' +
      '<div class="row-between mt-3"><span class="label">Stok tidak terbatas</span>' + toggle('fUnl', d.unlimited) + '</div>' +
      (!d.unlimited ? '<div class="form-grid mt-3"><div class="field"><label class="label" for="fStok">Total Stok</label><input id="fStok" type="number" min="0" value="' + esc(d.stok) + '"' + (varOn && d.varian.every(v => v.stok !== '' && v.stok != null) ? ' disabled title="Dihitung dari stok varian"' : '') + '></div><div class="field"><label class="label" for="fKritis">Batas Kritis</label><input id="fKritis" type="number" min="0" value="' + esc(d.batas_kritis) + '"></div></div><small class="muted">Peringatan muncul di Ringkasan saat stok ≤ batas kritis.</small>' : '<small class="muted d-block mt-2">Cocok untuk produk digital atau jasa tanpa kuota.</small>') + '</section>' +
      // Etalase
      '<section class="card"><h3 class="h3 with-ic"><span class="ic-box">' + ic('globe') + '</span>Etalase Publik</h3>' +
      '<div class="opt-row"><div><b>Tampilkan di Publik</b><small>Dapat dicari & dibeli pelanggan</small></div>' + toggle('fAktif', d.aktif) + '</div>' +
      '<div class="opt-row"><div><b>Produk Unggulan</b><small>Diprioritaskan di urutan "Paling Populer"</small></div>' + toggle('fUnggul', d.unggulan) + '</div></section>' +
      '</aside></form>' +
      '<div class="savebar"><span class="muted small" id="draftInfo">' + (PF.draftAt ? '<i class="dot ok"></i>Draf otomatis tersimpan ' + timeAgo(PF.draftAt) + ' di perangkat ini.' : '<i class="dot"></i>Perubahan tersimpan otomatis sebagai draf di perangkat ini.') + '</span><div class="row-gap"><button class="btn btn-text danger" id="pfDiscard">Buang Draf</button><button class="btn btn-primary" id="pfSave"' + (ce ? '' : ' disabled') + '>' + ic('save') + (d.id ? 'Simpan Perubahan' : 'Simpan & Terbitkan Produk') + '</button></div></div>';
    renderMargin(); refreshIcons(box);
    const nm = $('#fNama'); nm.addEventListener('input', () => { $('#namaCount').textContent = nm.value.length + '/150 karakter'; });
  }
  async function uploadPhotos(files) {
    files = files.slice(0, 8 - PF.data.foto.length);
    if (!files.length) return;
    PF.uploading = files.length; collectForm(); renderForm();
    await Promise.all(files.map(async f => {
      try {
        const c = await compressImage(f, 1000, 0.82);
        const r = await api('uploadImage', { file: c });
        if (r.success) { PF.data.foto.push(r.data.id); PF.dirty = true; } else toast(r.message, 'error');
      } catch (e) { toast(e.message, 'error'); }
      PF.uploading--; collectForm(); renderForm();
    }));
    saveDraftDebounced();
  }
  async function saveProduct() {
    collectForm();
    const d = PF.data;
    if (String(d.nama).trim().length < 2) { toast('Nama produk wajib diisi.', 'warning'); $('#fNama').focus(); return; }
    if (!d.kategori) { toast('Pilih kategori produk.', 'warning'); return; }
    if (!(+d.harga > 0)) { toast('Harga jual harus lebih dari 0.', 'warning'); $('#fHarga').focus(); return; }
    if (d.varian.some(v => !String(v.nama).trim())) { toast('Lengkapi nama setiap varian atau hapus baris kosong.', 'warning'); return; }
    if (PF.uploading) { toast('Tunggu unggahan foto selesai.', 'warning'); return; }
    const b = $('#pfSave'); setBusy(b, true, 'Menyimpan...');
    const r = await api('productSave', Object.assign({}, d, { harga: +d.harga, harga_coret: +d.harga_coret || 0, hpp: +d.hpp || 0, stok: +d.stok || 0, batas_kritis: +d.batas_kritis || 5, berat: +d.berat || 0 }));
    setBusy(b, false);
    if (!r.success) { toast(r.message, 'error'); return; }
    Store.del(akey('draft:' + (PF.id || 'new'))); PF.dirty = false;
    toast(r.message, 'success');
    Store.del('c:' + akey('products')); Store.del('c:catalog');
    Adm.products = null; go('admin/produk');
  }
  async function discardDraft() {
    if (!(await confirmDialog('Buang draf?', 'Perubahan yang belum disimpan akan hilang.', 'Buang', true))) return;
    Store.del(akey('draft:' + (PF.id || 'new'))); PF.draftAt = 0;
    PF.data = PF.id ? JSON.parse(JSON.stringify(Adm.products.find(p => p.id === PF.id))) : blankProduct();
    renderForm();
  }

  /* ======================================================== 4. PESANAN & E-KASIR */
  const OL = { tab: 'semua', q: '', metode: '', range: '30', page: 1, open: '', detail: null };
  const OTABS = [['semua', 'Semua'], ['verifikasi', 'Perlu Verifikasi'], ['bayar', 'Menunggu Bayar'], ['proses', 'Diproses'], ['kirim', 'Dikirim'], ['selesai', 'Selesai'], ['batal', 'Dibatalkan']];
  function orderTabMatch(o, t) {
    if (t === 'semua') return true;
    if (t === 'verifikasi') return o.status_bayar === 'Menunggu Verifikasi' && o.status_pesanan !== 'Dibatalkan';
    if (t === 'bayar') return (o.status_bayar === 'Menunggu Pembayaran' || o.status_bayar === 'Ditolak') && o.status_pesanan !== 'Dibatalkan';
    if (t === 'proses') return o.status_pesanan === 'Diproses' || (o.status_pesanan === 'Baru' && o.status_bayar === 'Lunas');
    if (t === 'kirim') return o.status_pesanan === 'Dikirim';
    if (t === 'selesai') return o.status_pesanan === 'Selesai';
    if (t === 'batal') return o.status_pesanan === 'Dibatalkan';
  }
  apage('pesanan', {
    title: 'Pesanan / E-Kasir', perm: 'pesanan',
    template: () => `
      <div class="ahead"><div><h1 class="ah1">Manajemen Pesanan & E-Kasir <span class="badge b-violet live">${ic('radio')}Live Sync</span></h1><p class="muted">Pantau pesanan, validasi transfer pembeli, dan catat transaksi kasir secara instan.</p></div>
        <div class="row-gap"><button class="btn btn-ghost" id="oExp">${ic('download')}Export Excel</button><button class="btn btn-primary" id="posBtn">${ic('shopping-cart')}+ Transaksi Kasir (POS)</button></div></div>
      <div class="chips otabs" id="oTabs"></div>
      <div class="card filters"><label class="input-ic grow">${ic('search')}<input id="oQ" placeholder="Cari no. pesanan, nama customer, WhatsApp..."></label>
        <select id="oMetode" aria-label="Metode"><option value="">Semua Metode</option><option value="gateway">Payment Gateway</option><option value="manual">Transfer Manual</option><option value="kasir">Kasir (POS)</option></select>
        <select id="oRange" aria-label="Periode"><option value="1">Hari Ini</option><option value="7">7 Hari</option><option value="30" selected>30 Hari</option><option value="all">Semua</option></select>
        <button class="iconbtn" id="oRefresh" aria-label="Muat ulang" title="Muat ulang">${ic('refresh-cw')}</button></div>
      <div class="orders-layout"><div class="card p0" id="oTable"><div class="pad">${skeletonRows(8)}</div></div><aside class="order-panel card" id="oPanel" hidden></aside></div>`,
    init(el) {
      $('#oTabs', el).onclick = e => { const t = e.target.closest('[data-otab]'); if (!t) return; OL.tab = t.dataset.otab; OL.page = 1; renderOrders(); };
      $('#oQ', el).addEventListener('input', debounce(e => { OL.q = e.target.value.trim().toLowerCase(); OL.page = 1; renderOrders(); }, 200));
      $('#oMetode', el).onchange = e => { OL.metode = e.target.value; OL.page = 1; renderOrders(); };
      $('#oRange', el).onchange = e => { OL.range = e.target.value; OL.page = 1; renderOrders(); };
      $('#oRefresh', el).onclick = async e => { const b = e.currentTarget; b.classList.add('spinning'); await refreshOrders(true); b.classList.remove('spinning'); };
      $('#posBtn', el).onclick = openPos;
      $('#oExp', el).onclick = () => downloadCsv('pesanan', ['no_pesanan', 'tanggal', 'nama', 'whatsapp', 'email', 'items', 'subtotal', 'diskon', 'ongkir', 'total', 'metode', 'status_bayar', 'status_pesanan', 'resi'], filteredOrders().map(o => [o.id, fmtDate(o.tanggal, true), o.nama, o.hp, o.email, o.items.map(i => i.nama + (i.varian ? ' (' + i.varian + ')' : '') + ' x' + i.qty).join('; '), o.subtotal, o.diskon, o.ongkir, o.total, o.metode, o.status_bayar, o.status_pesanan, o.resi]));
      el.addEventListener('click', e => {
        const row = e.target.closest('[data-orow]'); if (row && !e.target.closest('a,button,input')) { openOrder(row.dataset.orow); return; }
        const pg = e.target.closest('[data-opg]'); if (pg && !pg.disabled) { OL.page = +pg.dataset.opg; renderOrders(); }
        if (e.target.closest('[data-retry]')) refreshOrders(true);
      });
    },
    show(el, parts, q) {
      if (q.tab) OL.tab = q.tab;
      if (q.q) { OL.q = q.q.toLowerCase(); $('#oQ', el).value = q.q; OL.range = 'all'; $('#oRange', el).value = 'all'; }
      $('#posBtn', el).hidden = !can('pesanan', 'ubah');
      if (Adm.orders) renderOrders();
      refreshOrders(false).then(() => { if (q.id) openOrder(q.id); });
      if (q.id && Adm.orders) openOrder(q.id);
      startPoll(() => refreshOrders(true));
    }
  });
  function filteredOrders() {
    if (!Adm.orders) return [];
    const cut = OL.range === 'all' ? 0 : OL.range === '1' ? new Date(new Date().toDateString()).getTime() : Date.now() - (+OL.range) * 864e5;
    return Adm.orders.filter(o => orderTabMatch(o, OL.tab) && new Date(o.tanggal).getTime() >= cut &&
      (!OL.metode || (OL.metode === 'kasir' ? o.sumber === 'kasir' : o.metode === OL.metode)) &&
      (!OL.q || (o.id + ' ' + o.nama + ' ' + o.hp + ' ' + o.email + ' ' + o.items.map(i => i.nama).join(' ')).toLowerCase().includes(OL.q))).slice().reverse();
  }
  function metodeLabel(o) { return o.sumber === 'kasir' ? '<span class="mpill">' + ic('store') + 'Kasir ' + esc(String(o.metode).split(':')[1] || '') + '</span>' : o.metode === 'gateway' ? '<span class="mpill">' + ic('zap') + 'Gateway</span>' : '<span class="mpill">' + ic('landmark') + 'Transfer</span>'; }
  function renderOrders() {
    const el = $('.apage[data-apage="pesanan"]'); if (!el || !Adm.orders) return;
    const all = Adm.orders;
    $('#oTabs', el).innerHTML = OTABS.map(t => { const n = all.filter(o => orderTabMatch(o, t[0])).length; return '<button class="chip' + (OL.tab === t[0] ? ' active' : '') + '" data-otab="' + t[0] + '">' + (t[0] === 'verifikasi' && n ? '<i class="pulse-dot"></i>' : '') + t[1] + '<span class="chip-n">' + n + '</span></button>'; }).join('');
    const list = filteredOrders(), page = list.slice((OL.page - 1) * 15, OL.page * 15);
    $('#oTable', el).innerHTML = page.length ? '<div class="tbl-wrap"><table class="tbl orders"><thead><tr><th>No. Pesanan</th><th>Waktu</th><th>Customer</th><th class="ta-r">Total</th><th>Metode</th><th>Pembayaran</th><th>Status</th></tr></thead><tbody>' +
      page.map(o => '<tr class="click' + (OL.open === o.id ? ' sel' : '') + '" data-orow="' + esc(o.id) + '" tabindex="0"><td><b class="mono ' + (OL.open === o.id ? 'txt-violet' : '') + '">#' + esc(o.id) + '</b><small class="d-block muted">' + esc((o.items[0] || {}).kategori || '') + ' • ' + o.items.reduce((s, i) => s + i.qty, 0) + ' item</small></td><td><span class="nowrap">' + new Date(o.tanggal).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB</span><small class="d-block muted">' + fmtDate(o.tanggal) + '</small></td><td><b>' + esc(o.nama) + '</b><small class="d-block muted">' + esc(o.hp ? '+' + o.hp : '-') + '</small></td><td class="ta-r"><b>' + fmtRp(o.total) + '</b></td><td>' + metodeLabel(o) + '</td><td>' + badge(o.status_bayar) + '</td><td>' + badge(o.status_pesanan) + '</td></tr>').join('') +
      '</tbody></table></div>' + pager(list.length, OL.page, 15, 'data-opg')
      : '<div class="empty"><div class="empty-art">' + ic('inbox') + '</div><h3>Tidak ada pesanan</h3><p class="muted">Belum ada pesanan pada filter ini.</p></div>';
    refreshIcons(el);
    if (OL.open) { const o = all.find(x => x.id === OL.open); if (o && (!OL.detail || OL.detail.updated_at !== o.updated_at)) openOrder(OL.open, true); }
  }
  async function openOrder(id, silent) {
    OL.open = id;
    const base = (Adm.orders || []).find(o => o.id === id);
    if (!silent) $$('[data-orow]').forEach(r => r.classList.toggle('sel', r.dataset.orow === id));
    if (base) renderOrderPanel(Object.assign({}, base, { log: (OL.detail && OL.detail.id === id && OL.detail.log) || null }));
    const r = await api('orderDetail', { id });
    if (r.success) { OL.detail = r.data.order; renderOrderPanel(r.data.order); }
    else if (!base) toast(r.message, 'error');
  }
  function renderOrderPanel(o) {
    const wide = window.matchMedia('(min-width: 1280px)').matches;
    let host = $('#oPanel'), m = null;
    if (!wide) { const ex = $('.modal-side .order-panel-m'); if (ex) host = ex; else { m = modal('<div class="order-panel-m"></div>', { side: true, cls: 'modal-order', onClose: () => { OL.open = ''; } }); host = m.el.querySelector('.order-panel-m'); } }
    else host.hidden = false;
    const needVerif = o.status_bayar === 'Menunggu Verifikasi' && o.status_pesanan !== 'Dibatalkan';
    const canV = can('verifikasi', 'ubah'), canE = can('pesanan', 'ubah');
    const statuses = ['Baru', 'Diproses', 'Dikirim', 'Selesai', 'Dibatalkan'];
    host.innerHTML =
      '<div class="op-head"><div><h3 class="h3"><span class="mono">#' + esc(o.id) + '</span> ' + (needVerif ? '<span class="badge b-amber">Verifikasi Diperlukan</span>' : badge(o.status_pesanan)) + '</h3><small class="muted">Dibuat ' + fmtDate(o.tanggal, true) + ' via ' + (o.sumber === 'kasir' ? 'Kasir' : 'Toko Web') + '</small></div><button class="iconbtn" id="opClose" aria-label="Tutup panel">' + ic('x') + '</button></div>' +
      (needVerif && canV ? '<div class="op-box"><span class="op-label">Aksi Cepat Kasir / Finansial</span><div class="op-act"><button class="btn btn-success" id="opOk">' + ic('circle-check') + 'Verifikasi (Lunas)</button><button class="btn btn-danger-soft" id="opNo">' + ic('circle-x') + 'Tolak Bukti</button></div></div>' : '') +
      (o.ada_bukti ? '<div class="op-box"><div class="row-between"><span class="op-label">' + ic('receipt') + 'Bukti Unggahan Pembeli</span><span class="txt-violet small b">Transfer Manual</span></div><div class="proof" id="proofImg"><div class="sk" style="height:200px"></div></div></div>' : '') +
      '<div class="op-box"><div class="row-between"><span class="op-label">Informasi Pembeli</span>' + (o.hp ? '<a class="link sm" href="' + waLink(o.hp, 'Halo ' + o.nama + ', terkait pesanan ' + o.id + ' di ' + storeName() + '...') + '" target="_blank" rel="noopener">' + ic('message-circle') + 'Chat WhatsApp</a>' : '') + '</div>' +
      '<div class="who lg"><span class="av">' + esc(initials(o.nama)) + '</span><div><b>' + esc(o.nama) + '</b><small class="muted d-block">' + esc(o.email || '-') + (o.hp ? ' • +' + esc(o.hp) : '') + '</small></div></div>' + (o.alamat ? '<p class="addr">' + ic('map-pin') + esc(o.alamat) + '</p>' : '') + (o.catatan ? '<p class="addr">' + ic('sticky-note') + esc(o.catatan) + '</p>' : '') + '</div>' +
      '<span class="op-label">Item Pesanan (' + o.items.length + ' produk)</span><div class="op-items">' + o.items.map(it => '<div class="op-item">' + productImg({ foto: it.foto ? [it.foto] : [], kategori: it.kategori, nama: it.nama }, 120, 'xs') + '<div><b>' + esc(it.nama) + '</b><small class="muted">' + (it.varian ? 'Varian: ' + esc(it.varian) + ' • ' : '') + it.qty + 'x ' + fmtRp(it.harga) + '</small></div><b class="txt-violet">' + fmtRp(it.harga * it.qty) + '</b></div>').join('') + '</div>' +
      '<div class="op-sum"><div><span>Subtotal Produk</span><span>' + fmtRp(o.subtotal) + '</span></div>' + (o.ongkir ? '<div><span>Biaya Pengiriman</span><span>' + fmtRp(o.ongkir) + '</span></div>' : '') + (o.diskon ? '<div class="txt-green"><span>Voucher ' + esc(o.voucher || 'Diskon') + '</span><span>-' + fmtRp(o.diskon) + '</span></div>' : '') + '<div class="tot"><span>Total Akhir Pembayaran</span><span class="txt-violet">' + fmtRp(o.total) + '</span></div></div>' +
      (canE && o.status_pesanan !== 'Dibatalkan' ? '<span class="op-label">Ubah Status Operasional</span><div class="op-status"><select id="opSt" aria-label="Status pesanan">' + statuses.map(s => '<option' + (s === o.status_pesanan ? ' selected' : '') + '>' + s + '</option>').join('') + '</select><button class="btn btn-primary" id="opSave">Simpan Status</button></div><div class="op-resi" id="opResiBox"' + (o.status_pesanan === 'Dikirim' || o.resi ? '' : ' hidden') + '><input id="opResi" placeholder="No. resi pengiriman (opsional)" value="' + esc(o.resi || '') + '"></div>' +
        '<div class="info-box sky mt-3">' + ic('info') + '<p>Customer menerima notifikasi otomatis via <b>WhatsApp & Email</b> begitu status pesanan diubah.</p></div>' : '') +
      '<div class="row-gap mt-3">' + (o.invoice_url ? '<a class="btn btn-ghost btn-sm" href="' + esc(o.invoice_url) + '" target="_blank" rel="noopener">' + ic('file-down') + 'Invoice PDF</a>' : '') + (o.sumber === 'kasir' ? '<button class="btn btn-ghost btn-sm" id="opStruk">' + ic('printer') + 'Cetak Struk</button>' : '') + '</div>' +
      (o.log ? '<span class="op-label mt-6">Log Aktivitas & Waktu</span><ul class="timeline sm">' + o.log.slice().reverse().map(l => '<li><span class="tl-dot"></span><div><b>' + esc(l.a) + '</b><small class="muted">' + esc(l.by || 'sistem') + ' • ' + fmtDate(l.t, true) + '</small></div></li>').join('') + '</ul>' : '<div class="sk sk-line mt-6"></div>');
    refreshIcons(host);
    const close = () => { OL.open = ''; if (wide) $('#oPanel').hidden = true; else { const mw = host.closest('.modal-wrap'); if (mw) mw.querySelector('.modal-bg').click(); } $$('[data-orow]').forEach(r => r.classList.remove('sel')); };
    host.querySelector('#opClose').onclick = close;
    if (o.ada_bukti) loadProof(o.id);
    const st = host.querySelector('#opSt'); if (st) st.onchange = () => { host.querySelector('#opResiBox').hidden = st.value !== 'Dikirim'; };
    const sv = host.querySelector('#opSave'); if (sv) sv.onclick = () => setOrderStatus(o, st.value, (host.querySelector('#opResi') || {}).value, sv);
    const ok = host.querySelector('#opOk'); if (ok) ok.onclick = () => verifyOrder(o, true, ok);
    const no = host.querySelector('#opNo'); if (no) no.onclick = () => verifyOrder(o, false, no);
    const sk = host.querySelector('#opStruk'); if (sk) sk.onclick = () => printReceipt(o);
  }
  const proofCache = {};
  async function loadProof(id) {
    const box = () => $('#proofImg') || $('.modal .proof');
    const show = d => { const b = box(); if (!b) return; if (d.data && /^data:image/.test(d.data)) { b.innerHTML = '<img src="' + d.data + '" alt="Bukti transfer">'; b.onclick = () => modal('<div class="modal-head"><h3 class="h3">Bukti Transfer #' + esc(id) + '</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="modal-body center"><img src="' + d.data + '" alt="Bukti transfer" class="proof-full"></div><div class="modal-foot"><a class="btn btn-ghost" download="bukti-' + esc(id) + '" href="' + d.data + '">' + ic('download') + 'Unduh</a><button class="btn btn-primary" data-close>Tutup</button></div>', { cls: 'modal-lg' }); }
      else if (d.data) b.innerHTML = '<a class="btn btn-ghost btn-block" download="bukti-' + esc(id) + '.pdf" href="' + d.data + '">' + ic('file-text') + 'Unduh bukti (PDF)</a>';
      else b.innerHTML = '<a class="btn btn-ghost btn-block" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + ic('external-link') + 'Buka bukti di Drive</a>'; refreshIcons(b); };
    if (proofCache[id]) return show(proofCache[id]);
    const r = await api('proofImage', { id });
    if (r.success) { proofCache[id] = r.data; show(r.data); } else { const b = box(); if (b) b.innerHTML = '<p class="muted small">' + esc(r.message) + '</p>'; }
  }
  function patchOrder(o) {
    const i = (Adm.orders || []).findIndex(x => x.id === o.id);
    if (i > -1) { const keep = Adm.orders[i]; Adm.orders[i] = Object.assign({}, keep, o); delete Adm.orders[i].log; }
    OL.detail = o; Store.del('c:' + akey('orders')); Store.del('c:' + akey('dashboard'));
  }
  async function setOrderStatus(o, status, resi, btn) {
    if (status === o.status_pesanan && (resi || '') === (o.resi || '')) { toast('Tidak ada perubahan.', 'info'); return; }
    let alasan = '';
    if (status === 'Dibatalkan') { if (!(await confirmDialog('Batalkan pesanan?', 'Stok produk akan dikembalikan dan customer diberi tahu.', 'Batalkan Pesanan', true))) return; alasan = prompt('Alasan pembatalan (dikirim ke customer):', 'Stok tidak tersedia') || ''; }
    setBusy(btn, true, 'Menyimpan...');
    const r = await api('orderSetStatus', { id: o.id, status, resi, alasan });
    setBusy(btn, false);
    if (!r.success) { toast(r.message, 'error'); return; }
    toast(r.message, 'success'); patchOrder(r.data.order); renderOrders(); renderOrderPanel(r.data.order); refreshBadges();
  }
  async function verifyOrder(o, terima, btn) {
    let alasan = '';
    if (!terima) { alasan = prompt('Alasan penolakan (dikirim ke customer):', 'Nominal transfer tidak sesuai'); if (alasan === null) return; }
    setBusy(btn, true, terima ? 'Memverifikasi...' : 'Menolak...');
    const r = await api('orderVerify', { id: o.id, terima, alasan });
    setBusy(btn, false);
    if (!r.success) { toast(r.message, 'error'); return; }
    toast(r.message, 'success'); patchOrder(r.data.order); renderOrders(); renderOrderPanel(r.data.order); refreshBadges();
  }
  function refreshBadges() {
    if (!Adm.orders) return;
    Adm.badges = { verifikasi: Adm.orders.filter(o => o.status_bayar === 'Menunggu Verifikasi' && o.status_pesanan !== 'Dibatalkan').length, baru: Adm.orders.filter(o => o.status_pesanan === 'Baru' || o.status_pesanan === 'Diproses').length };
    renderBadges();
  }
  /* ---------- POS ---------- */
  const POS = { lines: [], q: '', bayar: 'Tunai' };
  async function openPos() {
    if (!Adm.products) { toast('Memuat produk...', 'info'); await aswr('products', {}, () => { }); }
    POS.lines = []; POS.q = ''; POS.bayar = 'Tunai';
    const m = modal('<div class="modal-head"><h3 class="h3 with-ic"><span class="ic-box grad">' + ic('store') + '</span>Transaksi Kasir (POS)</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="pos"><div class="pos-left"><label class="input-ic">' + ic('scan-barcode') + '<input id="posQ" placeholder="Cari produk / scan SKU lalu Enter" autocomplete="off"></label><div class="pos-grid" id="posGrid"></div></div><div class="pos-right" id="posRight"></div></div>', { cls: 'modal-xl', sticky: true });
    const el = m.el;
    const renderGrid = () => {
      const q = POS.q.toLowerCase();
      const list = Adm.products.filter(p => p.aktif && (!q || (p.nama + ' ' + p.sku).toLowerCase().includes(q))).slice(0, 40);
      $('#posGrid', el).innerHTML = list.map(p => { const out = !p.unlimited && p.stok <= 0; return '<button class="pos-item' + (out ? ' out' : '') + '" data-pos="' + esc(p.id) + '"' + (out ? ' disabled' : '') + '>' + productImg(p, 200, 'xs') + '<span class="clip2">' + esc(p.nama) + '</span><b>' + fmtRp(p.harga) + '</b><small class="muted">' + (p.unlimited ? '∞' : 'Stok ' + p.stok) + '</small></button>'; }).join('') || '<p class="muted">Produk tidak ditemukan.</p>';
      refreshIcons($('#posGrid', el));
    };
    const total = () => POS.lines.reduce((s, l) => s + l.harga * l.qty, 0);
    const renderRight = () => {
      const sub = total(), dis = Math.min(sub, +($('#posDis', el) || {}).value || 0), tot = sub - dis;
      const tunai = +($('#posCash', el) || {}).value || 0;
      const keepVals = { nama: ($('#posNama', el) || {}).value || '', hp: ($('#posHp', el) || {}).value || '', dis: ($('#posDis', el) || {}).value || '', cash: ($('#posCash', el) || {}).value || '' };
      $('#posRight', el).innerHTML = '<span class="op-label">Keranjang Kasir</span><div class="pos-lines">' + (POS.lines.length ? POS.lines.map((l, i) => '<div class="pos-line"><div><b>' + esc(l.nama) + '</b>' + (l.varian ? '<small class="muted d-block">' + esc(l.varian) + '</small>' : '') + '<small class="muted">' + fmtRp(l.harga) + '</small></div><div class="stepper"><button data-pq="' + i + '" data-d="-1" aria-label="Kurangi">' + ic('minus') + '</button><span>' + l.qty + '</span><button data-pq="' + i + '" data-d="1" aria-label="Tambah">' + ic('plus') + '</button></div><b>' + fmtRp(l.harga * l.qty) + '</b></div>').join('') : '<p class="muted small center">Klik produk di kiri untuk menambahkan.</p>') + '</div>' +
        '<div class="form-grid mt-3"><input id="posNama" placeholder="Nama pelanggan (opsional)" value="' + esc(keepVals.nama) + '"><input id="posHp" placeholder="No. WA (opsional)" inputmode="tel" value="' + esc(keepVals.hp) + '"></div>' +
        '<span class="op-label mt-3">Metode Bayar</span><div class="seg full" id="posPay">' + ['Tunai', 'QRIS', 'Transfer', 'Debit'].map(x => '<button class="' + (POS.bayar === x ? 'on' : '') + '" data-pay="' + x + '">' + x + '</button>').join('') + '</div>' +
        '<div class="form-grid mt-3"><label class="rp"><span>Diskon</span><input id="posDis" type="number" min="0" value="' + esc(keepVals.dis) + '" placeholder="0"></label>' + (POS.bayar === 'Tunai' ? '<label class="rp"><span>Tunai</span><input id="posCash" type="number" min="0" value="' + esc(keepVals.cash) + '" placeholder="Uang diterima"></label>' : '') + '</div>' +
        '<div class="pos-total"><div><span>Total</span><b>' + fmtRp(tot) + '</b></div>' + (POS.bayar === 'Tunai' && tunai ? '<div><span>Kembalian</span><b class="' + (tunai >= tot ? 'txt-green' : 'txt-red') + '">' + fmtRp(Math.max(0, tunai - tot)) + '</b></div>' : '') + '</div>' +
        '<button class="btn btn-accent btn-lg btn-block" id="posSave"' + (POS.lines.length ? '' : ' disabled') + '>' + ic('printer') + 'Simpan & Cetak Struk</button>';
      refreshIcons($('#posRight', el));
    };
    el.addEventListener('input', debounce(e => { if (e.target.id === 'posQ') { POS.q = e.target.value; renderGrid(); } if (e.target.id === 'posDis' || e.target.id === 'posCash') { const f = document.activeElement.id; renderRight(); const x = $('#' + f, el); if (x) { x.focus(); try { x.setSelectionRange(x.value.length, x.value.length); } catch (er) { } } } }, 150));
    el.addEventListener('keydown', e => { if (e.target.id === 'posQ' && e.key === 'Enter') { const p = Adm.products.find(x => (x.sku || '').toLowerCase() === e.target.value.trim().toLowerCase()); if (p) { addPos(p); e.target.value = ''; POS.q = ''; renderGrid(); } } });
    const addPos = p => {
      const v = p.varian && p.varian.length ? p.varian[0].nama : '';
      const go2 = varian => { const l = POS.lines.find(x => x.id === p.id && x.varian === varian); const max = p.unlimited ? 9999 : p.stok; const cur = POS.lines.filter(x => x.id === p.id).reduce((s, x) => s + x.qty, 0); if (cur + 1 > max) { toast('Stok tidak cukup.', 'warning'); return; } if (l) l.qty++; else POS.lines.push({ id: p.id, nama: p.nama, varian, harga: priceOf(p, varian), qty: 1 }); renderRight(); };
      if (p.varian && p.varian.length > 1) {
        const vm = modal('<div class="modal-body"><h3 class="h3">Pilih varian — ' + esc(p.nama) + '</h3><div class="var-pills">' + p.varian.map(x => '<button class="var-pill" data-vp="' + esc(x.nama) + '">' + esc(x.nama) + '</button>').join('') + '</div></div>', { cls: 'modal-sm' });
        vm.el.onclick = e => { const b = e.target.closest('[data-vp]'); if (b) { vm.close(); go2(b.dataset.vp); } };
      } else go2(v);
    };
    el.addEventListener('click', async e => {
      const it = e.target.closest('[data-pos]'); if (it) { addPos(Adm.products.find(p => p.id === it.dataset.pos)); return; }
      const pq = e.target.closest('[data-pq]'); if (pq) { const l = POS.lines[+pq.dataset.pq]; l.qty += +pq.dataset.d; if (l.qty < 1) POS.lines.splice(+pq.dataset.pq, 1); renderRight(); return; }
      const pay = e.target.closest('[data-pay]'); if (pay) { POS.bayar = pay.dataset.pay; renderRight(); return; }
      if (e.target.closest('#posSave')) {
        const tot = total() - (+$('#posDis', el).value || 0), cash = +(($('#posCash', el) || {}).value || 0);
        if (POS.bayar === 'Tunai' && cash && cash < tot) { toast('Uang tunai kurang dari total.', 'warning'); return; }
        const b = $('#posSave', el); setBusy(b, true, 'Menyimpan...');
        const r = await api('posCreate', { items: POS.lines.map(l => ({ id: l.id, varian: l.varian, qty: l.qty })), nama: $('#posNama', el).value, hp: $('#posHp', el).value, bayar: POS.bayar, diskon: +$('#posDis', el).value || 0, tunai: cash });
        setBusy(b, false);
        if (!r.success) { toast(r.message, 'error'); return; }
        toast('Transaksi ' + r.data.order.id + ' tersimpan.', 'success');
        printReceipt(r.data.order, r.data.bayar, r.data.kembali);
        m.close(); Store.del('c:' + akey('products')); Store.del('c:catalog'); Adm.products = null;
        if (Adm.orders) { Adm.orders.push(r.data.order); renderOrders(); }
        refreshOrders(true);
      }
    });
    renderGrid(); renderRight();
    setTimeout(() => $('#posQ', el).focus(), 80);
  }
  function printReceipt(o, bayar, kembali) {
    const s = Adm.store || {};
    const html = '<html><head><meta charset="utf-8"><title>Struk ' + esc(o.id) + '</title><style>body{font-family:ui-monospace,Menlo,Consolas,monospace;width:58mm;margin:0 auto;padding:8px;font-size:11px;color:#000}h1{font-size:14px;text-align:center;margin:0}p{margin:2px 0;text-align:center}.l{display:flex;justify-content:space-between;gap:6px}hr{border:0;border-top:1px dashed #000;margin:6px 0}.b{font-weight:bold}</style></head><body>' +
      '<h1>' + esc(s.toko_nama || 'E-TOKO') + '</h1><p>' + esc(s.toko_alamat || '') + '</p><hr><div class="l"><span>' + esc(o.id) + '</span><span>' + fmtDate(o.tanggal, true) + '</span></div><div class="l"><span>Kasir</span><span>' + esc(Adm.me.nama) + '</span></div>' + (o.nama ? '<div class="l"><span>Pelanggan</span><span>' + esc(o.nama) + '</span></div>' : '') + '<hr>' +
      o.items.map(i => '<div>' + esc(i.nama) + (i.varian ? ' (' + esc(i.varian) + ')' : '') + '</div><div class="l"><span>' + i.qty + ' x ' + fmtRp(i.harga) + '</span><span>' + fmtRp(i.qty * i.harga) + '</span></div>').join('') +
      '<hr><div class="l"><span>Subtotal</span><span>' + fmtRp(o.subtotal) + '</span></div>' + (o.diskon ? '<div class="l"><span>Diskon</span><span>-' + fmtRp(o.diskon) + '</span></div>' : '') + '<div class="l b"><span>TOTAL</span><span>' + fmtRp(o.total) + '</span></div><div class="l"><span>Bayar (' + esc(String(o.metode).split(':')[1] || '') + ')</span><span>' + fmtRp(bayar || o.total) + '</span></div>' + (kembali ? '<div class="l"><span>Kembali</span><span>' + fmtRp(kembali) + '</span></div>' : '') +
      '<hr><p>Terima kasih atas kunjungan Anda!</p></body></html>';
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { } setTimeout(() => f.remove(), 2000); }, 250);
  }

  /* ======================================================== 5. CRM */
  const CR = { q: '', sort: 'belanja', page: 1, open: '' };
  apage('crm', {
    title: 'Customer CRM', perm: 'crm',
    template: () => `
      <div class="ahead"><div><h1 class="ah1">Customer CRM</h1><p class="muted">Profil pelanggan, riwayat transaksi, dan nilai belanja untuk analisis pelanggan.</p></div><button class="btn btn-ghost" id="cExp">${ic('download')}Ekspor CSV</button></div>
      <div class="stats4" id="crmStats"></div>
      <div class="crm-layout"><div><div class="card filters"><label class="input-ic grow">${ic('search')}<input id="cQ" placeholder="Cari nama, no. WhatsApp, atau email"></label><select id="cSort" aria-label="Urutkan"><option value="belanja">Total Belanja Tertinggi</option><option value="transaksi">Transaksi Terbanyak</option><option value="baru">Transaksi Terakhir</option><option value="nama">Nama A–Z</option></select></div><div class="card p0" id="cTable"><div class="pad">${skeletonRows(8)}</div></div></div>
        <aside class="card crm-panel" id="cPanel"><div class="empty sm"><span class="empty-art sm">${ic('user-round-search')}</span><p class="muted">Pilih pelanggan untuk melihat profil & riwayat.</p></div></aside></div>`,
    init(el) {
      $('#cQ', el).addEventListener('input', debounce(e => { CR.q = e.target.value.trim().toLowerCase(); CR.page = 1; renderCrm(); }, 200));
      $('#cSort', el).onchange = e => { CR.sort = e.target.value; renderCrm(); };
      $('#cExp', el).onclick = () => downloadCsv('pelanggan', ['nama', 'whatsapp', 'email', 'alamat', 'jumlah_transaksi', 'total_belanja', 'transaksi_pertama', 'transaksi_terakhir', 'catatan'], (Adm.customers || []).map(c => [c.nama, c.hp, c.email, c.alamat, c.total_transaksi, c.total_belanja, fmtDate(c.first_order), fmtDate(c.last_order), c.catatan]));
      el.addEventListener('click', e => { const r = e.target.closest('[data-crow]'); if (r) openCustomer(r.dataset.crow); const pg = e.target.closest('[data-cpg]'); if (pg && !pg.disabled) { CR.page = +pg.dataset.cpg; renderCrm(); } if (e.target.closest('[data-retry]')) loadCrm(true); });
    },
    show(el, parts, q) { if (q.q) { CR.q = q.q.toLowerCase(); $('#cQ', el).value = q.q; } loadCrm(false); }
  });
  function loadCrm(force) { if (Adm.customers) renderCrm(); aswr('customers', {}, () => renderCrm(), { fresh: force ? 0 : 60000, onError: r => { $('#cTable').innerHTML = errorState(r, 'c'); refreshIcons($('#cTable')); } }); }
  function renderCrm() {
    const el = $('.apage[data-apage="crm"]'); if (!el || !Adm.customers) return;
    const C = Adm.customers, aktif30 = C.filter(c => Date.now() - new Date(c.last_order).getTime() < 30 * 864e5).length, repeat = C.filter(c => c.total_transaksi > 1).length, ltv = C.reduce((s, c) => s + c.total_belanja, 0);
    $('#crmStats', el).innerHTML = statCard({ label: 'Total Pelanggan', icon: 'users', value: fmtNum(C.length) }) + statCard({ label: 'Aktif 30 Hari', icon: 'activity', tone: 'sky', value: fmtNum(aktif30) }) + statCard({ label: 'Pelanggan Repeat Order', icon: 'repeat', value: fmtNum(repeat), sub: '<span class="muted">' + (C.length ? Math.round(repeat / C.length * 100) : 0) + '% dari total</span>' }) + statCard({ label: 'Rata-rata Nilai Pelanggan', icon: 'gem', tone: 'sky', value: fmtRp(C.length ? ltv / C.length : 0) });
    let l = C.filter(c => !CR.q || (c.nama + ' ' + c.hp + ' ' + c.email).toLowerCase().includes(CR.q) || (normHp(CR.q) && c.hp === normHp(CR.q)));
    const s = { belanja: (a, b) => b.total_belanja - a.total_belanja, transaksi: (a, b) => b.total_transaksi - a.total_transaksi, baru: (a, b) => String(b.last_order).localeCompare(String(a.last_order)), nama: (a, b) => a.nama.localeCompare(b.nama) };
    l.sort(s[CR.sort]);
    const page = l.slice((CR.page - 1) * 20, CR.page * 20);
    $('#cTable', el).innerHTML = page.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pelanggan</th><th>WhatsApp</th><th class="ta-r">Transaksi</th><th class="ta-r">Total Belanja</th><th>Terakhir</th></tr></thead><tbody>' + page.map(c => '<tr class="click' + (CR.open === c.hp ? ' sel' : '') + '" data-crow="' + esc(c.hp) + '" tabindex="0"><td><div class="who"><span class="av sm">' + esc(initials(c.nama)) + '</span><div><b>' + esc(c.nama) + '</b><small class="d-block muted">' + esc(c.email || '-') + '</small></div></div></td><td class="nowrap">+' + esc(c.hp) + '</td><td class="ta-r">' + c.total_transaksi + '</td><td class="ta-r"><b>' + fmtRp(c.total_belanja) + '</b></td><td class="nowrap">' + timeAgo(c.last_order) + '</td></tr>').join('') + '</tbody></table></div>' + pager(l.length, CR.page, 20, 'data-cpg') : '<div class="empty"><div class="empty-art">' + ic('users') + '</div><h3>Belum ada pelanggan</h3><p class="muted">Data pelanggan otomatis terbentuk dari setiap checkout.</p></div>';
    refreshIcons(el);
    if (!CR.open && page.length && window.matchMedia('(min-width: 1100px)').matches) openCustomer(page[0].hp);
  }
  async function openCustomer(hp) {
    CR.open = hp; $$('[data-crow]').forEach(r => r.classList.toggle('sel', r.dataset.crow === hp));
    const c = Adm.customers.find(x => x.hp === hp); if (!c) return;
    const wide = window.matchMedia('(min-width: 1100px)').matches;
    let host = $('#cPanel');
    if (!wide) host = modal('<div class="crm-panel-m"></div>', { side: true }).el.querySelector('.crm-panel-m');
    const favs = Object.keys(c.kategori_fav || {}).sort((a, b) => c.kategori_fav[b] - c.kategori_fav[a]);
    host.innerHTML = '<div class="crm-head"><span class="av xl">' + esc(initials(c.nama)) + '</span><h3 class="h3">' + esc(c.nama) + '</h3><small>+' + esc(c.hp) + ' • ' + esc(c.email || '-') + '</small></div>' +
      '<div class="mini3"><div><b>' + c.total_transaksi + '</b><small>Transaksi</small></div><div><b>' + fmtRp(c.total_belanja) + '</b><small>Total Belanja</small></div><div><b>' + fmtRp(c.total_transaksi ? c.total_belanja / Math.max(1, c.total_transaksi) : 0) + '</b><small>Rata-rata</small></div></div>' +
      (c.alamat ? '<p class="addr">' + ic('map-pin') + esc(c.alamat) + '</p>' : '') +
      (favs.length ? '<span class="op-label">Kategori Favorit</span><div class="row-gap">' + favs.map(k => '<span class="cat-pill static sm t-' + catTone(k) + '">' + esc(k) + ' · ' + c.kategori_fav[k] + '</span>').join('') + '</div>' : '') +
      '<span class="op-label mt-3">Catatan Internal</span><div class="note-box"><textarea id="cNote" rows="2" placeholder="Mis. pelanggan reseller, suka warna ungu...">' + esc(c.catatan || '') + '</textarea>' + (can('crm', 'ubah') ? '<button class="btn btn-soft btn-sm" id="cNoteSave">Simpan</button>' : '') + '</div>' +
      '<span class="op-label mt-3">Riwayat Transaksi</span><div id="cHist">' + skeletonRows(3) + '</div>' +
      '<a class="btn btn-ghost btn-block mt-3" href="' + waLink(c.hp, 'Halo ' + c.nama + ', ') + '" target="_blank" rel="noopener">' + ic('message-circle') + 'Hubungi via WhatsApp</a>';
    refreshIcons(host);
    const ns = host.querySelector('#cNoteSave'); if (ns) ns.onclick = async () => { setBusy(ns, true, '...'); const r = await api('customerNote', { hp, catatan: host.querySelector('#cNote').value }); setBusy(ns, false); if (r.success) { c.catatan = r.data.catatan; toast('Catatan disimpan.', 'success'); } else toast(r.message, 'error'); };
    const r = await api('customerDetail', { hp });
    const hb = host.querySelector('#cHist'); if (!hb) return;
    hb.innerHTML = r.success ? (r.data.orders.length ? '<ul class="timeline sm">' + r.data.orders.map(o => '<li><span class="tl-dot"></span><div><b class="mono"><a href="#/admin/pesanan?id=' + esc(o.id) + '" class="txt-violet">#' + esc(o.id) + '</a> · ' + fmtRp(o.total) + '</b><small class="muted">' + fmtDate(o.tanggal, true) + ' · ' + esc(o.status_bayar) + ' · ' + esc(o.status_pesanan) + '</small></div></li>').join('') + '</ul>' : '<p class="muted small">Belum ada transaksi.</p>') : '<p class="muted small">' + esc(r.message) + '</p>';
  }

  /* ======================================================== 6. LAPORAN */
  const RP = { from: '', to: '', group: 'harian', data: null, q: '', page: 1 };
  apage('laporan', {
    title: 'Laporan Penjualan', perm: 'laporan',
    template: () => `
      <div class="ahead"><div><h1 class="ah1">Laporan Penjualan</h1><p class="muted" id="repNote">Grafik & tabel penjualan yang dapat difilter dan diunduh.</p></div>
        <div class="row-gap"><button class="btn btn-ghost" id="repCsv">${ic('file-spreadsheet')}Unduh Excel</button><button class="btn btn-ghost" id="repPrint">${ic('printer')}Cetak / PDF</button></div></div>
      <div class="card filters rep-filters"><div class="seg" id="repPreset"><button data-p="7">7 Hari</button><button data-p="30" class="on">30 Hari</button><button data-p="90">90 Hari</button><button data-p="bulan">Bulan Ini</button></div>
        <label class="date-in">${ic('calendar')}<input type="date" id="repFrom" aria-label="Dari tanggal"></label><span class="muted">—</span><label class="date-in">${ic('calendar')}<input type="date" id="repTo" aria-label="Sampai tanggal"></label>
        <div class="seg" id="repGroup"><button data-g="harian" class="on">Harian</button><button data-g="mingguan">Mingguan</button></div></div>
      <div class="stats4" id="repStats">${'<div class="stat sk" style="height:120px"></div>'.repeat(4)}</div>
      <div class="card"><div class="card-h"><h3 class="h3" id="repChartTitle">Omzet Harian</h3><span class="muted small" id="repRange"></span></div><div id="repChart" class="chart-box"></div></div>
      <div class="dash-row"><div class="card p0"><div class="card-h pad"><h3 class="h3">Produk Terlaris</h3></div><div id="repTop"></div></div><div class="card"><h3 class="h3">Omzet per Kategori</h3><div id="repCat"></div></div></div>
      <div class="card p0"><div class="card-h pad"><h3 class="h3">Rincian Transaksi Lunas</h3><label class="input-ic sm">${ic('search')}<input id="repQ" placeholder="Cari no. pesanan / nama"></label></div><div id="repTx"></div></div>`,
    init(el) {
      const setRange = p => { const t = new Date(); let f; if (p === 'bulan') f = new Date(t.getFullYear(), t.getMonth(), 1); else f = new Date(Date.now() - (+p - 1) * 864e5); RP.from = ymd(f); RP.to = ymd(t); $('#repFrom', el).value = RP.from; $('#repTo', el).value = RP.to; };
      $('#repPreset', el).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; $$('#repPreset button', el).forEach(x => x.classList.toggle('on', x === b)); setRange(b.dataset.p); loadReport(); };
      $('#repGroup', el).onclick = e => { const b = e.target.closest('[data-g]'); if (!b) return; RP.group = b.dataset.g; $$('#repGroup button', el).forEach(x => x.classList.toggle('on', x === b)); renderReport(); };
      el.addEventListener('change', e => { if (e.target.id === 'repFrom' || e.target.id === 'repTo') { RP.from = $('#repFrom', el).value; RP.to = $('#repTo', el).value; if (RP.from > RP.to) { toast('Tanggal awal harus sebelum tanggal akhir.', 'warning'); return; } $$('#repPreset button', el).forEach(x => x.classList.remove('on')); loadReport(); } });
      $('#repQ', el).addEventListener('input', debounce(e => { RP.q = e.target.value.trim().toLowerCase(); RP.page = 1; renderRepTx(); }, 200));
      el.addEventListener('click', e => { const pg = e.target.closest('[data-rpg]'); if (pg && !pg.disabled) { RP.page = +pg.dataset.rpg; renderRepTx(); } if (e.target.closest('[data-retry]')) loadReport(true); });
      $('#repPrint', el).onclick = () => { document.body.classList.add('print-report'); window.print(); setTimeout(() => document.body.classList.remove('print-report'), 500); };
      $('#repCsv', el).onclick = () => { if (!RP.data) return; downloadCsv('laporan_' + RP.from + '_' + RP.to, ['tanggal', 'omzet', 'transaksi', 'item_terjual'], groupedDays().map(d => [d.label, d.omzet, d.transaksi, d.item])); };
      setRange('30');
    },
    show() { loadReport(false); if (can('pesanan') && !Adm.orders) refreshOrders(); }
  });
  function loadReport(force) {
    aswr('report', { from: RP.from, to: RP.to }, d => { RP.data = d; renderReport(); }, { suffix: RP.from + '_' + RP.to, fresh: force ? 0 : 60000, onError: r => { $('#repStats').innerHTML = errorState(r, 'r'); refreshIcons($('#repStats')); } });
  }
  function groupedDays() {
    const d = RP.data; if (!d) return [];
    if (RP.group === 'harian') return d.days.map(x => ({ label: x.tanggal, omzet: x.omzet, transaksi: x.transaksi, item: x.item }));
    const w = {};
    d.days.forEach(x => { const dt = new Date(x.tanggal + 'T12:00'); const mon = new Date(dt); mon.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); const k = ymd(mon); const g = w[k] || (w[k] = { label: 'Pekan ' + k, omzet: 0, transaksi: 0, item: 0 }); g.omzet += x.omzet; g.transaksi += x.transaksi; g.item += x.item; });
    return Object.keys(w).sort().map(k => w[k]);
  }
  function renderReport() {
    const d = RP.data, el = $('.apage[data-apage="laporan"]'); if (!d || !el) return;
    $('#repStats', el).innerHTML = statCard({ hero: true, label: 'Total Omzet', icon: 'wallet', value: fmtRp(d.total.omzet) }) + statCard({ label: 'Jumlah Transaksi Lunas', icon: 'receipt', value: fmtNum(d.total.transaksi) }) + statCard({ label: 'Rata-rata Nilai Order', icon: 'calculator', tone: 'sky', value: fmtRp(d.rata2) }) + statCard({ label: 'Produk Terjual', icon: 'package-check', value: fmtNum(d.total.item), unit: ' item' });
    const g = groupedDays();
    $('#repChartTitle', el).textContent = RP.group === 'harian' ? 'Omzet Harian' : 'Omzet Mingguan';
    $('#repRange', el).textContent = fmtDate(d.from) + ' — ' + fmtDate(d.to);
    $('#repChart', el).innerHTML = barChart(g.map(x => x.label), g.map(x => x.omzet), { label: 'Omzet', short: l => l.replace('Pekan ', '').slice(5).split('-').reverse().join('/') });
    $('#repTop', el).innerHTML = d.top.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Produk</th><th>Kategori</th><th class="ta-r">Terjual</th><th class="ta-r">Omzet</th></tr></thead><tbody>' + d.top.map((p, i) => '<tr><td><span class="rank r' + Math.min(4, i + 1) + '">' + (i + 1) + '</span></td><td><b>' + esc(p.nama) + '</b></td><td><span class="cat-pill static sm t-' + catTone(p.kategori) + '">' + esc(p.kategori) + '</span></td><td class="ta-r">' + fmtNum(p.qty) + '</td><td class="ta-r"><b>' + fmtRp(p.omzet) + '</b></td></tr>').join('') + '</tbody></table></div>' : '<div class="empty sm"><p class="muted">Belum ada penjualan pada periode ini.</p></div>';
    const cats = Object.keys(d.kategori).map(k => [k, d.kategori[k]]).sort((a, b) => b[1] - a[1]), mx = Math.max(1, ...cats.map(c => c[1]));
    $('#repCat', el).innerHTML = cats.length ? '<div class="hbars">' + cats.map((c, i, a, P = palette()) => '<div class="hbar"><span>' + esc(c[0]) + '</span><div><i style="width:' + (c[1] / mx * 100) + '%;background:' + P[i % P.length] + '"></i></div><b>' + fmtRp(c[1]) + '</b></div>').join('') + '</div>' : '<p class="muted">Belum ada data.</p>';
    $('#repNote', el).textContent = 'Rekap harian otomatis' + (d.last_rollup ? ' — terakhir diperbarui ' + fmtDate(d.last_rollup, true) : ' berjalan setiap pukul 00:30') + '. Data hari ini dihitung langsung.';
    renderRepTx(); refreshIcons(el);
  }
  function renderRepTx() {
    const box = $('#repTx'); if (!box) return;
    if (!Adm.orders) { box.innerHTML = can('pesanan') ? '<div class="pad">' + skeletonRows(4) + '</div>' : '<p class="pad muted small">Rincian transaksi memerlukan izin modul Pesanan.</p>'; return; }
    const from = new Date(RP.from + 'T00:00').getTime(), to = new Date(RP.to + 'T23:59:59').getTime();
    const l = Adm.orders.filter(o => o.status_bayar === 'Lunas' && o.status_pesanan !== 'Dibatalkan' && new Date(o.tanggal) >= from && new Date(o.tanggal) <= to && (!RP.q || (o.id + ' ' + o.nama).toLowerCase().includes(RP.q))).slice().reverse();
    const page = l.slice((RP.page - 1) * 15, RP.page * 15);
    box.innerHTML = page.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No. Pesanan</th><th>Tanggal</th><th>Customer</th><th>Metode</th><th class="ta-r">Total</th></tr></thead><tbody>' + page.map(o => '<tr><td><a class="mono txt-violet" href="#/admin/pesanan?id=' + esc(o.id) + '">#' + esc(o.id) + '</a></td><td>' + fmtDate(o.tanggal, true) + '</td><td>' + esc(o.nama) + '</td><td>' + metodeLabel(o) + '</td><td class="ta-r"><b>' + fmtRp(o.total) + '</b></td></tr>').join('') + '</tbody></table></div>' + pager(l.length, RP.page, 15, 'data-rpg') : '<p class="pad muted small">Tidak ada transaksi lunas pada periode ini.</p>';
    refreshIcons(box);
  }

  /* ======================================================== 7. HAK AKSES ADMIN (Owner) */
  const AK = { sel: '', izin: null };
  apage('akses', {
    title: 'Hak Akses Admin', owner: true,
    template: () => `
      <div class="ahead"><div><h1 class="ah1">Hak Akses & Manajemen Tim <span class="badge b-violet">${ic('lock')}Khusus Owner</span></h1><p class="muted">Atur kewenangan, delegasikan modul operasional staf, dan lindungi aset finansial toko.</p></div><button class="btn btn-primary" id="addAdm">${ic('user-plus')}Tambah Admin Baru</button></div>
      <div class="stats3" id="akStats"></div>
      <div class="card p0"><div class="card-h pad"><div class="with-ic"><span class="ic-box">${ic('users-round')}</span><div><h3 class="h3 m0">Daftar Akun Admin & Staf</h3><small class="muted">Kelola status aktif, kontak WhatsApp, dan tindakan proteksi akun.</small></div></div></div><div id="akTable"><div class="pad">${skeletonRows(4)}</div></div></div>
      <div class="card p0" id="akMatrix"></div>`,
    init(el) {
      $('#addAdm', el).onclick = () => adminModal('');
      el.addEventListener('click', e => {
        const s = e.target.closest('[data-akizin]'); if (s) { AK.sel = s.dataset.akizin; renderAkses(); $('#akMatrix').scrollIntoView({ behavior: 'smooth' }); return; }
        const ed = e.target.closest('[data-akedit]'); if (ed) { adminModal(ed.dataset.akedit); return; }
        const rs = e.target.closest('[data-akreset]'); if (rs) { resetPass(rs.dataset.akreset); return; }
        const dl = e.target.closest('[data-akdel]'); if (dl) { delAdmin(dl.dataset.akdel); return; }
        if (e.target.closest('#izSave')) saveIzin();
        if (e.target.closest('#izReset')) { AK.izin = null; renderAkses(); }
        if (e.target.closest('[data-retry]')) loadAkses(true);
      });
      el.addEventListener('change', e => {
        const t = e.target;
        if (t.matches('[data-akaktif]')) toggleAdmin(t.dataset.akaktif, t.checked, t);
        if (t.matches('[data-iz]')) { const [m, l] = t.dataset.iz.split(':'); AK.izin[m] = AK.izin[m] || {}; AK.izin[m][l] = t.checked; if (l !== 'lihat' && t.checked) AK.izin[m].lihat = true; if (l === 'lihat' && !t.checked) { AK.izin[m].ubah = false; AK.izin[m].hapus = false; } renderMatrix(); }
      });
    },
    show() { loadAkses(false); }
  });
  function loadAkses(force) { aswr('admins', {}, d => { Adm.admins = d.admins; renderAkses(); }, { fresh: force ? 0 : 30000, onError: r => { $('#akTable').innerHTML = errorState(r, 'a'); refreshIcons($('#akTable')); } }); }
  function renderAkses() {
    const el = $('.apage[data-apage="akses"]'); if (!el || !Adm.admins) return;
    const A = Adm.admins, staf = A.filter(a => a.role !== 'Owner');
    if (!AK.sel || !A.find(a => a.id === AK.sel && a.role !== 'Owner')) { AK.sel = (staf[0] || {}).id || ''; AK.izin = null; }
    $('#akStats', el).innerHTML = statCard({ label: 'Total Akun Staf', icon: 'id-card', value: A.length, sub: '<span class="muted">User terdaftar</span>' }) + statCard({ label: 'Role Utama (Owner)', icon: 'shield-check', value: A.filter(a => a.role === 'Owner').length, sub: '<span class="muted">Hak penuh (root)</span>' }) + statCard({ label: 'Role Delegasi Operasional', icon: 'store', tone: 'sky', value: staf.length, sub: '<span class="muted">' + staf.filter(a => a.aktif).length + ' aktif</span>' });
    $('#akTable', el).innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Profil & Kontak</th><th>No. WhatsApp</th><th>Role Akses</th><th>Terakhir Aktif</th><th class="ta-c">Status Akun</th><th class="ta-r">Aksi</th></tr></thead><tbody>' +
      A.map(a => '<tr class="' + (AK.sel === a.id ? 'sel' : '') + '"><td><div class="who"><span class="av ' + (a.role === 'Owner' ? 'grad' : '') + '">' + esc(initials(a.nama)) + '</span><div><b>' + esc(a.nama) + (a.role === 'Owner' ? ' ' + ic('badge-check', 'txt-violet xs') : '') + '</b><small class="d-block muted">' + esc(a.email) + '</small></div></div></td><td class="nowrap">' + (a.hp ? ic('phone', 'xs') + ' ' + esc(a.hp) : '<span class="muted">-</span>') + '</td><td>' + (a.role === 'Owner' ? '<span class="badge b-violet">' + ic('shield', 'xs') + 'Owner</span>' : '<span class="badge b-sky">' + esc(a.label || 'Admin') + '</span>') + '</td><td class="nowrap">' + (a.id === Adm.me.id ? '<span class="online"><i></i>Sedang Online</span>' : a.last_login ? timeAgo(a.last_login) : '<span class="muted">Belum pernah</span>') + '</td>' +
        '<td class="ta-c">' + (a.role === 'Owner' ? '<span class="badge b-slate">Terkunci (Owner)</span>' : toggle('', a.aktif, 'data-akaktif="' + esc(a.id) + '" aria-label="Status akun"')) + '</td><td class="ta-r nowrap">' + (a.role === 'Owner' ? (a.id === Adm.me.id ? '<button class="iconbtn sm" data-akedit="' + esc(a.id) + '" aria-label="Ubah profil" title="Ubah profil">' + ic('pencil') + '</button>' : '') : '<button class="iconbtn sm" data-akizin="' + esc(a.id) + '" aria-label="Atur izin" title="Atur izin">' + ic('sliders-horizontal') + '</button><button class="iconbtn sm" data-akedit="' + esc(a.id) + '" aria-label="Ubah" title="Ubah">' + ic('pencil') + '</button><button class="iconbtn sm" data-akreset="' + esc(a.id) + '" aria-label="Reset sandi" title="Reset sandi">' + ic('key-round') + '</button><button class="iconbtn sm danger" data-akdel="' + esc(a.id) + '" aria-label="Hapus" title="Hapus">' + ic('trash-2') + '</button>') + '</td></tr>').join('') + '</tbody></table></div>';
    renderMatrix(); refreshIcons(el);
  }
  function renderMatrix() {
    const box = $('#akMatrix'), a = (Adm.admins || []).find(x => x.id === AK.sel);
    if (!a) { box.innerHTML = '<div class="empty"><div class="empty-art">' + ic('user-plus') + '</div><h3>Belum ada staf</h3><p class="muted">Tambahkan admin untuk mendelegasikan pekerjaan toko.</p></div>'; refreshIcons(box); return; }
    if (!AK.izin) AK.izin = JSON.parse(JSON.stringify(a.izin || {}));
    box.innerHTML = '<div class="card-h pad"><div class="with-ic"><span class="ic-box">' + ic('shield-half') + '</span><div><h3 class="h3 m0">Matriks Hak Akses Modul Staf</h3><small class="muted">Tentukan batasan izin granular untuk staf non-owner.</small></div></div><span class="badge b-violet">Konfigurasi: ' + esc(a.nama) + ' · ' + esc(a.label || 'Admin') + '</span></div>' +
      '<div class="tbl-wrap"><table class="tbl matrix"><thead><tr><th>Modul Fitur</th><th class="ta-c">Lihat Data</th><th class="ta-c">Tambah & Ubah</th><th class="ta-c">Hapus Data</th><th>Keterangan</th></tr></thead><tbody>' +
      Object.keys(MOD_LABEL).map((m, i) => { const z = AK.izin[m] || {}; const L = MOD_LABEL[m]; const na = (m === 'dashboard' || m === 'ekspor' || m === 'verifikasi') ? ['hapus'] : (m === 'laporan' ? ['ubah', 'hapus'] : []); if (m === 'dashboard' || m === 'ekspor') na.push('ubah'); return '<tr><td><div class="mod">' + ic(L[2]) + '<div><b>' + (i + 1) + '. ' + L[0] + '</b><small class="muted d-block">' + L[1] + '</small></div></div></td>' + ['lihat', 'ubah', 'hapus'].map(l => '<td class="ta-c">' + (na.includes(l) ? '<span class="muted">–</span>' : '<input type="checkbox" class="ck" data-iz="' + m + ':' + l + '"' + (z[l] ? ' checked' : '') + ' aria-label="' + l + ' ' + m + '">') + '</td>').join('') + '<td class="muted small">' + (z.lihat ? (z.ubah ? 'Dapat melihat & mengubah' + (z.hapus ? ' serta menghapus' : '') : 'Hanya melihat') : 'Tidak dapat mengakses') + '</td></tr>'; }).join('') +
      [['Hak Akses Admin', 'Menambah akun & mengatur matriks keamanan'], ['Integrasi Payment Gateway & WhatsApp API', 'Kunci rahasia gateway, webhook, & template notifikasi']].map((x, i) => '<tr class="locked"><td><div class="mod">' + ic('lock') + '<div><b>' + (Object.keys(MOD_LABEL).length + i + 1) + '. ' + x[0] + '</b><small class="muted d-block">' + x[1] + '</small></div></div></td><td class="ta-c">' + ic('ban', 'muted') + '</td><td class="ta-c">' + ic('ban', 'muted') + '</td><td class="ta-c">' + ic('ban', 'muted') + '</td><td><span class="badge b-red">' + ic('lock', 'xs') + 'Hanya Role Owner</span></td></tr>').join('') +
      '</tbody></table></div><div class="matrix-foot"><span class="muted small">' + ic('info', 'xs') + ' Perubahan izin langsung berlaku pada permintaan berikutnya staf (tanpa perlu login ulang).</span><div class="row-gap"><button class="btn btn-ghost" id="izReset">Reset ke Tersimpan</button><button class="btn btn-primary" id="izSave">Simpan Perubahan Izin</button></div></div>';
    refreshIcons(box);
  }
  async function saveIzin() {
    const a = Adm.admins.find(x => x.id === AK.sel); if (!a) return;
    const b = $('#izSave'); setBusy(b, true, 'Menyimpan...');
    const r = await api('adminSave', { id: a.id, nama: a.nama, email: a.email, hp: a.hp, label: a.label, izin: AK.izin, aktif: a.aktif });
    setBusy(b, false);
    if (!r.success) { toast(r.message, 'error'); return; }
    a.izin = JSON.parse(JSON.stringify(AK.izin)); toast('Izin ' + a.nama + ' disimpan.', 'success'); Store.del('c:' + akey('admins'));
  }
  async function toggleAdmin(id, on, input) {
    const a = Adm.admins.find(x => x.id === id), prev = a.aktif; a.aktif = on;
    const r = await api('adminSave', { id, nama: a.nama, email: a.email, hp: a.hp, label: a.label, izin: a.izin, aktif: on });
    if (!r.success) { a.aktif = prev; input.checked = prev; toast(r.message, 'error'); return; }
    toast(on ? a.nama + ' diaktifkan.' : a.nama + ' dinonaktifkan & dikeluarkan dari semua perangkat.', 'success'); Store.del('c:' + akey('admins'));
  }
  function adminModal(id) {
    const a = (Adm.admins || []).find(x => x.id === id) || { nama: '', email: '', hp: '', label: 'Admin Kasir', role: 'Admin' };
    const owner = a.role === 'Owner';
    const m = modal('<div class="modal-head"><h3 class="h3">' + (id ? 'Ubah Akun' : 'Tambah Admin Baru') + '</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><form class="modal-body stack" id="admForm">' +
      '<div class="field"><label class="label" for="aNama">Nama Lengkap</label><input id="aNama" value="' + esc(a.nama) + '" required></div>' +
      '<div class="field"><label class="label" for="aEmail">Email (untuk login)</label><input id="aEmail" type="email" value="' + esc(a.email) + '"' + (owner ? ' disabled' : '') + ' required></div>' +
      '<div class="form-grid"><div class="field"><label class="label" for="aHp">No. WhatsApp</label><input id="aHp" inputmode="tel" value="' + esc(a.hp || '') + '"></div>' + (owner ? '' : '<div class="field"><label class="label" for="aLabel">Label Peran</label><input id="aLabel" list="roleList" value="' + esc(a.label || '') + '"><datalist id="roleList"><option>Admin Kasir</option><option>Staff Gudang</option><option>Admin Operasional</option><option>Customer Service</option></datalist></div>') + '</div>' +
      (!id ? '<div class="field"><label class="label" for="aPass">Kata Sandi Awal</label><input id="aPass" type="text" placeholder="Kosongkan untuk dibuat otomatis (min 8)"><small class="muted">Sampaikan kata sandi ke staf secara pribadi. Staf dapat menggantinya setelah login.</small></div><div class="info-box violet">' + ic('shield-check') + '<p>Izin awal: <b>Dashboard (lihat), Produk (lihat & ubah), Pesanan (lihat & ubah), Verifikasi (lihat & ubah)</b>. Atur detailnya di Matriks setelah dibuat.</p></div>' : '') +
      '</form><div class="modal-foot"><button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="aSave">' + (id ? 'Simpan' : 'Buat Akun') + '</button></div>', { cls: 'modal-sm' });
    m.el.querySelector('#aSave').onclick = async () => {
      const b = m.el.querySelector('#aSave'); setBusy(b, true, 'Menyimpan...');
      const izin = id ? a.izin : { dashboard: { lihat: true }, produk: { lihat: true, ubah: true }, pesanan: { lihat: true, ubah: true }, verifikasi: { lihat: true, ubah: true } };
      const r = await api('adminSave', { id, nama: $('#aNama').value, email: owner ? a.email : $('#aEmail').value, hp: $('#aHp').value, label: owner ? 'Owner' : $('#aLabel').value, password: id ? '' : $('#aPass').value, izin, aktif: id ? a.aktif : true });
      setBusy(b, false);
      if (!r.success) { toast(r.message, 'error'); return; }
      m.close(); toast(r.message, 'success');
      if (r.data.password) showPassword($('#aNama').value || 'staf', $('#aEmail').value, r.data.password);
      AK.sel = r.data.id; AK.izin = null; loadAkses(true);
    };
  }
  function showPassword(nama, email, pass) {
    const m = modal('<div class="modal-body center"><span class="big-ic">' + ic('key-round') + '</span><h3 class="h3">Kredensial untuk ' + esc(nama) + '</h3><p class="muted">Kata sandi ini hanya tampil <b>sekali</b>. Salin dan sampaikan secara pribadi.</p><div class="cred">' + (email ? '<div><small>Email</small><b>' + esc(email) + '</b></div>' : '') + '<div><small>Kata sandi</small><b class="mono">' + esc(pass) + '</b></div></div><p class="muted small">Login di: <span class="mono">' + esc(location.href.split('#')[0]) + '#/admin</span></p></div><div class="modal-foot"><button class="btn btn-ghost" id="cpPass">' + ic('copy') + 'Salin</button><button class="btn btn-primary" data-close>Selesai</button></div>', { cls: 'modal-sm', sticky: true });
    m.el.querySelector('#cpPass').onclick = () => copyText((email ? 'Email: ' + email + '\n' : '') + 'Kata sandi: ' + pass + '\nLogin: ' + location.href.split('#')[0] + '#/admin');
  }
  async function resetPass(id) {
    const a = Adm.admins.find(x => x.id === id);
    if (!(await confirmDialog('Reset kata sandi ' + a.nama + '?', 'Kata sandi baru dibuat otomatis dan semua sesi ' + a.nama + ' dikeluarkan.', 'Reset Sandi'))) return;
    const r = await api('adminResetPass', { id });
    if (!r.success) { toast(r.message, 'error'); return; }
    showPassword(a.nama, a.email, r.data.password);
  }
  async function delAdmin(id) {
    const a = Adm.admins.find(x => x.id === id);
    if (!(await confirmDialog('Hapus akun ' + a.nama + '?', 'Akun dihapus permanen dan langsung dikeluarkan dari semua perangkat.', 'Hapus Akun', true))) return;
    const r = await api('adminDelete', { id });
    if (!r.success) { toast(r.message, 'error'); return; }
    toast(r.message, 'success'); AK.sel = ''; loadAkses(true);
  }

  /* ======================================================== 8. PENGATURAN & INTEGRASI (Owner) */
  const ST = { data: null, draft: null, dirty: false };
  const EV_LABEL = { order_baru: ['Pesanan Baru Dibuat', 'Status: Menunggu Pembayaran (kirim info bayar & tautan status)'], bayar_diterima: ['Pembayaran Berhasil / Terverifikasi', 'Status: Diproses (kirim tautan invoice PDF)'], diproses: ['Pesanan Sedang Diproses', 'Konfirmasi pesanan masuk lini pengemasan'], dikirim: ['Pesanan Dikirim & Nomor Resi', 'Sertakan nomor resi pengiriman'], selesai: ['Pesanan Selesai', 'Ucapan terima kasih'], dibatalkan: ['Pesanan Dibatalkan / Kedaluwarsa', 'Pemberitahuan pembatalan & alasan'], bukti_ditolak: ['Bukti Transfer Ditolak', 'Minta pembeli unggah ulang bukti'] };
  apage('integrasi', {
    title: 'Pengaturan & Integrasi', owner: true,
    template: () => `
      <div class="ahead"><div><h1 class="ah1">Pengaturan & Integrasi Toko <span class="badge b-violet">${ic('lock')}Khusus Owner</span></h1><p class="muted">Kelola gateway pembayaran, WhatsApp API, template notifikasi, dan identitas toko.</p></div>
        <div class="row-gap"><a class="btn btn-ghost" id="ssLink" target="_blank" rel="noopener">${ic('sheet')}Buka Database</a><button class="btn btn-ghost" id="logBtn">${ic('history')}Riwayat Aktivitas</button></div></div>
      <div id="setBody"><div class="card">${skeletonRows(10)}</div></div>
      <div class="savebar" id="setBar" hidden><span class="small"><i class="dot warn"></i>Ada perubahan yang belum disimpan.</span><div class="row-gap"><button class="btn btn-ghost" id="setReset">Batalkan</button><button class="btn btn-primary" id="setSave">${ic('circle-check')}Simpan Semua Perubahan</button></div></div>`,
    init(el) {
      $('#logBtn', el).onclick = showLogs;
      $('#setReset', el).onclick = () => { ST.draft = JSON.parse(JSON.stringify(ST.data.settings)); ST.dirty = false; $('#setBar').hidden = true; Theme.apply(ST.draft.tema || {}, { preview: true }); renderSettings(); };
      $('#setSave', el).onclick = saveSettings;
      el.addEventListener('input', e => { const k = e.target.dataset.set; if (k) { setVal(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value); } });
      el.addEventListener('change', e => {
        const t = e.target;
        if (t.matches('[data-nm]')) { const [ev, ch] = t.dataset.nm.split(':'); ST.draft.notif_matrix[ev][ch] = t.checked; markDirty(); }
        if (t.matches('[data-bank]')) { const [i, k] = t.dataset.bank.split(':'); ST.draft.bank_list[+i][k] = t.value; markDirty(); }
        if (t.matches('[data-vc]')) { const [i, k] = t.dataset.vc.split(':'); ST.draft.vouchers[+i][k] = t.type === 'checkbox' ? t.checked : (k === 'nilai' || k === 'min' ? +t.value : t.value); markDirty(); }
        if (t.id === 'logoFile') uploadLogo(t.files[0]);
      });
      el.addEventListener('click', e => {
        const sv = e.target.closest('[data-secret]'); if (sv) { saveSecret(sv.dataset.secret, sv); return; }
        const sd = e.target.closest('[data-secdel]'); if (sd) { delSecret(sd.dataset.secdel); return; }
        const md = e.target.closest('[data-mode]'); if (md) { ST.draft.gateway_mode = md.dataset.mode; markDirty(); renderSettings(); return; }
        const tp = e.target.closest('[data-tpl]'); if (tp) { editTemplate(tp.dataset.tpl); return; }
        const cp = e.target.closest('[data-copy]'); if (cp) { copyText(cp.dataset.copy); return; }
        if (e.target.closest('#addBank')) { ST.draft.bank_list.push({ bank: '', no: '', nama: '' }); markDirty(); renderSettings(); return; }
        const rb = e.target.closest('[data-rmbank]'); if (rb) { ST.draft.bank_list.splice(+rb.dataset.rmbank, 1); markDirty(); renderSettings(); return; }
        if (e.target.closest('#addVc')) { ST.draft.vouchers.push({ kode: '', tipe: 'nominal', nilai: 10000, min: 0, aktif: true, ket: '' }); markDirty(); renderSettings(); return; }
        const rv = e.target.closest('[data-rmvc]'); if (rv) { ST.draft.vouchers.splice(+rv.dataset.rmvc, 1); markDirty(); renderSettings(); return; }
        if (e.target.closest('#tesGw')) testGateway(e.target.closest('#tesGw'));
        if (e.target.closest('#tesWa')) testWa(e.target.closest('#tesWa'));
        if (e.target.closest('[data-retry]')) loadSettings(true);
      });
    },
    show(el, parts, q) { loadSettings(false); if (q && q.fokus === 'wa') setTimeout(() => { const w = $('#sec-FONNTE_TOKEN'); if (w) w.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 400); }
  });
  function setVal(k, v) { ST.draft[k] = v; markDirty(); if (k === 'gateway_aktif' || k === 'wa_aktif' || k === 'email_aktif') renderSettings(); }
  function markDirty() { ST.dirty = true; $('#setBar').hidden = false; }
  function loadSettings(force) {
    aswr('settings', {}, d => { ST.data = d; if (!ST.dirty) ST.draft = JSON.parse(JSON.stringify(d.settings)); renderSettings(); }, { fresh: force ? 0 : 30000, onError: r => { $('#setBody').innerHTML = errorState(r, 's'); refreshIcons($('#setBody')); } });
  }
  function secretField(key, label, hint) {
    const s = ST.data.secrets[key] || {};
    return '<div class="field"><div class="row-between"><label class="label" for="sec-' + key + '">' + label + '</label><small class="muted">' + hint + '</small></div><div class="sec-in"><label class="input-ic">' + ic('key-round') + '<input id="sec-' + key + '" type="password" autocomplete="off" placeholder="' + (s.ada ? esc(s.samar) + ' (tersimpan)' : 'Belum diisi') + '"></label><button class="btn btn-soft" data-secret="' + key + '">' + ic('save') + 'Simpan</button>' + (s.ada ? '<button class="iconbtn danger" data-secdel="' + key + '" aria-label="Hapus" title="Hapus">' + ic('trash-2') + '</button>' : '') + '</div></div>';
  }
  function renderSettings() {
    const body = $('#setBody'), D = ST.data, S = ST.draft; if (!body || !D) return;
    $('#ssLink').href = D.spreadsheet_url;
    const gwOk = D.gateway_ready, waOk = D.wa_ready;
    body.innerHTML = temaCard(S, D) +
      // Payment gateway
      '<section class="card setc"><div class="setc-h"><span class="ic-box">' + ic('credit-card') + '</span><div><h3 class="h3 m0">Payment Gateway & Saluran Pembayaran Otomatis ' + (gwOk ? '<span class="badge b-sky">Terhubung</span>' : '<span class="badge b-slate">Belum Aktif</span>') + '</h3><small class="muted">Verifikasi pesanan instan via QRIS, Virtual Account, dan e-wallet.</small></div><label class="sw-l">' + toggle('', S.gateway_aktif, 'data-set="gateway_aktif"') + '<span>Gateway Otomatis</span></label></div>' +
      '<span class="label">Penyedia Gateway</span><div class="prov">' +
      '<div class="prov-c on"><span class="pc-ic">' + ic('wallet') + '</span><div><b>Midtrans Snap API</b><small>QRIS, BCA, Mandiri, BNI, BRI, GoPay, ShopeePay</small><span class="badge b-violet">Default</span></div>' + ic('circle-check', 'txt-violet') + '</div>' +
      '<div class="prov-c off"><span class="pc-ic sky">' + ic('landmark') + '</span><div><b>Xendit</b><small>Segera hadir</small></div></div></div>' +
      '<div class="env"><span class="label">Mode Lingkungan:</span><div class="seg"><button data-mode="production" class="' + (S.gateway_mode === 'production' ? 'on' : '') + '">' + ic('circle', 'xs') + 'Production / Live</button><button data-mode="sandbox" class="' + (S.gateway_mode === 'sandbox' ? 'on' : '') + '">Sandbox / Testing</button></div><button class="btn btn-ghost btn-sm" id="tesGw">' + ic('activity') + 'Tes Koneksi API</button></div>' +
      '<div class="form-grid">' + secretField('MIDTRANS_SERVER_KEY', 'Server Key / Secret Key', 'Kerahasiaan tinggi') + secretField('MIDTRANS_CLIENT_KEY', 'Client Key / Public Key', 'Opsional') + '</div>' +
      '<div class="field mt-3"><div class="row-between"><span class="label">Webhook / Notification URL</span><small class="txt-green">' + ic('circle-check', 'xs') + 'Tempel di Midtrans → Settings → Payment → Notification URL</small></div><div class="sec-in"><input readonly value="' + esc(D.webhook_url || '(deploy Web App dulu)') + '" class="mono"><button class="btn btn-primary btn-sm" data-copy="' + esc(D.webhook_url) + '">' + ic('copy') + 'Salin URL</button></div></div>' +
      '<div class="info-box violet mt-3">' + ic('info') + '<p><b>Fallback Rekening Manual Tetap Aktif.</b> Jika gateway nonaktif atau gagal, checkout otomatis menawarkan Transfer Manual dengan verifikasi bukti transfer oleh kasir.</p></div></section>' +
      // Bank
      '<section class="card setc"><div class="setc-h"><span class="ic-box">' + ic('landmark') + '</span><div><h3 class="h3 m0">Rekening Transfer Manual</h3><small class="muted">Ditampilkan di halaman checkout & status pesanan.</small></div><button class="btn btn-soft btn-sm" id="addBank">' + ic('plus') + 'Tambah Rekening</button></div>' +
      '<div class="bank-edit">' + S.bank_list.map((b, i) => '<div class="be-row"><input data-bank="' + i + ':bank" value="' + esc(b.bank) + '" placeholder="Bank (BCA)"><input data-bank="' + i + ':no" value="' + esc(b.no) + '" placeholder="No. rekening" inputmode="numeric"><input data-bank="' + i + ':nama" value="' + esc(b.nama) + '" placeholder="Atas nama"><button class="iconbtn danger" data-rmbank="' + i + '" aria-label="Hapus rekening">' + ic('trash-2') + '</button></div>').join('') + '</div></section>' +
      // WA
      '<section class="card setc"><div class="setc-h"><span class="ic-box">' + ic('message-circle') + '</span><div><h3 class="h3 m0">WhatsApp Gateway & Notifikasi Instan ' + (waOk ? '<span class="badge b-sky">Connected via Fonnte</span>' : '<span class="badge b-slate">Belum Aktif</span>') + '</h3><small class="muted">Kirim invoice otomatis, konfirmasi pesanan, dan nomor resi ke WhatsApp pembeli.</small></div><label class="sw-l">' + toggle('', S.wa_aktif, 'data-set="wa_aktif"') + '<span>Notifikasi WA Aktif</span></label></div>' +
      '<div class="form-grid"><div class="field"><span class="label">Penyedia</span><select disabled><option>Fonnte Official API</option></select><small class="muted">Daftar & hubungkan perangkat di fonnte.com, lalu salin token.</small></div>' + secretField('FONNTE_TOKEN', 'API Authorization Token', 'Disimpan di Script Properties') + '</div>' +
      '<div class="field mt-3"><span class="label">Uji Pengiriman Notifikasi</span><div class="sec-in"><input id="tesWaHp" placeholder="08xx nomor tujuan uji" inputmode="tel"><button class="btn btn-primary" id="tesWa">' + ic('send') + 'Kirim Uji</button></div></div>' +
      '<div class="form-grid g3 mt-3"><div class="field"><label class="label" for="sWb">Batch blast default</label><select id="sWb" data-set="wa_batch_default">' + [10, 20, 50].map(n => '<option' + (+S.wa_batch_default === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div><div class="field"><label class="label" for="sWj">Jeda antarpesan (detik)</label><input id="sWj" data-set="wa_jeda" value="' + esc(S.wa_jeda || '5') + '" placeholder="5 atau 3-8"></div><div class="opt-row"><div><b>Deteksi WA otomatis</b><small>Cek nomor kontak baru tiap ±10 menit</small></div>' + toggle('', S.wa_deteksi_otomatis !== false, 'data-set="wa_deteksi_otomatis"') + '</div></div>' +
      '<div class="opt-row mt-3"><div><b>Email Notifikasi (Gmail)</b><small>Sisa kuota email hari ini: ' + D.email_quota + '</small></div>' + toggle('', S.email_aktif, 'data-set="email_aktif"') + '</div>' +
      '<div class="opt-row"><div><b>Notifikasi ke Admin</b><small>Kirim info pesanan baru & bukti transfer ke WA/email toko</small></div>' + toggle('', S.notif_admin, 'data-set="notif_admin"') + '</div></section>' +
      // Matrix
      '<section class="card setc p0"><div class="setc-h pad"><span class="ic-box">' + ic('sliders-horizontal') + '</span><div><h3 class="h3 m0">Matriks & Template Notifikasi Otomatis</h3><small class="muted">Tentukan kapan sistem mengirim notifikasi ke WhatsApp & Email pembeli.</small></div><span class="badge b-violet">' + Object.values(S.notif_matrix).filter(x => x.email || x.wa).length + ' Trigger Aktif</span></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Event / Trigger Transaksi</th><th class="ta-c">Email</th><th class="ta-c">WhatsApp</th><th class="ta-r">Aksi Template</th></tr></thead><tbody>' +
      Object.keys(EV_LABEL).map(k => '<tr><td><b>' + EV_LABEL[k][0] + '</b><small class="d-block muted">' + EV_LABEL[k][1] + '</small></td><td class="ta-c"><input type="checkbox" class="ck" data-nm="' + k + ':email"' + (S.notif_matrix[k].email ? ' checked' : '') + ' aria-label="Email ' + k + '"></td><td class="ta-c"><input type="checkbox" class="ck" data-nm="' + k + ':wa"' + (S.notif_matrix[k].wa ? ' checked' : '') + ' aria-label="WhatsApp ' + k + '"></td><td class="ta-r"><button class="link sm" data-tpl="' + k + '">' + ic('pencil') + 'Edit Template</button></td></tr>').join('') +
      '</tbody></table></div><div class="pad"><div class="info-box violet">' + ic('braces') + '<p><b>Variabel otomatis:</b> <code>{nama_pembeli}</code> <code>{no_pesanan}</code> <code>{total_bayar}</code> <code>{link_status}</code> <code>{link_invoice}</code> <code>{nomor_resi}</code> <code>{alasan}</code> <code>{info_bayar}</code> <code>{nama_toko}</code></p></div></div></section>' +
      // Voucher
      '<section class="card setc"><div class="setc-h"><span class="ic-box">' + ic('ticket-percent') + '</span><div><h3 class="h3 m0">Voucher & Kupon Diskon</h3><small class="muted">Kode yang bisa dimasukkan pembeli di keranjang.</small></div><button class="btn btn-soft btn-sm" id="addVc">' + ic('plus') + 'Tambah Voucher</button></div>' +
      (S.vouchers.length ? '<div class="tbl-wrap"><table class="tbl vc-tbl"><thead><tr><th>Kode</th><th>Tipe</th><th>Nilai</th><th>Min. Belanja</th><th>Keterangan</th><th class="ta-c">Aktif</th><th></th></tr></thead><tbody>' + S.vouchers.map((v, i) => '<tr><td><input data-vc="' + i + ':kode" value="' + esc(v.kode) + '" class="mono up"></td><td><select data-vc="' + i + ':tipe"><option value="nominal"' + (v.tipe === 'nominal' ? ' selected' : '') + '>Nominal (Rp)</option><option value="persen"' + (v.tipe === 'persen' ? ' selected' : '') + '>Persen (%)</option></select></td><td><input data-vc="' + i + ':nilai" type="number" min="0" value="' + v.nilai + '"></td><td><input data-vc="' + i + ':min" type="number" min="0" value="' + v.min + '"></td><td><input data-vc="' + i + ':ket" value="' + esc(v.ket || '') + '"></td><td class="ta-c"><input type="checkbox" class="ck" data-vc="' + i + ':aktif"' + (v.aktif ? ' checked' : '') + '></td><td><button class="iconbtn sm danger" data-rmvc="' + i + '" aria-label="Hapus voucher">' + ic('trash-2') + '</button></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted small">Belum ada voucher.</p>') + '</section>' +
      // Profil toko
      '<section class="card setc"><div class="setc-h"><span class="ic-box">' + ic('store') + '</span><div><h3 class="h3 m0">Identitas & Profil Toko (Publik)</h3><small class="muted">Tampil di etalase, invoice digital, dan notifikasi pelanggan.</small></div></div>' +
      '<div class="form-grid g3">' +
      '<div class="field"><label class="label" for="s1">Nama Resmi Toko / Brand</label><input id="s1" data-set="toko_nama" value="' + esc(S.toko_nama) + '"></div>' +
      '<div class="field"><label class="label" for="s2">WhatsApp Layanan Pelanggan</label><input id="s2" data-set="toko_wa" value="' + esc(S.toko_wa) + '" placeholder="62812xxxx" inputmode="tel"></div>' +
      '<div class="field"><label class="label" for="s3">Email Dukungan</label><input id="s3" data-set="toko_email" type="email" value="' + esc(S.toko_email) + '"></div>' +
      '<div class="field span-2"><label class="label" for="s4">Tagline (judul hero)</label><input id="s4" data-set="toko_tagline" value="' + esc(S.toko_tagline) + '"></div>' +
      '<div class="field"><span class="label">Logo Toko</span><div class="logo-in"><span class="brand-mark">' + (S.toko_logo ? '<img src="' + esc(imgUrl(S.toko_logo, 120)) + '" alt="">' : ic('shopping-bag')) + '</span><label class="btn btn-ghost btn-sm">' + ic('upload') + 'Unggah<input type="file" id="logoFile" accept="image/*" hidden></label>' + (S.toko_logo ? '<button class="link danger sm" onclick="return false" data-set-clear>Hapus</button>' : '') + '</div></div>' +
      '<div class="field span-3"><label class="label" for="s5">Deskripsi Singkat Toko</label><textarea id="s5" data-set="toko_deskripsi" rows="2">' + esc(S.toko_deskripsi) + '</textarea></div>' +
      '<div class="field span-2"><label class="label" for="s6">Alamat Toko</label><input id="s6" data-set="toko_alamat" value="' + esc(S.toko_alamat) + '"></div>' +
      '<div class="field"><label class="label" for="s7">URL Etalase (GitHub Pages)</label><input id="s7" data-set="store_url" value="' + esc(S.store_url) + '" placeholder="https://username.github.io/e-toko/"><small class="muted">Dipakai untuk tautan di WA/email. Terisi otomatis saat checkout pertama.</small></div>' +
      '<div class="field"><label class="label" for="s8">Ongkos Kirim Flat (Rp)</label><input id="s8" data-set="ongkir_flat" type="number" min="0" value="' + S.ongkir_flat + '"></div>' +
      '<div class="field"><label class="label" for="s9">Gratis Ongkir Mulai (Rp)</label><input id="s9" data-set="ongkir_gratis_min" type="number" min="0" value="' + S.ongkir_gratis_min + '"><small class="muted">0 = tanpa gratis ongkir</small></div>' +
      '<div class="field"><label class="label" for="s10">Batas Waktu Pembayaran (jam)</label><input id="s10" data-set="expire_jam" type="number" min="1" value="' + S.expire_jam + '"><small class="muted">Pesanan belum dibayar otomatis dibatalkan & stok kembali.</small></div>' +
      '</div></section>' +
      '<p class="muted small center">Versi backend ' + esc(D.version) + ' · Semua kunci rahasia tersimpan di Script Properties dan tidak pernah dikirim ke browser.</p>';
    refreshIcons(body); bindTema(body);
    const clr = body.querySelector('[data-set-clear]'); if (clr) clr.onclick = () => { ST.draft.toko_logo = ''; markDirty(); renderSettings(); };
  }
  async function saveSettings() {
    const b = $('#setSave'); setBusy(b, true, 'Menyimpan...');
    const r = await api('settingsSave', { settings: ST.draft });
    setBusy(b, false);
    if (!r.success) { toast(r.message, 'error'); return; }
    ST.dirty = false; $('#setBar').hidden = true; toast(r.message, 'success');
    if (ST.draft.tema) { Theme.apply(ST.draft.tema); if (Adm.store) Adm.store.tema = ST.draft.tema; }
    Store.del('c:catalog'); Store.del('c:' + akey('boot')); loadSettings(true);
  }
  async function saveSecret(key, btn) {
    const inp = $('#sec-' + key), v = inp.value.trim();
    if (!v) { toast('Isi nilai terlebih dahulu.', 'warning'); inp.focus(); return; }
    setBusy(btn, true, '...');
    const r = await api('secretSave', { kunci: key, nilai: v });
    setBusy(btn, false);
    if (!r.success) { toast(r.message, 'error'); return; }
    inp.value = ''; ST.data.secrets[key] = { ada: r.data.ada, samar: r.data.samar }; toast(r.message, 'success'); renderSettings(); Store.del('c:' + akey('settings'));
  }
  async function delSecret(key) {
    if (!(await confirmDialog('Hapus kunci ini?', 'Integrasi terkait akan berhenti bekerja sampai kunci baru diisi.', 'Hapus', true))) return;
    const r = await api('secretSave', { kunci: key, nilai: '__HAPUS__' });
    if (!r.success) { toast(r.message, 'error'); return; }
    ST.data.secrets[key] = { ada: false, samar: '' }; toast('Kunci dihapus.', 'success'); loadSettings(true);
  }
  async function testGateway(btn) { setBusy(btn, true, 'Menguji...'); const r = await api('testGateway', {}); setBusy(btn, false); toast(r.message, r.success ? 'success' : 'error', 5000); }
  async function testWa(btn) { const hp = $('#tesWaHp').value; if (!normHp(hp)) { toast('Masukkan nomor tujuan yang valid.', 'warning'); return; } setBusy(btn, true, 'Mengirim...'); const r = await api('testWa', { hp }); setBusy(btn, false); toast(r.message, r.success ? 'success' : 'error', 5000); }
  async function uploadLogo(file) {
    if (!file) return;
    try { const c = await compressImage(file, 400, 0.9); toast('Mengunggah logo...', 'info'); const r = await api('uploadImage', { file: c }); if (!r.success) { toast(r.message, 'error'); return; } ST.draft.toko_logo = r.data.id; markDirty(); renderSettings(); toast('Logo diunggah. Klik Simpan Semua Perubahan.', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  }
  function editTemplate(k) {
    const m = modal('<div class="modal-head"><h3 class="h3">Template: ' + EV_LABEL[k][0] + '</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="modal-body stack"><textarea id="tplTxt" rows="8">' + esc(ST.draft.templates[k] || '') + '</textarea><small class="muted">Gunakan <b>*teks*</b> untuk huruf tebal di WhatsApp. Variabel: {nama_pembeli} {no_pesanan} {total_bayar} {link_status} {link_invoice} {nomor_resi} {alasan} {info_bayar} {nama_toko}</small><span class="op-label">Pratinjau</span><div class="wa-prev" id="tplPrev"></div></div><div class="modal-foot"><button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="tplOk">Terapkan</button></div>', { cls: 'modal-lg' });
    const prev = () => { const t = m.el.querySelector('#tplTxt').value.replace(/\{nama_pembeli\}/g, 'Rian').replace(/\{no_pesanan\}/g, 'ORD-261116-AB12').replace(/\{total_bayar\}/g, 'Rp 869.000').replace(/\{nama_toko\}/g, ST.draft.toko_nama).replace(/\{link_status\}|\{link_invoice\}/g, (ST.draft.store_url || 'https://toko.id/') + '#/pesanan/…').replace(/\{nomor_resi\}/g, 'JNE123456').replace(/\{alasan\}/g, 'Nominal tidak sesuai').replace(/\{info_bayar\}/g, 'Silakan transfer ke BCA 1234567890'); m.el.querySelector('#tplPrev').innerHTML = esc(t).replace(/\*(.+?)\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); };
    m.el.querySelector('#tplTxt').addEventListener('input', prev); prev();
    m.el.querySelector('#tplOk').onclick = () => { ST.draft.templates[k] = m.el.querySelector('#tplTxt').value; markDirty(); m.close(); toast('Template diperbarui. Jangan lupa Simpan Semua Perubahan.', 'info'); };
  }
  async function showLogs() {
    const m = modal('<div class="modal-head"><h3 class="h3">Riwayat Aktivitas</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="modal-body" id="logBody">' + skeletonRows(8) + '</div>', { cls: 'modal-lg' });
    const r = await api('logs', {});
    const b = m.el.querySelector('#logBody');
    b.innerHTML = r.success ? (r.data.logs.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Detail</th><th>Target</th></tr></thead><tbody>' + r.data.logs.map(l => '<tr><td class="nowrap">' + fmtDate(l.waktu, true) + '</td><td>' + esc(l.aktor) + '</td><td><span class="badge b-violet">' + esc(l.aksi) + '</span></td><td>' + esc(l.detail) + '</td><td class="mono small">' + esc(l.target) + '</td></tr>').join('') + '</tbody></table></div><p class="muted small mt-2">Log ditulis berkala (±5 menit) oleh trigger agar aplikasi tetap cepat.</p>' : '<p class="muted">Belum ada aktivitas tercatat.</p>') : '<p class="muted">' + esc(r.message) + '</p>';
  }

  /* ======================================================== v1.1 — HELPER BERSAMA */
  function setupNotice(r) {
    return '<div class="card empty"><div class="empty-art">' + ic('database-zap') + '</div><h3>Modul v1.1 belum diaktifkan</h3><p class="muted">' + esc(r.message || '') + '</p>' +
      '<ol class="steps-mini"><li>Buka editor Apps Script proyek E-TOKO.</li><li>Pilih fungsi <code>setupV11</code> → klik ▶ <b>Run</b> (sekali saja, aman diulang).</li><li>Muat ulang halaman ini.</li></ol></div>';
  }
  function failBox(host, r, retry) { host.innerHTML = r.data && r.data.code === 'SETUP' ? setupNotice(r) : errorState(r, retry); refreshIcons(host); }
  const tagsOf = k => String(k.tag || '').split(',').map(t => t.trim()).filter(Boolean);
  const hp08 = wa => wa ? '0' + String(wa).replace(/^62/, '') : '';
  function waBadge(s) { return s === 'Terdaftar' ? '<span class="badge b-green">' + ic('circle-check', 'xs') + 'WA aktif</span>' : s === 'Tidak Terdaftar' ? '<span class="badge b-red">' + ic('circle-x', 'xs') + 'Bukan WA</span>' : '<span class="badge b-slate">Belum dicek</span>'; }
  function progress(p, tone) { return '<div class="prog' + (tone ? ' ' + tone : '') + '"><span style="width:' + Math.max(0, Math.min(100, p)) + '%"></span></div>'; }
  function startFastPoll(fn, activeMs, idleMs, key) {
    stopPoll();
    const tick = async () => { if (Activity.due(key, activeMs, idleMs) && document.body.classList.contains('mode-admin')) { try { await fn(); } catch (e) { } } Adm.pollT = setTimeout(tick, 2000); };
    Adm.pollT = setTimeout(tick, 2000);
  }

  /* ======================================================== 9. KONTAK & CRM WHATSAPP (gas-notifikasi-wa-crm §7) */
  const KT = { rows: null, q: '', seg: 'semua', st: '', tag: '', page: 1, sel: new Set(), syncAt: 0 };
  apage('kontak', {
    title: 'Kontak & CRM WhatsApp', perm: 'crm',
    template: () => `
      <div class="ahead"><div><h1 class="ah1">Kontak & CRM WhatsApp</h1><p class="muted" id="ktNote">Satu daftar kontak dari pelanggan, staf, dan impor manual — fokus Nama · Email · WhatsApp.</p></div>
        <div class="row-gap"><button class="btn btn-ghost" id="ktFresh" title="Ambil data terbaru dari server">${ic('refresh-cw')}Segarkan</button>${can('crm', 'ubah') ? `<button class="btn btn-ghost" id="ktSync">${ic('repeat')}Sinkron</button><button class="btn btn-ghost" id="ktImp">${ic('upload')}Impor CSV</button>` : ''}<button class="btn btn-ghost" id="ktExp">${ic('download')}Ekspor</button></div></div>
      <div class="stats6" id="ktStats"></div>
      <div class="chips mt-4" id="ktSeg"></div>
      <div class="card filters mt-3"><label class="input-ic grow">${ic('search')}<input id="ktQ" placeholder="Cari nama, nomor WA, email, atau tag"></label>
        <select id="ktSt" aria-label="Status WhatsApp"><option value="">Semua status WA</option><option value="Terdaftar">WA aktif</option><option value="Tidak Terdaftar">Bukan WA</option><option value="-">Belum dicek</option></select>
        <select id="ktTag" aria-label="Tag"><option value="">Semua tag</option></select></div>
      <div id="ktBulk" class="mt-3"></div>
      <div class="card p0 mt-3" id="ktTable"><div class="pad">${skeletonRows(8)}</div></div>`,
    init(el) {
      $('#ktQ', el).addEventListener('input', debounce(e => { KT.q = e.target.value.trim().toLowerCase(); KT.page = 1; renderKontak(); }, 180));
      $('#ktSt', el).onchange = e => { KT.st = e.target.value; KT.page = 1; renderKontak(); };
      $('#ktTag', el).onchange = e => { KT.tag = e.target.value; KT.page = 1; renderKontak(); };
      $('#ktFresh', el).onclick = () => loadKontak(true);
      const sy = $('#ktSync', el); if (sy) sy.onclick = async () => { setBusy(sy, true, 'Sinkron...'); const r = await api('crmSync', {}); setBusy(sy, false); toast(r.success ? r.message + ' +' + r.data.ditambah + ' baru, ' + r.data.diperbarui + ' diperbarui.' : r.message, r.success ? 'success' : 'error'); if (r.success) loadKontak(true); };
      const im = $('#ktImp', el); if (im) im.onclick = importKontak;
      $('#ktExp', el).onclick = () => { const l = kontakFiltered(); downloadCsv('kontak_crm', ['nama', 'email', 'whatsapp', 'segmen', 'sumber', 'tag', 'status_wa', 'opt_out', 'jumlah_pesan', 'terakhir', 'catatan'], l.map(k => [k.nama, k.email, hp08(k.wa), k.segmen, k.sumber, k.tag, k.status_wa, k.opt_out, k.jumlah_pesan, fmtDate(k.terakhir, true), k.catatan])); };
      el.addEventListener('click', e => {
        const sg = e.target.closest('[data-kseg]'); if (sg) { KT.seg = sg.dataset.kseg; KT.page = 1; renderKontak(); return; }
        const pg = e.target.closest('[data-kpg]'); if (pg && !pg.disabled) { KT.page = +pg.dataset.kpg; renderKontak(); return; }
        const kb = e.target.closest('[data-kbulk]'); if (kb) { bulkKontak(kb.dataset.kbulk, kb); return; }
        if (e.target.closest('[data-retry]')) { loadKontak(true); return; }
        if (e.target.closest('input.ck, label.ckl')) return;
        const r = e.target.closest('[data-krow]'); if (r) openKontak(r.dataset.krow);
      });
      el.addEventListener('change', e => {
        const t = e.target;
        if (t.id === 'ktAll') { kontakPage().forEach(k => t.checked ? KT.sel.add(k.id) : KT.sel.delete(k.id)); renderKontak(); }
        if (t.dataset.ksel) { t.checked ? KT.sel.add(t.dataset.ksel) : KT.sel.delete(t.dataset.ksel); renderBulkKontak(); const a = $('#ktAll'); if (a) a.checked = kontakPage().every(k => KT.sel.has(k.id)); }
      });
    },
    show(el, parts, q) { if (q.q) { KT.q = q.q.toLowerCase(); $('#ktQ', el).value = q.q; } loadKontak(false); }
  });
  function loadKontak(force) {
    if (KT.rows) renderKontak();
    return aswr('crmList', {}, d => { KT.rows = d.rows; KT.syncAt = d.sync_at; renderKontak(); }, { q: true, fresh: force ? 0 : 30000, fresh0: !!force, onError: r => failBox($('#ktTable'), r, 'k') });
  }
  function kontakFiltered() {
    const q = KT.q, hq = normHp(q);
    return (KT.rows || []).filter(k => {
      if (KT.seg === 'optout' ? k.opt_out !== 'YA' : KT.seg === 'dup' ? !k.dup : KT.seg !== 'semua' && k.segmen !== KT.seg) return false;
      if (KT.st && (KT.st === '-' ? k.status_wa : k.status_wa !== KT.st)) return false;
      if (KT.tag && tagsOf(k).indexOf(KT.tag) < 0) return false;
      return !q || (k.nama + ' ' + k.email + ' ' + hp08(k.wa) + ' ' + k.wa + ' ' + k.tag).toLowerCase().includes(q) || (hq && k.wa === hq);
    }).sort((a, b) => String(b.terakhir || b.dibuat).localeCompare(String(a.terakhir || a.dibuat)));
  }
  function kontakPage() { return kontakFiltered().slice((KT.page - 1) * 25, KT.page * 25); }
  function renderKontak() {
    const el = $('.apage[data-apage="kontak"]'); if (!el || !KT.rows) return;
    const R = KT.rows, n = f => R.filter(f).length;
    $('#ktStats', el).innerHTML = statCard({ label: 'Total Kontak', icon: 'contact', value: fmtNum(R.length) }) + statCard({ label: 'WA Terverifikasi', icon: 'circle-check', tone: 'sky', value: fmtNum(n(k => k.status_wa === 'Terdaftar')) }) +
      statCard({ label: 'Email Valid', icon: 'mail', value: fmtNum(n(k => k.email_valid === 'YA')) }) + statCard({ label: 'WA Belum Dicek', icon: 'hourglass', tone: 'sky', value: fmtNum(n(k => k.wa && !k.status_wa)) }) +
      statCard({ label: 'Opt-out Blast', icon: 'ban', value: fmtNum(n(k => k.opt_out === 'YA')) }) + statCard({ label: 'Duplikat', icon: 'merge', tone: 'sky', value: fmtNum(n(k => k.dup)) });
    const segs = {}; R.forEach(k => { segs[k.segmen] = (segs[k.segmen] || 0) + 1; });
    $('#ktSeg', el).innerHTML = [['semua', 'Semua', R.length]].concat(Object.keys(segs).sort().map(s => [s, s, segs[s]])).concat([['dup', 'Duplikat', n(k => k.dup)], ['optout', 'Opt-out', n(k => k.opt_out === 'YA')]])
      .map(s => '<button class="chip' + (KT.seg === s[0] ? ' active' : '') + '" data-kseg="' + esc(s[0]) + '">' + esc(s[1]) + ' <span class="chip-n">' + s[2] + '</span></button>').join('');
    const allTags = [...new Set(R.flatMap(tagsOf))].sort();
    const ts = $('#ktTag', el); ts.innerHTML = '<option value="">Semua tag</option>' + allTags.map(t => '<option' + (t === KT.tag ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
    $('#ktNote', el).textContent = 'Satu daftar kontak dari pelanggan, staf, dan impor manual.' + (KT.syncAt ? ' Sinkron terakhir ' + timeAgo(new Date(KT.syncAt).toISOString()) + '.' : '');
    const l = kontakFiltered(), page = l.slice((KT.page - 1) * 25, KT.page * 25), ub = can('crm', 'ubah');
    $('#ktTable', el).innerHTML = page.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + (ub ? '<th class="w-ck"><input type="checkbox" class="ck" id="ktAll" aria-label="Pilih semua di halaman ini"' + (page.every(k => KT.sel.has(k.id)) ? ' checked' : '') + '></th>' : '') + '<th>Kontak</th><th>WhatsApp</th><th>Segmen</th><th>Tag</th><th class="ta-r">Pesan</th><th>Terakhir</th></tr></thead><tbody>' +
      page.map(k => '<tr class="click" data-krow="' + esc(k.id) + '">' + (ub ? '<td><input type="checkbox" class="ck" data-ksel="' + esc(k.id) + '"' + (KT.sel.has(k.id) ? ' checked' : '') + ' aria-label="Pilih ' + esc(k.nama) + '"></td>' : '') +
        '<td><div class="who"><span class="av sm">' + esc(initials(k.nama)) + '</span><div><b>' + esc(k.nama) + (k.dup ? ' <span class="badge b-amber">Duplikat</span>' : '') + (k.opt_out === 'YA' ? ' <span class="badge b-slate">Opt-out</span>' : '') + '</b><small class="d-block muted">' + esc(k.email || '-') + '</small></div></div></td>' +
        '<td class="nowrap">' + (k.wa ? esc(hp08(k.wa)) + '<div>' + waBadge(k.status_wa) + '</div>' : '<span class="muted">-</span>') + '</td><td><span class="mini-chip">' + esc(k.segmen) + '</span></td>' +
        '<td>' + tagsOf(k).map(t => '<span class="tagp">' + esc(t) + '</span>').join(' ') + '</td><td class="ta-r">' + (k.jumlah_pesan || 0) + '</td><td class="nowrap muted small">' + (k.terakhir ? timeAgo(k.terakhir) : '-') + '</td></tr>').join('') +
      '</tbody></table></div>' + pager(l.length, KT.page, 25, 'data-kpg') : '<div class="empty"><div class="empty-art">' + ic('contact') + '</div><h3>' + (R.length ? 'Tidak ada kontak yang cocok' : 'Belum ada kontak') + '</h3><p class="muted">' + (R.length ? 'Ubah kata kunci atau filter.' : 'Kontak otomatis terbentuk dari setiap pelanggan yang checkout dan dari akun staf.') + '</p></div>';
    renderBulkKontak(); refreshIcons(el);
  }
  function renderBulkKontak() {
    const bb = $('#ktBulk'); if (!bb) return; const n = KT.sel.size;
    bb.innerHTML = n ? '<div class="bulk"><span class="bulk-n">' + n + '</span><b>' + n + ' kontak terpilih</b><div class="row-gap">' +
      (can('blast', 'ubah') ? '<button class="btn btn-sm btn-glass" data-kbulk="cek">' + ic('scan-search') + 'Cek WA</button><button class="btn btn-sm btn-glass" data-kbulk="blast">' + ic('send') + 'Blast ke terpilih</button>' : '') +
      '<button class="btn btn-sm btn-glass" data-kbulk="tag">' + ic('tag') + 'Beri tag</button><button class="btn btn-sm btn-glass" data-kbulk="untag">' + ic('tags') + 'Hapus tag</button><button class="btn btn-sm btn-glass" data-kbulk="optout">' + ic('ban') + 'Opt-out</button><button class="btn btn-sm btn-glass" data-kbulk="optin">' + ic('rotate-ccw') + 'Opt-in</button>' +
      '<button class="btn btn-sm btn-glass" data-kbulk="hapus">' + ic('trash-2') + 'Hapus manual</button><button class="btn btn-sm btn-glass" data-kbulk="clear">' + ic('x') + 'Batal</button></div></div>' : '';
    refreshIcons(bb);
  }
  async function bulkKontak(aksi, btn) {
    const ids = [...KT.sel], list = KT.rows.filter(k => KT.sel.has(k.id));
    if (aksi === 'clear') { KT.sel.clear(); renderKontak(); return; }
    if (aksi === 'cek') { await cekWaBertahap(list.filter(k => k.wa).map(k => k.wa), btn); return; }
    if (aksi === 'blast') { Adm.blastPick = list.filter(k => k.wa && k.opt_out !== 'YA').map(k => ({ id: k.id, nama: k.nama, wa: k.wa })); if (!Adm.blastPick.length) { toast('Tidak ada kontak WA yang bisa di-blast (tanpa nomor atau opt-out).', 'warning'); return; } go('admin/notifikasi?tab=blast&pick=1'); return; }
    let nilai = '';
    if (aksi === 'tag' || aksi === 'untag') { nilai = (prompt(aksi === 'tag' ? 'Nama tag yang ditambahkan (mis. reseller, vip):' : 'Nama tag yang dihapus:') || '').trim(); if (!nilai) return; }
    if (aksi === 'hapus' && !(await confirmDialog('Hapus kontak manual terpilih?', 'Hanya kontak hasil impor manual yang dihapus. Kontak dari data pelanggan/staf tetap ada.', 'Hapus', true))) return;
    // Optimistic UI + rollback
    const snap = list.map(k => ({ k, tag: k.tag, opt: k.opt_out }));
    if (aksi !== 'hapus') {
      list.forEach(k => { const t = tagsOf(k); if (aksi === 'tag' && t.indexOf(nilai) < 0) t.push(nilai); if (aksi === 'untag') { const i = t.indexOf(nilai); if (i > -1) t.splice(i, 1); } k.tag = t.join(', '); if (aksi === 'optout') k.opt_out = 'YA'; if (aksi === 'optin') k.opt_out = 'TIDAK'; });
      KT.sel.clear(); renderKontak();
    }
    const r = await api('crmBulk', { ids, aksi, nilai });
    if (!r.success) { snap.forEach(s => { s.k.tag = s.tag; s.k.opt_out = s.opt; }); renderKontak(); toast(r.message, 'error'); return; }
    toast(r.message, 'success'); Store.del('c:' + akey('crmList'));
    if (aksi === 'hapus') { KT.sel.clear(); loadKontak(true); }
  }
  /** Deteksi nomor WA via Fonnte per 50 nomor (§4.5) dengan progres. */
  async function cekWaBertahap(nomor, btn) {
    nomor = [...new Set(nomor)];
    if (!nomor.length) { toast('Tidak ada nomor untuk dicek.', 'warning'); return null; }
    const hasil = {}; let done = 0;
    for (let i = 0; i < nomor.length; i += 50) {
      if (btn) setBusy(btn, true, 'Mengecek ' + Math.min(nomor.length, i + 50) + '/' + nomor.length);
      const r = await api('waValidate', { nomor: nomor.slice(i, i + 50) });
      if (!r.success) { if (btn) setBusy(btn, false); toast(r.message, 'error', 6000); break; }
      Object.assign(hasil, r.data.hasil); done += Object.keys(r.data.hasil).length;
    }
    if (btn) setBusy(btn, false);
    if (KT.rows) { KT.rows.forEach(k => { if (hasil[k.wa]) k.status_wa = hasil[k.wa]; }); renderKontak(); Store.del('c:' + akey('crmList')); }
    if (done) { const ok = Object.values(hasil).filter(v => v === 'Terdaftar').length; toast(done + ' nomor dicek: ' + ok + ' aktif di WhatsApp, ' + (done - ok) + ' tidak.', 'success', 5000); }
    return hasil;
  }
  async function openKontak(id) {
    const k = (KT.rows || []).find(x => x.id === id); if (!k) return;
    const ub = can('crm', 'ubah');
    const m = modal('<div class="modal-head"><h3 class="h3">Detail Kontak</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="modal-body" id="kdBody"></div>', { side: true });
    const body = m.el.querySelector('#kdBody');
    const dups = k.dup ? KT.rows.filter(x => x.id !== k.id && ((k.wa && x.wa === k.wa) || (k.email && x.email === k.email))) : [];
    body.innerHTML = '<div class="crm-head"><span class="av xl">' + esc(initials(k.nama)) + '</span><h3 class="h3">' + esc(k.nama) + '</h3><small>' + esc(k.segmen) + ' · sumber: ' + esc(k.sumber) + '</small><div class="row-gap center mt-2">' + (k.wa ? waBadge(k.status_wa) : '') + (k.opt_out === 'YA' ? '<span class="badge b-slate">Opt-out blast</span>' : '') + '</div></div>' +
      '<div class="mini3"><div><b>' + (k.jumlah_pesan || 0) + '</b><small>Pesan terkirim</small></div><div><b>' + (k.terakhir ? timeAgo(k.terakhir) : '-') + '</b><small>Terakhir dihubungi</small></div><div><b>' + esc(Object.keys(k.info || {}).length ? (k.info.total_transaksi || k.info.role || '-') : '-') + '</b><small>' + (k.sumber === 'staf' ? 'Peran' : 'Transaksi') + '</small></div></div>' +
      '<form id="kdForm" class="stack mt-3"><div class="field"><label class="label">Nama</label><input name="nama" value="' + esc(k.nama) + '"' + (ub ? '' : ' disabled') + '></div>' +
      '<div class="form-grid"><div class="field"><label class="label">WhatsApp</label><input name="wa" value="' + esc(hp08(k.wa)) + '" inputmode="tel"' + (ub && k.sumber === 'manual' ? '' : ' disabled title="Nomor dari data toko diubah lewat pesanan/pelanggan"') + '></div><div class="field"><label class="label">Email</label><input name="email" type="email" value="' + esc(k.email) + '"' + (ub ? '' : ' disabled') + '></div></div>' +
      '<div class="field"><label class="label">Tag <small class="muted">(pisahkan dengan koma)</small></label><input name="tag" value="' + esc(k.tag) + '" placeholder="vip, reseller"' + (ub ? '' : ' disabled') + '></div>' +
      '<div class="field"><label class="label">Catatan</label><textarea name="catatan" rows="2"' + (ub ? '' : ' disabled') + '>' + esc(k.catatan) + '</textarea></div>' +
      '<div class="opt-row"><div><b>Opt-out dari blast</b><small>Kontak tidak akan menerima blast (notifikasi pesanan tetap terkirim).</small></div>' + toggle('kdOpt', k.opt_out === 'YA', ub ? '' : 'disabled') + '</div>' +
      (ub ? '<button class="btn btn-primary">' + ic('circle-check') + 'Simpan Kontak</button>' : '') + '</form>' +
      (dups.length && ub ? '<div class="info-box amber mt-3">' + ic('merge') + '<div><p><b>' + dups.length + ' kontak lain</b> memakai nomor/email yang sama: ' + dups.map(d => esc(d.nama) + ' (' + esc(d.segmen) + ')').join(', ') + '.</p><button class="btn btn-soft btn-sm mt-2" id="kdMerge">Gabungkan ke kontak ini</button></div></div>' : '') +
      (k.wa ? '<div class="row-gap mt-3"><a class="btn btn-ghost grow" href="' + waLink(k.wa, 'Halo ' + k.nama + ', ') + '" target="_blank" rel="noopener">' + ic('message-circle') + 'Chat WhatsApp</a>' + (k.email ? '<a class="btn btn-ghost grow" href="mailto:' + esc(k.email) + '">' + ic('mail') + 'Email</a>' : '') + '</div>' : '') +
      (ub ? '<span class="op-label mt-4">Catat Interaksi</span><form id="kdInt" class="sec-in"><select name="kanal" aria-label="Kanal"><option>Telepon</option><option>WA Manual</option><option>Kunjungan</option><option>Email Manual</option><option>Catatan</option></select><input name="ringkasan" placeholder="Ringkasan singkat…" required><button class="btn btn-soft">' + ic('plus') + '</button></form>' : '') +
      '<span class="op-label mt-4">Riwayat</span><div id="kdHist">' + skeletonRows(4) + '</div>';
    refreshIcons(body);
    const f = body.querySelector('#kdForm');
    f.onsubmit = async e => {
      e.preventDefault(); const b = f.querySelector('button'); if (!b) return;
      const p = { id: k.id, nama: f.nama.value, email: f.email.value, tag: f.tag.value, catatan: f.catatan.value, opt_out: body.querySelector('#kdOpt').checked };
      if (k.sumber === 'manual') p.wa = f.wa.value;
      setBusy(b, true, 'Menyimpan...'); const r = await api('crmSave', p); setBusy(b, false);
      if (!r.success) { toast(r.message, 'error'); return; }
      Object.assign(k, r.data.kontak); toast(r.message, 'success'); renderKontak(); Store.del('c:' + akey('crmList')); if (k.sumber === 'customer') Store.del('c:' + akey('customers'));
    };
    const mg = body.querySelector('#kdMerge'); if (mg) mg.onclick = async () => {
      if (!(await confirmDialog('Gabungkan kontak?', 'Tag, catatan, dan jumlah pesan digabung ke "' + k.nama + '". Kontak lain disembunyikan dari daftar (data asli tidak dihapus).', 'Gabungkan'))) return;
      setBusy(mg, true, '...'); const r = await api('crmMerge', { utama: k.id, gabung: dups.map(d => d.id) }); setBusy(mg, false);
      toast(r.message, r.success ? 'success' : 'error'); if (r.success) { m.close(); loadKontak(true); }
    };
    const fi = body.querySelector('#kdInt'); if (fi) fi.onsubmit = async e => {
      e.preventDefault(); const b = fi.querySelector('button'); setBusy(b, true, '');
      const r = await api('crmInteraksi', { id: k.id, kanal: fi.kanal.value, ringkasan: fi.ringkasan.value }); setBusy(b, false);
      if (!r.success) { toast(r.message, 'error'); return; }
      fi.reset(); k.terakhir = r.data.interaksi.tanggal; loadHist();
    };
    const loadHist = async () => {
      const r = await api('crmDetail', { id: k.id }), hb = body.querySelector('#kdHist'); if (!hb) return;
      if (!r.success) { hb.innerHTML = '<p class="muted small">' + esc(r.message) + '</p>'; return; }
      const ev = r.data.interaksi.map(x => ({ t: x.tanggal, ic: 'notebook-pen', h: x.kanal + ' · ' + x.oleh, d: x.ringkasan }))
        .concat(r.data.pesan.map(x => ({ t: x.waktu, ic: x.kanal === 'EMAIL' ? 'mail' : 'message-circle', h: (x.kanal === 'EMAIL' ? 'Email' : 'WhatsApp') + ' · ' + (x.event || '') + ' · ' + x.status, d: x.ringkas })))
        .concat(r.data.orders.map(o => ({ t: o.tanggal, ic: 'shopping-bag', h: 'Pesanan #' + o.id + ' · ' + fmtRp(o.total), d: o.status_bayar + ' · ' + o.status_pesanan, link: o.id })))
        .sort((a, b) => String(b.t).localeCompare(String(a.t))).slice(0, 60);
      hb.innerHTML = ev.length ? '<ul class="timeline sm">' + ev.map(x => '<li><span class="tl-dot"></span><div><b>' + ic(x.ic, 'xs') + ' ' + (x.link ? '<a class="txt-violet" href="#/admin/pesanan?id=' + esc(x.link) + '">' + esc(x.h) + '</a>' : esc(x.h)) + '</b><small class="muted d-block">' + fmtDate(x.t, true) + '</small><small class="d-block">' + esc(x.d) + '</small></div></li>').join('') + '</ul>' : '<p class="muted small">Belum ada riwayat interaksi.</p>';
      refreshIcons(hb);
    };
    loadHist();
  }
  function importKontak() {
    const m = modal('<div class="modal-head"><h3 class="h3">Impor Kontak dari CSV</h3><button class="iconbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="modal-body stack">' +
      '<p class="muted">Kolom yang dikenali: <code>nama</code>, <code>whatsapp</code> (atau <code>wa</code>/<code>hp</code>), <code>email</code>, <code>segmen</code>, <code>tag</code>, <code>catatan</code>. Nomor/email yang sudah ada otomatis dilewati.</p>' +
      '<button class="btn btn-ghost btn-sm" id="kiTpl">' + ic('file-down') + 'Unduh template CSV</button><label class="drop"><input type="file" id="kiFile" accept=".csv,text/csv">' + ic('file-spreadsheet') + '<span>Pilih file CSV (maks. 3.000 baris)</span></label><div id="kiPrev"></div></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="kiGo" disabled>' + ic('upload') + 'Impor</button></div>');
    let rows = [];
    m.el.querySelector('#kiTpl').onclick = () => { const csv = '﻿nama,whatsapp,email,segmen,tag,catatan\r\nBudi Santoso,081234567890,budi@email.com,Prospek,reseller,Kenalan pameran\r\n'; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'template_kontak.csv'; a.click(); };
    m.el.querySelector('#kiFile').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      rows = parseCsv(await file.text()).slice(0, 3000);
      const ok = rows.filter(r => (r.nama || r.name) && (normHp(r.whatsapp || r.wa || r.hp) || validEmail(r.email))).length;
      m.el.querySelector('#kiPrev').innerHTML = '<div class="info-box violet">' + ic('info') + '<p><b>' + rows.length + '</b> baris terbaca, <b>' + ok + '</b> lengkap (nama + WA/email).</p></div>';
      m.el.querySelector('#kiGo').disabled = !ok; refreshIcons(m.el);
    };
    m.el.querySelector('#kiGo').onclick = async e => {
      const b = e.currentTarget; setBusy(b, true, 'Mengimpor...');
      const r = await api('crmImport', { rows: rows.map(r => ({ nama: r.nama || r.name, wa: r.whatsapp || r.wa || r.hp, email: r.email, segmen: r.segmen, tag: r.tag, catatan: r.catatan })) });
      setBusy(b, false); toast(r.message, r.success ? 'success' : 'error', 5000); if (r.success) { m.close(); loadKontak(true); }
    };
  }

  /* ======================================================== 10. WHATSAPP & NOTIFIKASI (Blast · Antrean · Konfigurasi) */
  const NT = { tab: 'blast', blasts: null, queue: null, qSt: '', qKanal: '', sasaran: 'semua', manual: '', hanyaWa: false, pesan: 'Halo {nama} 👋\n\nAda promo spesial minggu ini di {nama_toko}! Cek katalog lengkapnya di sini:\n{link_toko}\n\nBalas STOP bila tidak ingin menerima info promo.', judul: '', batch: 20, jeda: '5', pick: null };
  apage('notifikasi', {
    title: 'WhatsApp & Notifikasi', perm: 'blast',
    template: () => `
      <div class="ahead"><div><h1 class="ah1">WhatsApp & Notifikasi</h1><p class="muted">Blast WhatsApp per batch (anti-banned), pantau antrean notifikasi otomatis, dan atur gateway.</p></div><button class="btn btn-ghost" id="ntFresh">${ic('refresh-cw')}Segarkan</button></div>
      <div class="atabs" id="ntTabs"><button data-ntab="blast">${ic('send')}Blast WhatsApp</button><button data-ntab="antrean">${ic('list-checks')}Antrean Notifikasi <span class="cnt" id="ntCntQ">–</span></button><button data-ntab="konfig">${ic('settings-2')}Konfigurasi</button></div>
      <div id="ntBody" class="mt-4"></div>`,
    init(el) {
      el.addEventListener('click', e => {
        const t = e.target.closest('[data-ntab]'); if (t) { go('admin/notifikasi?tab=' + t.dataset.ntab); return; }
        if (e.target.closest('#ntFresh')) { NT.tab === 'antrean' ? loadQueue(true) : NT.tab === 'blast' ? loadBlasts(true) : renderKonfig(true); return; }
        if (e.target.closest('[data-retry]')) { renderNt(); return; }
      });
    },
    show(el, parts, q) {
      NT.tab = ['blast', 'antrean', 'konfig'].indexOf(q.tab) > -1 ? q.tab : NT.tab;
      if (q.pick && Adm.blastPick) { NT.pick = Adm.blastPick; NT.sasaran = 'pilih'; Adm.blastPick = null; }
      $$('[data-ntab]', el).forEach(b => b.classList.toggle('on', b.dataset.ntab === NT.tab));
      renderNt();
    }
  });
  function renderNt() {
    const body = $('#ntBody'); if (!body) return;
    if (NT.tab === 'blast') renderBlastTab(body);
    else if (NT.tab === 'antrean') { body.innerHTML = '<div class="card">' + skeletonRows(8) + '</div>'; loadQueue(false); }
    else renderKonfig(false);
  }
  /* ---- Blast ---- */
  function audience() {
    if (NT.sasaran === 'manual') return NT.manual.split(/\n+/).map(l => { const [a, b] = l.split(/[|;,\t]/); const wa = normHp(a); return wa ? { id: '', wa, nama: (b || '').trim() || 'Kak', status_wa: '' } : null; }).filter(Boolean);
    if (NT.sasaran === 'pilih') return (NT.pick || []).map(p => Object.assign({ status_wa: ((KT.rows || []).find(k => k.id === p.id) || {}).status_wa || '' }, p));
    const R = (KT.rows || []).filter(k => k.wa && k.opt_out !== 'YA');
    if (NT.sasaran === 'semua') return R;
    if (NT.sasaran.indexOf('seg:') === 0) return R.filter(k => k.segmen === NT.sasaran.slice(4));
    if (NT.sasaran.indexOf('tag:') === 0) return R.filter(k => tagsOf(k).indexOf(NT.sasaran.slice(4)) > -1);
    return [];
  }
  function audienceFinal() { const seen = {}; return audience().filter(a => { if (seen[a.wa]) return false; seen[a.wa] = 1; return !NT.hanyaWa || a.status_wa === 'Terdaftar'; }); }
  function renderBlastTab(body) {
    const canCrm = can('crm');
    if (canCrm && !KT.rows) { body.innerHTML = '<div class="card">' + skeletonRows(6) + '</div>'; loadKontak(false).then(() => { if (NT.tab === 'blast' && Adm.current === 'notifikasi') renderBlastTab(body); }); return; }
    const segs = [...new Set((KT.rows || []).map(k => k.segmen))].sort(), tags = [...new Set((KT.rows || []).flatMap(tagsOf))].sort();
    const ub = can('blast', 'ubah');
    body.innerHTML = '<div class="nt-grid"><section class="card setc"><div class="setc-h"><span class="ic-box">' + ic('send') + '</span><div><h3 class="h3 m0">Buat Blast Baru</h3><small class="muted">Pesan masuk antrean & dikirim per batch dengan jeda — aman walau tab ditutup.</small></div></div>' +
      '<div class="field"><label class="label" for="bJudul">Judul (internal)</label><input id="bJudul" value="' + esc(NT.judul) + '" placeholder="Promo akhir bulan"></div>' +
      '<div class="field"><label class="label" for="bSas">Sasaran</label><select id="bSas">' +
      (canCrm ? '<option value="semua">Semua kontak WA (' + (KT.rows || []).filter(k => k.wa && k.opt_out !== 'YA').length + ')</option>' + segs.map(s => '<option value="seg:' + esc(s) + '">Segmen: ' + esc(s) + '</option>').join('') + tags.map(t => '<option value="tag:' + esc(t) + '">Tag: ' + esc(t) + '</option>').join('') : '') +
      (NT.pick ? '<option value="pilih">Kontak terpilih dari CRM (' + NT.pick.length + ')</option>' : '') + '<option value="manual">Tempel nomor manual</option></select></div>' +
      '<div class="field" id="bManWrap"' + (NT.sasaran === 'manual' ? '' : ' hidden') + '><label class="label" for="bMan">Nomor (satu per baris, format <code>0812…|Nama</code>)</label><textarea id="bMan" rows="4" placeholder="081234567890|Budi&#10;085711112222|Sari">' + esc(NT.manual) + '</textarea></div>' +
      '<div class="opt-row"><div><b>Hanya nomor yang terverifikasi WhatsApp</b><small>Hemat kuota & mengurangi risiko banned. <button class="link" id="bCek" type="button">Cek nomor yang belum dicek</button></small></div>' + toggle('bOnly', NT.hanyaWa) + '</div>' +
      '<div class="field"><div class="row-between"><label class="label" for="bPesan">Pesan</label><span class="row-gap">' + ['{nama}', '{nama_toko}', '{link_toko}'].map(v => '<button class="var-chip" data-var="' + v + '" type="button">' + v + '</button>').join('') + '</span></div><textarea id="bPesan" rows="7" maxlength="2000">' + esc(NT.pesan) + '</textarea><small class="muted">Gunakan <b>*teks*</b> untuk tebal. Variabel diisi otomatis per penerima.</small></div>' +
      '<div class="form-grid"><div class="field"><span class="label">Ukuran batch per putaran</span><div class="seg full" id="bBatch">' + [10, 20, 50].map(n => '<button type="button" data-batch="' + n + '" class="' + (NT.batch === n ? 'on' : '') + '">' + n + '</button>').join('') + '</div></div>' +
      '<div class="field"><label class="label" for="bJeda">Jeda antarpesan (detik)</label><input id="bJeda" value="' + esc(NT.jeda) + '" placeholder="5 atau 3-8"><small class="muted">Rentang acak (mis. 3-8) lebih alami.</small></div></div>' +
      '<div id="bSum" class="bsum"></div>' +
      (ub ? '<button class="btn btn-primary btn-lg btn-block" id="bGo">' + ic('send') + 'Mulai Blast</button>' : '<p class="muted small">Anda hanya punya akses lihat.</p>') +
      '</section><aside class="stack"><section class="card setc"><span class="op-label">Pratinjau di WhatsApp</span><div class="wa-wall"><div class="wa-prev" id="bPrev"></div></div><div class="info-box violet mt-3">' + ic('shield-check') + '<p><b>Tips anti-banned:</b> kirim ke kontak yang mengenal toko Anda, batch 10–20 untuk nomor baru, jeda acak, sertakan cara berhenti (STOP), dan hindari tautan berlebihan.</p></div></section>' +
      '<section class="card p0"><div class="setc-h pad"><span class="ic-box">' + ic('history') + '</span><div><h3 class="h3 m0">Riwayat Blast</h3><small class="muted">Progres diperbarui otomatis.</small></div></div><div id="bList">' + skeletonRows(4) + '</div></section></aside></div>';
    refreshIcons(body);
    const sas = $('#bSas'); sas.value = [...sas.options].some(o => o.value === NT.sasaran) ? NT.sasaran : sas.options[0].value; NT.sasaran = sas.value;
    const upd = () => {
      NT.judul = $('#bJudul').value; NT.pesan = $('#bPesan').value; NT.jeda = $('#bJeda').value.trim(); NT.manual = $('#bMan').value; NT.hanyaWa = $('#bOnly').checked;
      const aud = audience(), fin = audienceFinal(), belum = aud.filter(a => !a.status_wa).length, bukan = aud.filter(a => a.status_wa === 'Tidak Terdaftar').length;
      const j = String(NT.jeda).split('-').map(Number), avg = j.length > 1 ? (j[0] + j[1]) / 2 : (j[0] || 5);
      const menit = Math.ceil(fin.length * avg / 60), putaran = Math.ceil(fin.length / NT.batch);
      $('#bSum').innerHTML = '<div><b>' + fmtNum(fin.length) + '</b><small>Penerima</small></div><div><b>' + putaran + '</b><small>Batch</small></div><div><b>±' + menit + ' mnt</b><small>Estimasi kirim</small></div><div><b>' + belum + '</b><small>Belum dicek WA</small></div>' + (bukan ? '<div><b class="txt-red">' + bukan + '</b><small>Bukan WA</small></div>' : '');
      const sample = fin[0] || { nama: 'Rian' }, st = Adm.store || {};
      $('#bPrev').innerHTML = esc(NT.pesan.replace(/\{nama\}/g, sample.nama).replace(/\{nama_toko\}/g, st.toko_nama || storeName()).replace(/\{link_toko\}/g, st.store_url || location.href.split('#')[0])).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '<span class="wa-time">' + new Date().toTimeString().slice(0, 5) + ' ✓✓</span>';
    };
    body.addEventListener('input', upd);
    sas.onchange = () => { NT.sasaran = sas.value; $('#bManWrap').hidden = NT.sasaran !== 'manual'; upd(); };
    $('#bOnly').onchange = upd;
    $('#bBatch').onclick = e => { const b = e.target.closest('[data-batch]'); if (!b) return; NT.batch = +b.dataset.batch; $$('#bBatch button').forEach(x => x.classList.toggle('on', x === b)); upd(); };
    $$('[data-var]', body).forEach(b => b.onclick = () => { const t = $('#bPesan'), s = t.selectionStart; t.value = t.value.slice(0, s) + b.dataset.var + t.value.slice(t.selectionEnd); t.focus(); t.selectionStart = t.selectionEnd = s + b.dataset.var.length; upd(); });
    $('#bCek').onclick = async e => { const nomor = audience().filter(a => !a.status_wa).map(a => a.wa); const h = await cekWaBertahap(nomor, e.currentTarget); if (h && NT.pick) NT.pick.forEach(p => { if (h[p.wa]) p.status_wa = h[p.wa]; }); upd(); };
    const go2 = $('#bGo'); if (go2) go2.onclick = () => startBlast(go2);
    upd(); loadBlasts(false);
  }
  async function startBlast(btn) {
    const fin = audienceFinal();
    if (!fin.length) { toast('Belum ada penerima. Pilih sasaran atau tempel nomor.', 'warning'); return; }
    if (NT.pesan.trim().length < 3) { toast('Isi pesan blast.', 'warning'); return; }
    if (!/^\d{1,3}(-\d{1,3})?$/.test(NT.jeda)) { toast('Format jeda: angka (5) atau rentang (3-8).', 'warning'); return; }
    if (!(await confirmDialog('Mulai blast ke ' + fin.length + ' nomor?', 'Dikirim ' + NT.batch + ' pesan per batch dengan jeda ' + NT.jeda + ' detik. Batch pertama dikirim sekarang, sisanya otomatis tiap menit (atau klik "Kirim batch berikutnya").', 'Mulai Blast'))) return;
    const sasLabel = $('#bSas').selectedOptions[0].textContent;
    setBusy(btn, true, 'Menyiapkan antrean...');
    const r = await api('blastCreate', { judul: NT.judul, pesan: NT.pesan, batch: NT.batch, jeda: NT.jeda, sasaran: sasLabel, penerima: fin.map(a => ({ id: a.id, nama: a.nama, wa: a.wa })) });
    if (!r.success) { setBusy(btn, false); toast(r.message, 'error', 6000); return; }
    toast(r.message + (r.data.opt_out ? ' ' + r.data.opt_out + ' opt-out dilewati.' : ''), 'success', 5000);
    NT.judul = ''; NT.pick = null; if (NT.sasaran === 'pilih') NT.sasaran = 'semua';
    setBusy(btn, true, 'Mengirim batch pertama...');
    await processBlast(r.data.id);
    setBusy(btn, false); Store.del('c:' + akey('blastList')); loadBlasts(true);
  }
  async function processBlast(id, btn) {
    if (btn) setBusy(btn, true, 'Mengirim...');
    const r = await api('blastProcess', { id });
    if (btn) setBusy(btn, false);
    if (!r.success) { toast(r.message, 'error'); return; }
    if (r.data.blast && NT.blasts) { const i = NT.blasts.findIndex(b => b.id === id); if (i > -1) NT.blasts[i] = r.data.blast; else NT.blasts.unshift(r.data.blast); renderBlastList(); }
    toast(r.message, 'info');
  }
  function loadBlasts(force) {
    if (NT.blasts) renderBlastList();
    return aswr('blastList', {}, d => { NT.blasts = d.blasts; renderBlastList(); }, { q: true, fresh: force ? 0 : 15000, fresh0: !!force, onError: r => { const h = $('#bList'); if (h) failBox(h, r, 'b'); } });
  }
  function renderBlastList() {
    const h = $('#bList'); if (!h || !NT.blasts) return;
    const ub = can('blast', 'ubah');
    h.innerHTML = NT.blasts.length ? '<ul class="blist">' + NT.blasts.slice(0, 30).map(b => '<li><div class="row-between"><b>' + esc(b.judul) + '</b>' + badge(b.status === 'Berjalan' ? 'Diproses' : b.status === 'Selesai' ? 'Selesai' : 'Dibatalkan').replace(/>(Diproses|Selesai|Dibatalkan)</, '>' + esc(b.status) + '<') + '</div>' +
      '<small class="muted d-block">' + esc(b.sasaran) + ' · ' + fmtDate(b.tanggal, true) + ' · batch ' + b.batch + ', jeda ' + esc(b.jeda) + ' dtk</small>' + progress(b.persen, b.gagal ? 'warn' : '') +
      '<small class="d-block"><b>' + b.terkirim + '</b> terkirim · <b>' + b.gagal + '</b> gagal · <b>' + b.sisa + '</b> antre dari ' + b.total + ' (' + b.persen + '%)</small>' +
      (ub && b.status === 'Berjalan' ? '<div class="row-gap mt-2"><button class="btn btn-soft btn-sm" data-bnext="' + esc(b.id) + '">' + ic('play') + 'Kirim batch berikutnya</button><button class="btn btn-ghost btn-sm danger" data-bstop="' + esc(b.id) + '">' + ic('square') + 'Hentikan</button></div>' : '') + '</li>').join('') + '</ul>' :
      '<div class="empty sm"><span class="empty-art sm">' + ic('send') + '</span><p class="muted">Belum ada blast.</p></div>';
    refreshIcons(h);
    h.onclick = async e => {
      const n = e.target.closest('[data-bnext]'); if (n) { processBlast(n.dataset.bnext, n); return; }
      const s = e.target.closest('[data-bstop]'); if (s) { if (!(await confirmDialog('Hentikan blast?', 'Pesan yang belum terkirim dibatalkan. Yang sudah terkirim tidak bisa ditarik.', 'Hentikan', true))) return; setBusy(s, true, '...'); const r = await api('blastStop', { id: s.dataset.bstop }); setBusy(s, false); toast(r.message, r.success ? 'success' : 'error'); if (r.success) loadBlasts(true); }
    };
    // Polling progres hanya saat ada blast berjalan (§4.8)
    if (NT.blasts.some(b => b.status === 'Berjalan') && Adm.current === 'notifikasi' && NT.tab === 'blast') { if (!Adm.pollT) startFastPoll(() => loadBlasts(true), 15000, 60000, 'blast'); }
    else if (Adm.current === 'notifikasi') stopPoll();
  }
  /* ---- Antrean ---- */
  function loadQueue(force) {
    if (NT.queue) renderQueue();
    return aswr('notifQueue', {}, d => { NT.queue = d; renderQueue(); }, { q: true, fresh: force ? 0 : 10000, fresh0: !!force, onError: r => { const b = $('#ntBody'); if (b && NT.tab === 'antrean') failBox(b, r, 'q'); } });
  }
  function renderQueue() {
    const body = $('#ntBody'), Q = NT.queue; if (!Q) return;
    const c = $('#ntCntQ'); if (c) c.textContent = Q.ringkas.Antri || 0;
    if (!body || NT.tab !== 'antrean') return;
    const l = Q.rows.filter(r => (!NT.qSt || r.status === NT.qSt) && (!NT.qKanal || r.kanal === NT.qKanal)), own = isOwner();
    body.innerHTML = '<div class="stats6">' + statCard({ label: 'Antre', icon: 'hourglass', value: fmtNum(Q.ringkas.Antri + (Q.ringkas.Proses || 0)) }) + statCard({ label: 'Terkirim', icon: 'circle-check', tone: 'sky', value: fmtNum(Q.ringkas.Terkirim) }) + statCard({ label: 'Gagal', icon: 'circle-x', value: fmtNum(Q.ringkas.Gagal) }) + statCard({ label: 'Dibatalkan', icon: 'ban', tone: 'sky', value: fmtNum(Q.ringkas.Batal) }) + statCard({ label: 'Sisa Kuota Email', icon: 'mail', value: fmtNum(Q.email_quota), sub: '<span class="muted">hari ini</span>' }) + statCard({ label: 'Status Pekerja', icon: 'zap', tone: 'sky', value: Q.ada ? 'Bekerja' : 'Siaga', sub: '<span class="muted">trigger tiap 1 menit</span>' }) + '</div>' +
      '<div class="card filters mt-4"><select id="qSt" aria-label="Status"><option value="">Semua status</option>' + ['Antri', 'Proses', 'Terkirim', 'Gagal', 'Batal'].map(s => '<option' + (NT.qSt === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select><select id="qKanal" aria-label="Kanal"><option value="">Semua kanal</option><option value="WA"' + (NT.qKanal === 'WA' ? ' selected' : '') + '>WhatsApp</option><option value="EMAIL"' + (NT.qKanal === 'EMAIL' ? ' selected' : '') + '>Email</option></select><span class="grow"></span>' +
      (own ? '<button class="btn btn-soft btn-sm" id="qNow">' + ic('zap') + 'Proses sekarang</button><button class="btn btn-ghost btn-sm" id="qRetry"' + (Q.ringkas.Gagal ? '' : ' disabled') + '>' + ic('rotate-ccw') + 'Ulangi yang gagal</button>' : '') + '</div>' +
      '<div class="card p0 mt-3">' + (l.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Kanal</th><th>Tujuan</th><th>Event</th><th>Isi</th><th>Status</th></tr></thead><tbody>' + l.map(r => '<tr><td class="nowrap small">' + fmtDate(r.dikirim || r.dibuat, true) + '</td><td>' + (r.kanal === 'WA' ? '<span class="badge b-green">WA</span>' : '<span class="badge b-sky">Email</span>') + '</td><td class="nowrap"><b>' + esc(r.nama || '-') + '</b><small class="d-block muted">' + esc(r.kanal === 'WA' ? hp08(r.tujuan) : r.tujuan) + '</small></td><td><span class="mini-chip">' + esc(r.event || '-') + '</span></td><td class="small clip2" title="' + esc(r.ringkas) + '">' + esc(r.ringkas) + '</td><td>' + qBadge(r) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty"><div class="empty-art">' + ic('list-checks') + '</div><h3>Antrean kosong</h3><p class="muted">Notifikasi pesanan & blast akan tampil di sini.</p></div>') + '</div>';
    refreshIcons(body);
    $('#qSt').onchange = e => { NT.qSt = e.target.value; renderQueue(); };
    $('#qKanal').onchange = e => { NT.qKanal = e.target.value; renderQueue(); };
    const qn = $('#qNow'); if (qn) qn.onclick = async () => { setBusy(qn, true, 'Memproses...'); const r = await api('notifProcessNow', {}); setBusy(qn, false); toast(r.message, r.success ? 'success' : 'error'); loadQueue(true); };
    const qr = $('#qRetry'); if (qr) qr.onclick = async () => { setBusy(qr, true, '...'); const r = await api('notifRetry', {}); setBusy(qr, false); toast(r.message, r.success ? 'success' : 'error'); loadQueue(true); };
    if ((Q.ringkas.Antri || Q.ringkas.Proses) && !Adm.pollT) startFastPoll(() => loadQueue(true), 15000, 60000, 'queue');
  }
  function qBadge(r) { const m = { Antri: 'amber', Proses: 'violet', Terkirim: 'green', Gagal: 'red', Batal: 'slate' }; return '<span class="badge b-' + (m[r.status] || 'slate') + '" title="' + esc(r.respon || '') + '">' + esc(r.status) + (r.percobaan > 1 ? ' ×' + r.percobaan : '') + '</span>' + (r.status === 'Gagal' && r.respon ? '<small class="d-block muted clip" title="' + esc(r.respon) + '">' + esc(r.respon) + '</small>' : ''); }
  /* ---- Konfigurasi ---- */
  function renderKonfig(force) {
    const body = $('#ntBody'); if (!body) return;
    if (!isOwner()) { body.innerHTML = '<div class="card empty"><div class="empty-art">' + ic('lock') + '</div><h3>Khusus Owner</h3><p class="muted">Token Fonnte, saklar notifikasi, dan template hanya bisa diubah Owner. Anda tetap bisa membuat blast & memantau antrean.</p></div>'; refreshIcons(body); return; }
    body.innerHTML = '<div class="card">' + skeletonRows(6) + '</div>';
    aswr('settings', {}, d => {
      ST.data = d; if (!ST.dirty) ST.draft = JSON.parse(JSON.stringify(d.settings));
      if (NT.tab !== 'konfig' || Adm.current !== 'notifikasi') return;
      const S = d.settings, tok = d.secrets.FONNTE_TOKEN || {};
      body.innerHTML = '<div class="nt-grid"><section class="card setc"><div class="setc-h"><span class="ic-box">' + ic('message-circle') + '</span><div><h3 class="h3 m0">Status Gateway</h3><small class="muted">Ringkasan konfigurasi saat ini.</small></div></div>' +
        '<ul class="kv"><li><span>WhatsApp (Fonnte)</span>' + (S.wa_aktif ? '<span class="badge b-green">Aktif</span>' : '<span class="badge b-slate">Nonaktif</span>') + '</li><li><span>Token Fonnte</span>' + (tok.ada ? '<code>' + esc(tok.samar) + '</code>' : '<span class="badge b-red">Belum diisi</span>') + '</li><li><span>Email (Gmail)</span>' + (S.email_aktif ? '<span class="badge b-green">Aktif</span>' : '<span class="badge b-slate">Nonaktif</span>') + '</li><li><span>Sisa kuota email</span><b>' + fmtNum(d.email_quota) + '</b></li>' +
        '<li><span>Batch default · jeda</span><b>' + (S.wa_batch_default || 20) + ' · ' + esc(S.wa_jeda || '5') + ' dtk</b></li><li><span>Deteksi WA otomatis</span>' + (S.wa_deteksi_otomatis ? '<span class="badge b-green">Ya</span>' : '<span class="badge b-slate">Tidak</span>') + '</li>' +
        '<li><span>Antrean v1.1</span>' + (d.modul_v11 ? '<span class="badge b-green">Aktif</span>' : '<span class="badge b-amber">Jalankan setupV11</span>') + '</li><li><span>Trigger</span><small>' + esc((d.triggers || []).join(', ') || '-') + '</small></li></ul>' +
        '<a class="btn btn-primary btn-block mt-3" href="#/admin/integrasi?fokus=wa">' + ic('settings-2') + 'Ubah token, saklar & template</a></section>' +
        '<section class="card setc"><div class="setc-h"><span class="ic-box">' + ic('smartphone') + '</span><div><h3 class="h3 m0">Perangkat Fonnte</h3><small class="muted">Pastikan HP pengirim tersambung.</small></div></div><div id="devBox"><button class="btn btn-soft" id="devCek">' + ic('radio') + 'Cek status perangkat</button></div>' +
        '<div class="field mt-4"><span class="label">Kirim pesan uji</span><div class="sec-in"><input id="tesWaHp" placeholder="08xx nomor tujuan uji" inputmode="tel"><button class="btn btn-primary" id="tesWa2">' + ic('send') + 'Kirim</button></div></div></section></div>';
      refreshIcons(body);
      $('#devCek').onclick = async e => { const b = e.currentTarget; setBusy(b, true, 'Memeriksa...'); const r = await api('waDevice', {}); setBusy(b, false); $('#devBox').innerHTML = r.success ? '<ul class="kv"><li><span>Perangkat</span><b>' + esc(r.data.device) + '</b></li><li><span>Status</span>' + (/connect/i.test(r.data.status) ? '<span class="badge b-green">Tersambung</span>' : '<span class="badge b-red">' + esc(r.data.status) + '</span>') + '</li><li><span>Paket</span><b>' + esc(r.data.paket || '-') + '</b></li><li><span>Kuota</span><b>' + esc(r.data.kuota || '-') + '</b></li><li><span>Berlaku s/d</span><b>' + esc(r.data.kedaluwarsa || '-') + '</b></li></ul>' : '<div class="info-box red">' + ic('circle-alert') + '<p>' + esc(r.message) + '</p></div>'; refreshIcons($('#devBox')); };
      $('#tesWa2').onclick = e => testWa(e.currentTarget);
    }, { q: true, fresh: force ? 0 : 30000, fresh0: !!force, onError: r => failBox(body, r, 'n') });
  }

  /* ======================================================== 11. MIGRASI DATA (Owner · gas-migrasi-database) */
  const MG = { src: '', sheets: ['pengaturan', 'kategori', 'produk', 'customer', 'transaksi', 'invoice', 'laporan'], overwrite: false, last: null };
  const MG_LABEL = { pengaturan: 'Pengaturan toko', kategori: 'Kategori', produk: 'Produk', customer: 'Pelanggan', transaksi: 'Transaksi / Pesanan', invoice: 'Invoice', laporan: 'Laporan harian', logs: 'Log aktivitas' };
  apage('migrasi', {
    title: 'Migrasi Data', owner: true,
    template: () => `
      <div class="ahead"><div><h1 class="ah1">Migrasi Data dari App Lama <span class="badge b-violet">${ic('lock')}Khusus Owner</span></h1><p class="muted">Pindahkan produk, pelanggan, dan pesanan dari spreadsheet toko lama. Spreadsheet lama hanya <b>dibaca</b>, tidak pernah diubah.</p></div></div>
      <div class="nt-grid"><section class="card setc">
        <div class="field"><label class="label" for="mgSrc">URL atau ID spreadsheet lama</label><input id="mgSrc" placeholder="https://docs.google.com/spreadsheets/d/…/edit"><small class="muted">Harus milik (atau dibagikan ke) akun Google pemilik script ini agar foto Drive tetap tampil.</small></div>
        <span class="label">Data yang dipindahkan</span><div class="mig-sheets" id="mgSheets"></div>
        <div class="opt-row mt-3"><div><b>Timpa data yang sudah ada</b><small>Default mati: data yang sudah diedit di app baru tidak ditimpa. Pesanan Lunas/Selesai/Dibatalkan tidak pernah ditimpa.</small></div>${toggle('mgOw', false)}</div>
        <div class="row-gap mt-4"><button class="btn btn-ghost grow" id="mgScan">${ic('scan-search')}Pindai (Dry-run)</button><button class="btn btn-primary grow" id="mgRun">${ic('database-zap')}Jalankan Import</button></div>
      </section>
      <aside class="card setc"><div class="setc-h"><span class="ic-box">${ic('list-checks')}</span><div><h3 class="h3 m0">Langkah Cutover</h3><small class="muted">Aman diulang — tanpa data dobel.</small></div></div>
        <ol class="steps-mini"><li><b>Pindai</b> untuk melihat jumlah yang akan ditambah/diperbarui.</li><li><b>Jalankan Import</b>, lalu cek produk, foto, dan pelanggan.</li><li>Uji satu checkout di toko baru.</li><li>Tepat sebelum pindah: <b>Jalankan Import sekali lagi</b> (delta) untuk menangkap pesanan terbaru.</li><li>Umumkan alamat baru (blast WA dari menu WhatsApp & Notifikasi).</li></ol>
        <div class="info-box violet mt-3">${ic('info')}<p>Akun admin lama <b>tidak</b> diimpor demi keamanan, dan sesi login lama tidak ikut pindah.</p></div></aside></div>
      <div id="mgRes" class="mt-4"></div>`,
    init(el) {
      $('#mgSheets', el).innerHTML = Object.keys(MG_LABEL).map(k => '<label class="check"><input type="checkbox" data-mg="' + k + '"' + (MG.sheets.indexOf(k) > -1 ? ' checked' : '') + '><span>' + MG_LABEL[k] + '</span></label>').join('');
      $('#mgScan', el).onclick = e => runImport(true, e.currentTarget);
      $('#mgRun', el).onclick = e => runImport(false, e.currentTarget);
    },
    show() { warmUpServer('admin'); }
  });
  async function runImport(dryRun, btn) {
    const src = $('#mgSrc').value.trim(); if (!src) { toast('Tempel URL spreadsheet lama.', 'warning'); $('#mgSrc').focus(); return; }
    const sheets = $$('[data-mg]').filter(c => c.checked).map(c => c.dataset.mg); if (!sheets.length) { toast('Pilih minimal satu data.', 'warning'); return; }
    const overwrite = $('#mgOw').checked;
    if (!dryRun && !(await confirmDialog('Jalankan import sekarang?', 'Data dari spreadsheet lama ditambahkan ke toko ini. Aman diulang (tidak membuat data dobel).', 'Jalankan Import'))) return;
    setBusy(btn, true, dryRun ? 'Memindai...' : 'Mengimpor... (bisa 1–5 menit)');
    const r = await api('importData', { source: src, sheets, overwrite, dryRun }, { timeout: 330000 });
    setBusy(btn, false);
    const box = $('#mgRes');
    if (!r.success) { box.innerHTML = '<div class="info-box red">' + ic('circle-alert') + '<p>' + esc(r.message) + '</p></div>'; refreshIcons(box); return; }
    const d = r.data, tot = { inserted: 0, updated: 0 };
    box.innerHTML = '<section class="card p0"><div class="setc-h pad"><span class="ic-box">' + ic(d.dryRun ? 'scan-search' : 'circle-check-big') + '</span><div><h3 class="h3 m0">' + (d.dryRun ? 'Hasil Pindai (belum ada yang ditulis)' : 'Import Selesai') + '</h3><small class="muted">Sumber: ' + esc(d.source.name) + ' · ' + (d.ms / 1000).toFixed(1) + ' detik</small></div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th class="ta-r">Di app lama</th><th class="ta-r">Ditambah</th><th class="ta-r">Diperbarui</th><th class="ta-r">Dilewati</th></tr></thead><tbody>' +
      Object.keys(d.report).map(k => { const x = d.report[k]; tot.inserted += x.inserted || 0; tot.updated += x.updated || 0; return '<tr><td><b>' + esc(MG_LABEL[k] || k) + '</b>' + (x.tidak_ada ? ' <span class="badge b-slate">Sheet tidak ada</span>' : '') + '</td><td class="ta-r">' + fmtNum(x.source) + '</td><td class="ta-r txt-green"><b>' + fmtNum(x.inserted) + '</b></td><td class="ta-r">' + fmtNum(x.updated) + '</td><td class="ta-r muted">' + fmtNum(x.skipped) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + (d.warnings.length ? '<div class="pad"><span class="op-label">Catatan</span><ul class="warn-list">' + d.warnings.map(w => '<li>' + ic('triangle-alert', 'xs') + esc(w) + '</li>').join('') + '</ul></div>' : '') +
      (d.dryRun && (tot.inserted || tot.updated) ? '<div class="pad"><button class="btn btn-primary" id="mgRun2">' + ic('database-zap') + 'Lanjut Jalankan Import</button></div>' : '') + '</section>';
    refreshIcons(box);
    const r2 = $('#mgRun2'); if (r2) r2.onclick = () => runImport(false, r2);
    if (!d.dryRun) { ['boot', 'products', 'orders', 'customers', 'crmList', 'dashboard', 'settings'].forEach(k => Store.del('c:' + akey(k))); Store.del('c:catalog'); Adm.products = Adm.orders = Adm.customers = null; KT.rows = null; toast('Import selesai. Data toko diperbarui.', 'success'); }
  }

  /* ======================================================== TEMA WARNA DINAMIS (Pengaturan Owner) */
  const TEMA_DEF = { preset: 'violet', primary: '#7C3AED', secondary: '#38BDF8', radius: 'standar' };
  const PRESET_NAMA = { violet: 'Lavender', ocean: 'Samudra', emerald: 'Zamrud', rose: 'Mawar', sunset: 'Senja', teal: 'Toska', grape: 'Anggur', midnight: 'Malam' };
  function temaCard(S, D) {
    const t = Object.assign({}, TEMA_DEF, S.tema || {}), P = D.tema_preset || { violet: ['#7C3AED', '#38BDF8'] };
    return '<section class="card setc" id="temaCard"><div class="setc-h"><span class="ic-box">' + ic('palette') + '</span><div><h3 class="h3 m0">Tema Warna Website</h3><small class="muted">Pilih preset atau warna merek sendiri. Pratinjau langsung — berlaku untuk etalase & dashboard setelah disimpan.</small></div></div>' +
      '<span class="label">Preset</span><div class="theme-sw">' + Object.keys(P).map(k => '<button type="button" class="tsw' + (t.preset === k ? ' on' : '') + '" data-tpreset="' + k + '" aria-label="Tema ' + esc(PRESET_NAMA[k] || k) + '"><span style="background:linear-gradient(135deg,' + P[k][0] + ',' + P[k][1] + ')"></span><small>' + esc(PRESET_NAMA[k] || k) + '</small></button>').join('') +
      '<button type="button" class="tsw' + (t.preset === 'custom' ? ' on' : '') + '" data-tpreset="custom"><span class="custom">' + ic('swatch-book') + '</span><small>Kustom</small></button></div>' +
      '<div class="form-grid g3 mt-3"><div class="field"><label class="label" for="tPri">Warna utama</label><div class="color-in"><input type="color" id="tPri" value="' + esc(t.primary) + '"><input data-thex="primary" value="' + esc(t.primary) + '" maxlength="7" class="mono"></div></div>' +
      '<div class="field"><label class="label" for="tSec">Warna aksen</label><div class="color-in"><input type="color" id="tSec" value="' + esc(t.secondary) + '"><input data-thex="secondary" value="' + esc(t.secondary) + '" maxlength="7" class="mono"></div></div>' +
      '<div class="field"><span class="label">Sudut komponen</span><div class="seg full">' + [['tajam', 'Tajam'], ['standar', 'Standar'], ['bulat', 'Bulat']].map(r => '<button type="button" data-trad="' + r[0] + '" class="' + (t.radius === r[0] ? 'on' : '') + '">' + r[1] + '</button>').join('') + '</div></div></div>' +
      '<div class="theme-prev mt-3"><button type="button" class="btn btn-primary btn-sm">Tombol Utama</button><button type="button" class="btn btn-accent btn-sm">Beli Sekarang</button><span class="badge b-violet">Label</span><span class="chip active">Kategori</span><span class="muted small" id="tContrast"></span></div></section>';
  }
  function temaPreview() {
    const t = ST.draft.tema; Theme.apply(t, { preview: true });
    const p = Theme.css('--primary'), c = $('#tContrast');
    if (c) c.textContent = p.toUpperCase() !== String(t.primary).toUpperCase() ? 'Warna utama digelapkan otomatis ke ' + p + ' agar teks putih tetap terbaca (kontras WCAG ≥ 4.5).' : 'Kontras teks terhadap tombol: ' + Theme.contrast(p, '#FFFFFF').toFixed(1) + ':1 ✓';
  }
  function bindTema(body) {
    const card = body.querySelector('#temaCard'); if (!card) return;
    if (!ST.draft.tema) ST.draft.tema = Object.assign({}, TEMA_DEF);
    const P = ST.data.tema_preset || {};
    const set = (patch, rerender) => { Object.assign(ST.draft.tema, patch); markDirty(); temaPreview(); if (rerender) { card.outerHTML = temaCard(ST.draft, ST.data); refreshIcons(body); bindTema(body); } };
    card.addEventListener('click', e => {
      const p = e.target.closest('[data-tpreset]'); if (p) { const k = p.dataset.tpreset; set(k === 'custom' ? { preset: 'custom' } : { preset: k, primary: P[k][0], secondary: P[k][1] }, true); return; }
      const r = e.target.closest('[data-trad]'); if (r) set({ radius: r.dataset.trad }, true);
    });
    card.addEventListener('input', e => {
      const t = e.target, hex = /^#[0-9a-fA-F]{6}$/;
      if (t.id === 'tPri' || t.id === 'tSec') { const k = t.id === 'tPri' ? 'primary' : 'secondary'; card.querySelector('[data-thex="' + k + '"]').value = t.value.toUpperCase(); set({ preset: 'custom', [k]: t.value.toUpperCase() }); }
      if (t.dataset.thex && hex.test(t.value)) { card.querySelector(t.dataset.thex === 'primary' ? '#tPri' : '#tSec').value = t.value; set({ preset: 'custom', [t.dataset.thex]: t.value.toUpperCase() }); }
      e.stopPropagation();
    });
    temaPreview();
  }

  /* ======================================================== EKSPOR */
  window.AdminApp = { route };
})();
