/**
 * app.js — Logika Utama Aplikasi
 * Collab Match Creator PWA
 *
 * Berisi semua logika bisnis: auth, kolaborasi, lowongan,
 * inbox/chat, dashboard, dan profil pengguna.
 * Dipisahkan dari index.html untuk struktur PWA yang baik.
 */

'use strict';

const db = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k,v) => localStorage.setItem(k, JSON.stringify(v)),
  del: k => localStorage.removeItem(k)
};

const hp = pw => btoa(pw + '_cmk2025');
const vp = (pw,h) => hp(pw) === h;

let CU = null;
let selRole = 'creator';
let pendingJob = null;
let activeChatId = null;
let collabActiveNiche = '';
let jobActiveNiche = '';
let activeStatusFilter = 'all';
let pendingPhotoDataUrl = null; // foto baru yang dipilih tapi belum disimpan

// ===== SEED DATA =====
const COLLABS = [
  { id:'c1', brand:'Aesthetic Coffee Co.', cat:'Kuliner & F&B',
    title:'Open Collab: Coffee Content Creator',
    desc:'Kafe specialty di Solo buka kesempatan kolaborasi barter untuk kreator konten. Datang, foto/video, tag kami. Konsumsi gratis plus exposure!',
    niche:'Food & Culinary', location:'Solo', deadline:30, featured:true },
  { id:'c2', brand:'Studio Foto Lumina', cat:'Kreatif & Fotografi',
    title:'Kreator Lifestyle untuk Konten Studio',
    desc:'Studio foto modern di Semarang cari kreator lifestyle dan fashion untuk sesi foto bersama. Hasilnya dibagi berdua — free sesi!',
    niche:'Fashion', location:'Semarang', deadline:20, featured:true },
  { id:'c3', brand:'Herbalux Wellness', cat:'Health & Wellness',
    title:'Collab Review Produk Herbal Lokal',
    desc:'Brand herbal wellness cari kreator health dan lifestyle di Jawa Tengah untuk konten review organik. Produk dikirim gratis ke rumah!',
    niche:'Health & Fitness', location:'Jawa Tengah', deadline:25, featured:false },
  { id:'c4', brand:'Kelas Digital Muda', cat:'Education & Tech',
    title:'Affiliate Creator Program',
    desc:'Platform kelas online cari kreator konten edukatif untuk jadi affiliate. Komisi 30 persen per enrollment dari konten kamu!',
    niche:'Finance', location:'Seluruh Indonesia', deadline:60, featured:false },
  { id:'c5', brand:'Warung Soto Bu Lastri', cat:'Kuliner Lokal',
    title:'Food Vlogger — Konten Kuliner Autentik',
    desc:'Warung legendaris 30 tahun di Solo cari food vlogger untuk dokumentasi kisah dan menu khas. Makan gratis sepuasnya plus link bio!',
    niche:'Food & Culinary', location:'Solo', deadline:15, featured:false },
  { id:'c6', brand:'Toko Thrift Epoch', cat:'Fashion & Thrift',
    title:'OOTD Collab — Thrift Fashion Creator',
    desc:'Toko thrift keren di Yogyakarta cari kreator fashion dan OOTD. Pilih outfit gratis, buat konten, tag kami. Saling support!',
    niche:'Fashion', location:'Yogyakarta', deadline:21, featured:true },
];

const JOBS = [
  { id:'j1', brand:'Kopi Nusantara', cat:'Kuliner & F&B',
    title:'Review Kopi Arabika Premium',
    desc:'Kami cari kreator food/lifestyle di Solo-Semarang untuk review kopi arabika single origin kami. Format: video TikTok 1-2 menit plus IG Stories.',
    niche:'Food & Culinary', location:'Solo, Semarang', budget:500000, deadline:12, premium:true, applicants:[] },
  { id:'j2', brand:'Glow Lab Beauty', cat:'Beauty & Skincare',
    title:'Collab Skincare Campaign Series',
    desc:'Brand lokal skincare cari micro-influencer beauty dengan engagement rate baik. Min 5K followers. Free produk plus fee kolaborasi.',
    niche:'Beauty & Lifestyle', location:'Jawa Tengah', budget:350000, deadline:8, premium:true, applicants:[] },
  { id:'j3', brand:'Kafe Ruang Tamu', cat:'Kuliner & F&B',
    title:'Liputan Soft Opening Kafe Jogja',
    desc:'Kafe estetik baru di Jogja butuh kreator lifestyle untuk liputan soft opening. Makan gratis plus fee plus konten usage rights.',
    niche:'Food & Culinary', location:'Yogyakarta', budget:200000, deadline:5, premium:true, applicants:[] },
  { id:'j4', brand:'UMKM Batik Laras', cat:'UMKM Lokal',
    title:'Endorse Koleksi Batik Modern 2025',
    desc:'Produsen batik lokal cari fashion kreator yang mau wearing dan review koleksi batik modern kontemporer. Produk gratis plus fee.',
    niche:'Fashion', location:'Solo, Klaten', budget:300000, deadline:14, premium:false, applicants:[] },
];

const NICHES = ['Food & Culinary','Fashion','Beauty & Lifestyle','Health & Fitness','Finance','Tech & Gadget','Travel','Gaming'];

// ===== INIT =====
(function init() {
  if (!db.get('cmk_jobs'))    db.set('cmk_jobs', JOBS);
  if (!db.get('cmk_collabs')) db.set('cmk_collabs', COLLABS);
  const sess = db.get('cmk_session') || db.get('cmk_remember');
  if (sess) {
    const users = db.get('cmk_users') || [];
    const u = users.find(u => u.email === sess.email);
    if (u) { CU = u; enterApp(); }
  }
})();

// ===== AUTH =====
function showReg() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('regPage').style.display = 'flex';
  document.getElementById('regSuccessPage').classList.remove('show');
}
function showLogin() {
  document.getElementById('regPage').style.display = 'none';
  document.getElementById('regSuccessPage').classList.remove('show');
  document.getElementById('loginPage').style.display = 'flex';
}
function goToLoginAfterReg() {
  document.getElementById('regSuccessPage').classList.remove('show');
  document.getElementById('loginPage').style.display = 'flex';
}
function pickRole(r) {
  selRole = r;
  document.getElementById('roleCreatorOpt').classList.toggle('selected', r === 'creator');
  document.getElementById('roleBrandOpt').classList.toggle('selected', r === 'brand');
}

function doRegister() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pw    = document.getElementById('regPw').value;
  if (!name)  return toast('Nama wajib diisi');
  if (!email || !/\S+@\S+\.\S+/.test(email)) return toast('Email tidak valid');
  if (pw.length < 6) return toast('Password minimal 6 karakter');
  const users = db.get('cmk_users') || [];
  if (users.find(u => u.email === email)) return toast('Email sudah terdaftar');
  const newUser = {
    id:'u'+Date.now(), name, email, password:hp(pw), role:selRole,
    bio:'', city:'', niche:'', ig:'', tt:'', followers:0,
    brandName:'', brandCat:'', brandCity:'', brandIG:'', brandTT:'', brandWeb:'',
    hasPremium:false, createdAt:new Date().toLocaleDateString('id-ID'),
    photo: null,
    nameChangeLog: []  // [{changedAt: ISO string}]
  };
  users.push(newUser);
  db.set('cmk_users', users);
  document.getElementById('regPage').style.display = 'none';
  document.getElementById('successEmail').textContent = email;
  document.getElementById('regSuccessPage').classList.add('show');
}

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw    = document.getElementById('loginPw').value;
  const rem   = document.getElementById('rememberMe').checked;
  if (!email || !pw) return toast('Lengkapi email dan password');
  const users = db.get('cmk_users') || [];
  const u = users.find(u => u.email === email);
  if (!u || !vp(pw, u.password)) return toast('Email atau password salah');
  // Pastikan field baru ada untuk user lama
  if (!u.nameChangeLog) u.nameChangeLog = [];
  if (u.photo === undefined) u.photo = null;
  CU = u;
  if (rem) db.set('cmk_remember', { email });
  db.set('cmk_session', { email });
  toast('Selamat datang, ' + u.name);
  enterApp();
}

function doLogout() {
  db.del('cmk_session');
  db.del('cmk_remember');
  CU = null;
  document.getElementById('appWrapper').classList.remove('active');
  document.getElementById('authArea').style.display = 'block';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('regPage').style.display = 'none';
  document.getElementById('regSuccessPage').classList.remove('show');
  toast('Berhasil keluar');
}

// ===== ENTER APP =====
function enterApp() {
  document.getElementById('authArea').style.display = 'none';
  document.getElementById('appWrapper').classList.add('active');
  setupRole();
  buildNicheChips();
  buildCollabs();
  buildJobs();
  buildInbox();
  buildDash();
  updateProfileUI();
}

function setupRole() {
  const isBrand = CU.role === 'brand';
  const ini = CU.name.charAt(0).toUpperCase();
  updateNavAvatar();
  document.getElementById('profileAv').textContent = ini;
  document.getElementById('creatorDash').style.display = isBrand ? 'none' : 'block';
  document.getElementById('brandDash').style.display   = isBrand ? 'block' : 'none';
  document.getElementById('creatorInfo').style.display = isBrand ? 'none' : 'block';
  document.getElementById('brandInfo').style.display   = isBrand ? 'block' : 'none';
  const brand = document.getElementById('topNavBrand');
  if (isBrand) {
    brand.innerHTML = 'Collab Match <span>Brand</span>';
  } else {
    brand.innerHTML = 'Collab Match <span>Creator</span>';
  }
}

// Update avatar di nav bar (foto atau inisial)
function updateNavAvatar() {
  const navAv = document.getElementById('navAv');
  if (CU.photo) {
    navAv.innerHTML = `<img src="${CU.photo}" alt="foto">`;
  } else {
    navAv.textContent = CU.name.charAt(0).toUpperCase();
  }
}

// ===== TABS =====
const TABS = ['collab','job','inbox','dash','profile'];
function showTab(t) {
  TABS.forEach(x => {
    const s = document.getElementById('sec' + cap(x));
    const b = document.getElementById('tab' + cap(x));
    if (s) s.classList.remove('active');
    if (b) b.classList.remove('active');
  });
  const s = document.getElementById('sec' + cap(t));
  const b = document.getElementById('tab' + cap(t));
  if (s) s.classList.add('active');
  if (b) b.classList.add('active');
  if (t === 'collab')  buildCollabs();
  if (t === 'job')     buildJobs();
  if (t === 'inbox')   buildInbox();
  if (t === 'dash')    buildDash();
  if (t === 'profile') updateProfileUI();
  if (t === 'inbox')   document.getElementById('inboxDot').style.display = 'none';
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ===== NICHE CHIPS =====
function buildNicheChips() {
  const collabWrap = document.getElementById('collabNicheChips');
  const jobWrap    = document.getElementById('jobNicheChips');
  const locChips   = ['Solo','Semarang','Yogyakarta','Jawa Tengah','Seluruh Indonesia'];

  let collabHtml = '<div class="filter-chip active" onclick="setCollabNiche(\'\', this)">Semua</div>';
  NICHES.forEach(n => { collabHtml += `<div class="filter-chip" onclick="setCollabNiche('${n}', this)">${n}</div>`; });
  locChips.forEach(l => { collabHtml += `<div class="filter-chip" onclick="setCollabLocation('${l}', this)">${l}</div>`; });
  collabWrap.innerHTML = collabHtml;

  let jobHtml = '<div class="filter-chip active" onclick="setJobNiche(\'\', this)">Semua</div>';
  NICHES.forEach(n => { jobHtml += `<div class="filter-chip" onclick="setJobNiche('${n}', this)">${n}</div>`; });
  locChips.forEach(l => { jobHtml += `<div class="filter-chip" onclick="setJobLocation('${l}', this)">${l}</div>`; });
  jobWrap.innerHTML = jobHtml;
}

function setCollabNiche(niche, el) {
  collabActiveNiche = niche;
  document.getElementById('collabSearchInput').value = '';
  document.querySelectorAll('#collabNicheChips .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  buildCollabs();
}
function setCollabLocation(loc, el) {
  document.getElementById('collabSearchInput').value = loc;
  collabActiveNiche = '';
  document.querySelectorAll('#collabNicheChips .filter-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('#collabNicheChips .filter-chip').classList.add('active');
  el.classList.add('active');
  buildCollabs();
}
function setJobNiche(niche, el) {
  jobActiveNiche = niche;
  document.getElementById('jobSearchInput').value = '';
  document.querySelectorAll('#jobNicheChips .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  buildJobs();
}
function setJobLocation(loc, el) {
  document.getElementById('jobSearchInput').value = loc;
  jobActiveNiche = '';
  document.querySelectorAll('#jobNicheChips .filter-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('#jobNicheChips .filter-chip').classList.add('active');
  el.classList.add('active');
  buildJobs();
}

function onCollabSearch() { buildCollabs(); }
function onJobSearch()    { buildJobs(); }

// ===== COLLABS =====
function buildCollabs() {
  const collabs = db.get('cmk_collabs') || COLLABS;
  const applied = (db.get('cmk_capps_' + CU?.id) || []).map(a => a.collabId);
  const query   = (document.getElementById('collabSearchInput')?.value || '').toLowerCase().trim();

  let filtered = collabs.filter(c => {
    const matchNiche = !collabActiveNiche || c.niche === collabActiveNiche;
    const matchQuery = !query ||
      c.brand.toLowerCase().includes(query) ||
      c.title.toLowerCase().includes(query) ||
      c.niche.toLowerCase().includes(query) ||
      c.location.toLowerCase().includes(query) ||
      c.cat.toLowerCase().includes(query) ||
      c.desc.toLowerCase().includes(query);
    return matchNiche && matchQuery;
  });

  const lbl = document.getElementById('collabResultLabel');
  if (query || collabActiveNiche) {
    lbl.style.display = 'block';
    lbl.textContent = filtered.length + ' hasil ditemukan' + (query ? ' untuk "' + query + '"' : '') + (collabActiveNiche ? ' · ' + collabActiveNiche : '');
  } else {
    lbl.style.display = 'none';
  }

  let html = '';
  filtered.forEach(c => {
    const done = applied.includes(c.id);
    html += `<div class="listing-card ${c.featured ? 'featured' : ''}">
      <div class="card-top">
        <div class="brand-info">
          <div class="brand-initial">${c.brand.charAt(0)}</div>
          <div><div class="brand-name">${c.brand}</div><div class="brand-cat">${c.cat}</div></div>
        </div>
        ${c.featured ? '<div class="featured-label">Pilihan</div>' : ''}
      </div>
      <div class="card-title">${c.title}</div>
      <div class="card-desc">${c.desc}</div>
      <div class="card-tags">
        <span class="tag primary">${c.niche}</span>
        <span class="tag">${c.location}</span>
        <span class="tag">Open Collab</span>
      </div>
      <div class="card-footer">
        <div class="card-meta">Terbuka ${c.deadline} hari lagi</div>
        <button class="btn-apply ${done ? 'applied' : ''}" ${done ? 'disabled' : ''} onclick="applyCollab('${c.id}')">
          ${done ? 'Sudah Diajukan' : 'Ajukan Sekarang'}
        </button>
      </div>
    </div>`;
  });
  document.getElementById('collabList').innerHTML = html || emptyState(
    query || collabActiveNiche ? 'Tidak ada hasil' : 'Belum ada open collab',
    query || collabActiveNiche ? 'Coba kata kunci atau filter lain' : 'Cek kembali nanti'
  );
}

function applyCollab(id) {
  if (!CU) return;
  const collabs = db.get('cmk_collabs') || COLLABS;
  const c = collabs.find(x => x.id === id);
  if (!c) return;
  const apps = db.get('cmk_capps_' + CU.id) || [];
  if (apps.find(a => a.collabId === id)) return;
  apps.push({ collabId:id, brand:c.brand, title:c.title, status:'review', appliedAt:new Date().toISOString() });
  db.set('cmk_capps_' + CU.id, apps);
  addThread(CU.id, 'brand_' + id, c.brand, c.brand.charAt(0),
    'Halo! Kami menerima pengajuan kolaborasimu. Terima kasih sudah tertarik bergabung bersama ' + c.brand + '!', c.title);
  toast('Profil terkirim ke ' + c.brand);
  buildCollabs();
  updateInboxDot();
}

// ===== JOBS =====
function buildJobs() {
  const jobs  = db.get('cmk_jobs') || JOBS;
  const applied = (db.get('cmk_japps_' + CU?.id) || []).map(a => a.jobId);
  const query   = (document.getElementById('jobSearchInput')?.value || '').toLowerCase().trim();

  let filtered = jobs.filter(j => {
    const matchNiche = !jobActiveNiche || j.niche === jobActiveNiche;
    const matchQuery = !query ||
      j.brand.toLowerCase().includes(query) ||
      j.title.toLowerCase().includes(query) ||
      j.niche.toLowerCase().includes(query) ||
      j.location.toLowerCase().includes(query) ||
      j.cat.toLowerCase().includes(query) ||
      j.desc.toLowerCase().includes(query);
    return matchNiche && matchQuery;
  });

  const lbl = document.getElementById('jobResultLabel');
  if (query || jobActiveNiche) {
    lbl.style.display = 'block';
    lbl.textContent = filtered.length + ' hasil ditemukan' + (query ? ' untuk "' + query + '"' : '') + (jobActiveNiche ? ' · ' + jobActiveNiche : '');
  } else {
    lbl.style.display = 'none';
  }

  let html = '';
  filtered.forEach(j => {
    const done = applied.includes(j.id);
    html += `<div class="listing-card ${j.premium ? 'featured' : ''}">
      <div class="card-top">
        <div class="brand-info">
          <div class="brand-initial">${j.brand.charAt(0)}</div>
          <div><div class="brand-name">${j.brand}</div><div class="brand-cat">${j.cat}</div></div>
        </div>
        ${j.premium ? '<div class="featured-label">Premium</div>' : ''}
      </div>
      <div class="card-title">${j.title}</div>
      <div class="card-desc">${j.desc}</div>
      <div class="card-tags">
        <span class="tag primary">${j.niche}</span>
        <span class="tag">${j.location}</span>
        <span class="tag">Micro-KOL</span>
      </div>
      <div class="card-footer">
        <div>
          <div class="budget-label">Rp ${fmt(j.budget)}</div>
          <div class="budget-sub">budget collab · sisa ${j.deadline} hari</div>
        </div>
        <button class="btn-apply ${done ? 'applied' : ''}" ${done ? 'disabled' : ''} onclick="applyJob('${j.id}')">
          ${done ? 'Dilamar' : 'Apply Sekarang'}
        </button>
      </div>
    </div>`;
  });
  document.getElementById('jobList').innerHTML = html || emptyState(
    query || jobActiveNiche ? 'Tidak ada hasil' : 'Belum ada lowongan',
    query || jobActiveNiche ? 'Coba kata kunci atau filter lain' : 'Cek kembali nanti'
  );
}

function applyJob(id) {
  const jobs = db.get('cmk_jobs') || JOBS;
  const j = jobs.find(x => x.id === id);
  if (!j) return;
  const apps = db.get('cmk_japps_' + CU.id) || [];
  if (apps.find(a => a.jobId === id)) return;
  apps.push({ jobId:id, jobTitle:j.title, brand:j.brand, status:'review', appliedAt:new Date().toISOString() });
  db.set('cmk_japps_' + CU.id, apps);
  if (!j.applicants) j.applicants = [];
  j.applicants.push({ userId:CU.id, name:CU.name, city:CU.city||'-', niche:CU.niche||'-', followers:CU.followers||0, ig:CU.ig||'-', status:'review', appliedAt:new Date().toISOString() });
  db.set('cmk_jobs', jobs);
  addThread(CU.id, 'job_' + id, j.brand, j.brand.charAt(0),
    'Terima kasih sudah melamar! Tim kami akan meninjau profil kamu dalam 1-3 hari kerja. Nantikan kabar kami ya!', j.title);
  toast('Lamaran terkirim ke ' + j.brand);
  buildJobs();
  updateInboxDot();
}

// ===== INBOX =====
function getThreads() { return db.get('cmk_threads_' + CU.id) || []; }
function saveThreads(t) { db.set('cmk_threads_' + CU.id, t); }

function addThread(userId, threadId, peerName, peerInitial, firstMsg, context) {
  const threads = db.get('cmk_threads_' + userId) || [];
  const existing = threads.find(t => t.threadId === threadId);
  const now = new Date().toISOString();
  if (existing) {
    existing.messages.push({ from:'them', text:firstMsg, time:now });
    existing.lastMsg = firstMsg; existing.time = now; existing.unread = true;
  } else {
    threads.unshift({ threadId, peerName, peerInitial: peerInitial || peerName.charAt(0),
      lastMsg:firstMsg, time:now, unread:true, context,
      messages:[{ from:'them', text:firstMsg, time:now }] });
  }
  db.set('cmk_threads_' + userId, threads);
}

function buildInbox() {
  const threads = getThreads();
  const unread  = threads.filter(t => t.unread).length;
  document.getElementById('inboxCount').textContent = threads.length;
  document.getElementById('inboxDot').style.display = unread > 0 ? 'block' : 'none';
  if (threads.length === 0) {
    document.getElementById('inboxList').innerHTML = `
      <div class="empty-inbox">
        <div class="empty-inbox-title">Belum ada pesan</div>
        <div class="empty-inbox-sub">Setelah kamu apply atau menghubungi kreator, percakapan akan muncul di sini</div>
      </div>`;
    return;
  }
  let html = '';
  threads.forEach(t => {
    html += `<div class="thread-item ${t.unread ? 'unread' : ''}" onclick="openChat('${t.threadId}')">
      <div class="thread-avatar">${t.peerInitial || t.peerName.charAt(0)}</div>
      <div class="thread-body">
        <div class="thread-name">
          <span>${t.peerName}</span>
          <span class="thread-time">${fmtTime(t.time)}</span>
        </div>
        <div class="thread-preview ${t.unread ? 'unread' : ''}">${t.lastMsg}</div>
        ${t.context ? `<div class="thread-context">${t.context}</div>` : ''}
      </div>
      ${t.unread ? '<div class="unread-badge"></div>' : ''}
    </div>`;
  });
  document.getElementById('inboxList').innerHTML = html;
}

function openChat(threadId) {
  const threads = getThreads();
  const t = threads.find(x => x.threadId === threadId);
  if (!t) return;
  t.unread = false;
  saveThreads(threads);
  activeChatId = threadId;
  document.getElementById('chatPeerName').textContent = t.peerName;
  document.getElementById('chatPeerContext').textContent = t.context || '';
  renderMessages(t.messages);
  document.getElementById('chatView').classList.add('show');
  updateInboxDot();
}

function renderMessages(msgs) {
  const cont = document.getElementById('chatMessages');
  cont.innerHTML = msgs.map(m => `
    <div class="msg-bubble ${m.from}">
      <div class="msg-content">${m.text}</div>
      <div class="msg-time">${fmtTime(m.time)}</div>
    </div>`).join('');
  cont.scrollTop = cont.scrollHeight;
}

function sendMsg() {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  const threads = getThreads();
  const t = threads.find(x => x.threadId === activeChatId);
  if (!t) return;
  const now = new Date().toISOString();
  t.messages.push({ from:'me', text, time:now });
  t.lastMsg = text; t.time = now;
  saveThreads(threads);
  renderMessages(t.messages);
  setTimeout(() => {
    const replies = [
      'Siap! Kami akan follow up dalam waktu dekat.',
      'Terima kasih infonya. Bisa kirim portfolio kamu?',
      'Baik, kami catat ya. Ada pertanyaan lain?',
      'Oke noted! Tim kami akan menghubungimu segera.',
      'Terima kasih sudah tertarik. Kami konfirmasi dalam 1-2 hari.'
    ];
    const reply = replies[Math.floor(Math.random() * replies.length)];
    const threads2 = getThreads();
    const t2 = threads2.find(x => x.threadId === activeChatId);
    if (!t2) return;
    const ts = new Date().toISOString();
    t2.messages.push({ from:'them', text:reply, time:ts });
    t2.lastMsg = reply; t2.time = ts;
    db.set('cmk_threads_' + CU.id, threads2);
    renderMessages(t2.messages);
  }, 900 + Math.random() * 1200);
}

function closeChat() {
  document.getElementById('chatView').classList.remove('show');
  activeChatId = null;
  buildInbox();
}
function onChatKey(e) { if (e.key === 'Enter') sendMsg(); }

function updateInboxDot() {
  const unread = getThreads().filter(t => t.unread).length;
  document.getElementById('inboxDot').style.display = unread > 0 ? 'block' : 'none';
}

function contactKreator(name) {
  const threadId = 'brand_out_' + name.replace(/\s+/g,'_') + '_' + Date.now();
  addThread(CU.id, threadId, name, name.charAt(0),
    'Halo ' + name + ', kami dari ' + CU.name + '. Kami tertarik untuk berkolaborasi denganmu!', 'Inisiasi Brand');
  const threads = getThreads();
  const t = threads.find(x => x.threadId === threadId);
  t.unread = false;
  saveThreads(threads);
  activeChatId = threadId;
  document.getElementById('chatPeerName').textContent = name;
  document.getElementById('chatPeerContext').textContent = 'Inisiasi Brand';
  renderMessages(t.messages);
  document.getElementById('chatView').classList.add('show');
}

// ===== DASHBOARD =====
function buildDash() {
  if (!CU) return;
  if (CU.role === 'creator') {
    const jApps = db.get('cmk_japps_' + CU.id) || [];
    const cApps = db.get('cmk_capps_' + CU.id) || [];
    const all = [
      ...jApps.map(a => ({ title:a.jobTitle, brand:a.brand, status:a.status||'review', type:'Lowongan Berbayar', appliedAt:a.appliedAt })),
      ...cApps.map(a => ({ title:a.title, brand:a.brand, status:a.status||'review', type:'Open Collab', appliedAt:a.appliedAt }))
    ];
    const cntReview    = all.filter(a => a.status === 'review').length;
    const cntAccepted  = all.filter(a => a.status === 'accepted').length;
    const cntContacted = all.filter(a => a.status === 'contacted').length;
    const cntRejected  = all.filter(a => a.status === 'rejected').length;
    document.getElementById('stTotal').textContent    = all.length;
    document.getElementById('stReview').textContent   = cntReview;
    document.getElementById('stAccepted').textContent = cntAccepted;
    document.getElementById('stContacted').textContent= cntContacted;
    const chips = document.querySelectorAll('#statusFilterRow .status-chip');
    const labels = ['Semua (' + all.length + ')', 'Ditinjau (' + cntReview + ')', 'Diterima (' + cntAccepted + ')', 'Dihubungi (' + cntContacted + ')', 'Tidak Lanjut (' + cntRejected + ')'];
    chips.forEach((chip, i) => { chip.textContent = labels[i]; });
    renderStatusList(all);
  } else {
    const jobs    = db.get('cmk_jobs') || JOBS;
    const myJobs  = jobs.filter(j => j.brandUserId === CU.id);
    const allApps = myJobs.flatMap(j => (j.applicants||[]).map(a => ({...a, jobTitle:j.title})));
    document.getElementById('stIklan').textContent   = CU.hasPremium ? (myJobs.length || '1') : '0';
    document.getElementById('stPelamar').textContent = allApps.length;
    if (allApps.length === 0) {
      document.getElementById('applicantList').innerHTML = emptyState('Belum ada pelamar','Pasang iklan untuk mulai menerima lamaran');
    } else {
      document.getElementById('applicantList').innerHTML = allApps.slice(0,10).map(a => `
        <div class="applicant-row">
          <div class="applicant-av">${a.name.charAt(0)}</div>
          <div>
            <div class="applicant-name">${a.name}</div>
            <div class="applicant-meta">${a.city} &middot; ${a.niche} &middot; ${Number(a.followers).toLocaleString('id')} followers</div>
            <div class="applicant-meta" style="color:var(--blue-600)">${a.jobTitle}</div>
          </div>
          <button class="btn-contact" onclick="contactKreator('${a.name}')">Hubungi</button>
        </div>`).join('');
    }
  }
}

function renderStatusList(all) {
  const filtered = activeStatusFilter === 'all'
    ? all
    : all.filter(a => a.status === activeStatusFilter);
  const statusMap = {
    review:    { label: 'Ditinjau',     cls: 'status-review' },
    accepted:  { label: 'Diterima',     cls: 'status-accepted' },
    contacted: { label: 'Dihubungi',    cls: 'status-contacted' },
    rejected:  { label: 'Tidak Lanjut', cls: 'status-rejected' }
  };
  if (filtered.length === 0) {
    document.getElementById('statusList').innerHTML = emptyState(
      activeStatusFilter === 'all' ? 'Belum ada pengajuan' : 'Tidak ada pengajuan dengan status ini',
      activeStatusFilter === 'all' ? 'Apply ke open collab atau lowongan untuk mulai melacak statusmu' : 'Coba pilih filter lain'
    );
    return;
  }
  document.getElementById('statusList').innerHTML = filtered.map(a => {
    const s = statusMap[a.status] || statusMap.review;
    return `<div class="application-row">
      <div class="app-icon">${a.brand.charAt(0)}</div>
      <div class="app-info">
        <div class="app-title">${a.title}</div>
        <div class="app-brand">${a.brand} &middot; ${a.type} &middot; ${fmtTime(a.appliedAt)}</div>
      </div>
      <span class="status-pill ${s.cls}">${s.label}</span>
    </div>`;
  }).join('');
}

function filterStatus(status, el) {
  activeStatusFilter = status;
  document.querySelectorAll('#statusFilterRow .status-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  if (!CU || CU.role !== 'creator') return;
  const jApps = db.get('cmk_japps_' + CU.id) || [];
  const cApps = db.get('cmk_capps_' + CU.id) || [];
  const all = [
    ...jApps.map(a => ({ title:a.jobTitle, brand:a.brand, status:a.status||'review', type:'Lowongan Berbayar', appliedAt:a.appliedAt })),
    ...cApps.map(a => ({ title:a.title,    brand:a.brand, status:a.status||'review', type:'Open Collab',       appliedAt:a.appliedAt }))
  ];
  renderStatusList(all);
}

// ===== PROFILE =====
function updateProfileUI() {
  if (!CU) return;
  document.getElementById('profileName').textContent = CU.name;
  document.getElementById('profileRole').textContent = CU.role === 'brand' ? 'Brand / Bisnis' : 'Konten Kreator';
  document.getElementById('pEmail').textContent  = CU.email;
  document.getElementById('pSince').textContent  = CU.createdAt || '-';
  document.getElementById('pCity').textContent      = CU.city      || 'Belum diisi';
  document.getElementById('pNiche').textContent     = CU.niche     || 'Belum diisi';
  document.getElementById('pFollowers').textContent = CU.followers ? Number(CU.followers).toLocaleString('id') : '0';
  document.getElementById('pIG').textContent        = CU.ig        || '-';
  document.getElementById('pTT').textContent        = CU.tt        || '-';
  document.getElementById('pBrandName').textContent   = CU.brandName || CU.name;
  document.getElementById('pBrandCat').textContent    = CU.brandCat  || '-';
  document.getElementById('pBrandCity').textContent   = CU.brandCity || '-';
  document.getElementById('pBrandIG').textContent     = CU.brandIG   || '-';
  document.getElementById('pBrandTT').textContent     = CU.brandTT   || '-';
  document.getElementById('pBrandWeb').textContent    = CU.brandWeb  || '-';
  document.getElementById('pBrandStatus').textContent = CU.hasPremium ? 'Iklan Aktif (Premium)' : 'Belum ada iklan aktif';

  // Update foto profil di halaman profil
  const avEl = document.getElementById('profileAv');
  if (CU.photo) {
    avEl.innerHTML = `<img src="${CU.photo}" alt="foto profil">`;
  } else {
    avEl.innerHTML = CU.name.charAt(0).toUpperCase();
  }
  updateNavAvatar();
}

function openEdit() {
  document.getElementById('editBio').value       = CU.bio       || '';
  document.getElementById('editNiche').value     = CU.niche     || '';
  document.getElementById('editCity').value      = CU.city      || '';
  document.getElementById('editIG').value        = CU.ig        || '';
  document.getElementById('editTT').value        = CU.tt        || '';
  document.getElementById('editFollowers').value = CU.followers || '';
  document.getElementById('editOverlay').classList.add('show');
}
function closeEdit() { document.getElementById('editOverlay').classList.remove('show'); }
function saveProfile() {
  CU.bio       = document.getElementById('editBio').value;
  CU.niche     = document.getElementById('editNiche').value;
  CU.city      = document.getElementById('editCity').value;
  CU.ig        = document.getElementById('editIG').value;
  CU.tt        = document.getElementById('editTT').value;
  CU.followers = parseInt(document.getElementById('editFollowers').value) || 0;
  persistUser();
  closeEdit();
  toast('Profil berhasil disimpan');
  updateProfileUI();
}

function openEditBrand() {
  document.getElementById('editBrandName').value = CU.brandName || CU.name;
  document.getElementById('editBrandCat').value  = CU.brandCat  || '';
  document.getElementById('editBrandCity').value = CU.brandCity || '';
  document.getElementById('editBrandIG').value   = CU.brandIG   || '';
  document.getElementById('editBrandTT').value   = CU.brandTT   || '';
  document.getElementById('editBrandWeb').value  = CU.brandWeb  || '';
  document.getElementById('editBrandOverlay').classList.add('show');
}
function closeEditBrand() { document.getElementById('editBrandOverlay').classList.remove('show'); }
function saveBrandProfile() {
  CU.brandName = document.getElementById('editBrandName').value;
  CU.brandCat  = document.getElementById('editBrandCat').value;
  CU.brandCity = document.getElementById('editBrandCity').value;
  CU.brandIG   = document.getElementById('editBrandIG').value;
  CU.brandTT   = document.getElementById('editBrandTT').value;
  CU.brandWeb  = document.getElementById('editBrandWeb').value;
  persistUser();
  closeEditBrand();
  toast('Profil brand berhasil disimpan');
  updateProfileUI();
}

function persistUser() {
  const users = db.get('cmk_users') || [];
  const idx = users.findIndex(u => u.id === CU.id);
  if (idx !== -1) { users[idx] = CU; db.set('cmk_users', users); }
}

// ===== EDIT FOTO PROFIL (BARU) =====
function openEditPhoto() {
  pendingPhotoDataUrl = null;
  const circle = document.getElementById('photoPreviewCircle');
  if (CU.photo) {
    circle.innerHTML = `<img src="${CU.photo}" alt="foto">`;
  } else {
    circle.innerHTML = CU.name.charAt(0).toUpperCase();
  }
  const btnSave = document.getElementById('btnSavePhoto');
  btnSave.disabled = true;
  btnSave.style.opacity = '0.5';
  document.getElementById('btnRemovePhoto').style.display = CU.photo ? 'block' : 'none';
  document.getElementById('editPhotoOverlay').classList.add('show');
}

function closeEditPhoto() {
  document.getElementById('editPhotoOverlay').classList.remove('show');
  pendingPhotoDataUrl = null;
  // Reset file input agar bisa pilih file yang sama lagi
  document.getElementById('photoFileInput').value = '';
}

function onPhotoSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('Ukuran file maks. 5 MB');
    document.getElementById('photoFileInput').value = '';
    return;
  }
  if (!file.type.startsWith('image/')) {
    toast('Format file harus gambar (JPG/PNG)');
    document.getElementById('photoFileInput').value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    pendingPhotoDataUrl = e.target.result;
    const circle = document.getElementById('photoPreviewCircle');
    circle.innerHTML = `<img src="${pendingPhotoDataUrl}" alt="preview">`;
    const btnSave = document.getElementById('btnSavePhoto');
    btnSave.disabled = false;
    btnSave.style.opacity = '1';
  };
  reader.readAsDataURL(file);
}

function savePhoto() {
  if (!pendingPhotoDataUrl) return;
  CU.photo = pendingPhotoDataUrl;
  persistUser();
  closeEditPhoto();
  toast('Foto profil berhasil diperbarui');
  updateProfileUI();
}

function removePhoto() {
  CU.photo = null;
  persistUser();
  closeEditPhoto();
  toast('Foto profil dihapus');
  updateProfileUI();
}

// ===== EDIT NAMA AKUN (BARU) =====
// Batas: 2x per 60 hari
const NAME_LIMIT = 2;
const NAME_PERIOD_DAYS = 60;

function getNameChangesInPeriod() {
  if (!CU.nameChangeLog) CU.nameChangeLog = [];
  const now = Date.now();
  const periodMs = NAME_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  return CU.nameChangeLog.filter(entry => {
    return (now - new Date(entry.changedAt).getTime()) < periodMs;
  });
}

function openEditName() {
  if (!CU.nameChangeLog) CU.nameChangeLog = [];
  const recentChanges = getNameChangesInPeriod();
  const used = recentChanges.length;
  const remaining = NAME_LIMIT - used;

  const infoEl = document.getElementById('nameEditInfo');
  const btnSave = document.getElementById('btnSaveName');
  const input   = document.getElementById('editNameInput');

  input.value = CU.name;

  if (remaining <= 0) {
    // Hitung kapan slot pertama tersedia lagi
    const oldest = recentChanges.sort((a,b) => new Date(a.changedAt) - new Date(b.changedAt))[0];
    const unlockDate = new Date(new Date(oldest.changedAt).getTime() + NAME_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const unlockStr  = unlockDate.toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'});
    infoEl.innerHTML = `
      Nama akun hanya bisa diubah <strong>${NAME_LIMIT}x setiap ${NAME_PERIOD_DAYS} hari</strong>.<br>
      Kamu sudah menggunakan semua jatah perubahan nama.<br>
      <span class="name-limit-badge full">Tersedia lagi: ${unlockStr}</span>
    `;
    input.disabled = true;
    btnSave.disabled = true;
    btnSave.style.opacity = '0.5';
  } else {
    infoEl.innerHTML = `
      Nama akun hanya bisa diubah <strong>${NAME_LIMIT}x setiap ${NAME_PERIOD_DAYS} hari</strong>.<br>
      <span class="name-limit-badge ${remaining === 1 ? 'warn' : ''}">Sisa kesempatan: ${remaining}x</span>
    `;
    input.disabled = false;
    btnSave.disabled = false;
    btnSave.style.opacity = '1';
  }

  document.getElementById('editNameOverlay').classList.add('show');
}

function closeEditName() {
  document.getElementById('editNameOverlay').classList.remove('show');
}

function saveName() {
  const newName = document.getElementById('editNameInput').value.trim();
  if (!newName) return toast('Nama tidak boleh kosong');
  if (newName === CU.name) { closeEditName(); return; }
  if (newName.length < 2)  return toast('Nama minimal 2 karakter');

  const recentChanges = getNameChangesInPeriod();
  if (recentChanges.length >= NAME_LIMIT) {
    return toast('Jatah ubah nama sudah habis untuk periode ini');
  }

  if (!CU.nameChangeLog) CU.nameChangeLog = [];
  CU.nameChangeLog.push({ changedAt: new Date().toISOString(), from: CU.name, to: newName });
  CU.name = newName;
  persistUser();
  closeEditName();
  toast('Nama akun berhasil diperbarui');
  updateProfileUI();
  setupRole(); // update inisial avatar di nav
}

// ===== POST JOB =====
function openPostJob()  { document.getElementById('postJobOverlay').classList.add('show'); }
function closePostJob() { document.getElementById('postJobOverlay').classList.remove('show'); }

function submitPost() {
  const title    = document.getElementById('jobTitle').value.trim();
  const desc     = document.getElementById('jobDesc').value.trim();
  const niche    = document.getElementById('jobNiche').value;
  const location = document.getElementById('jobLocation').value.trim();
  const budget   = parseInt(document.getElementById('jobBudget').value);
  const cat      = document.getElementById('jobCategory').value;
  if (!title || !desc || !location || !budget) return toast('Lengkapi semua field');
  pendingJob = { title, desc, niche, location, budget, cat };
  closePostJob();
  document.getElementById('payOverlay').classList.add('show');
}

// ===== PAYMENT =====
function selPay(el, method) {
  document.querySelectorAll('.pay-opt').forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
  const info = {
    transfer: '<p>Transfer ke BCA atas nama <strong>PT Collab Match Creator</strong></p><div class="bank-num">1234 5678 90</div><div class="bank-note">Nominal tepat Rp 99.000 — konfirmasi otomatis 1x24 jam</div>',
    qris:     '<p>Scan QRIS berikut:</p><div class="bank-num" style="font-size:14px">QRIS tersedia di aplikasi mobile</div><div class="bank-note">Berlaku 15 menit</div>',
    dana:     '<p>Transfer ke DANA</p><div class="bank-num">0812-3456-7890</div><div class="bank-note">a/n Collab Match Creator</div>',
    gopay:    '<p>Transfer ke GoPay</p><div class="bank-num">0812-3456-7890</div><div class="bank-note">a/n Collab Match Creator</div>',
  };
  document.getElementById('bankBox').innerHTML = info[method] || info.transfer;
}

function confirmPay() {
  CU.hasPremium = true;
  if (pendingJob) {
    const jobs = db.get('cmk_jobs') || [];
    jobs.push({
      id:'j'+Date.now(), brand: CU.brandName || CU.name, cat:pendingJob.cat,
      title:pendingJob.title, desc:pendingJob.desc, niche:pendingJob.niche,
      location:pendingJob.location, budget:pendingJob.budget,
      deadline:14, premium:true, brandUserId:CU.id, applicants:[],
      postedAt:new Date().toISOString()
    });
    db.set('cmk_jobs', jobs);
    pendingJob = null;
  }
  persistUser();
  closePayOverlay();
  toast('Pembayaran dikonfirmasi. Iklan aktif 14 hari!');
  setTimeout(() => buildDash(), 300);
}
function closePayOverlay() { document.getElementById('payOverlay').classList.remove('show'); pendingJob = null; }

// ===== HELPERS =====
function fmt(n) {
  if (n >= 1000000) return (n/1000000).toFixed(0) + ' jt';
  if (n >= 1000)    return (n/1000).toFixed(0) + ' rb';
  return n;
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = (now - d) / 1000;
  if (diff < 60)    return 'Baru saja';
  if (diff < 3600)  return Math.floor(diff/60) + ' mnt';
  if (diff < 86400) return Math.floor(diff/3600) + ' jam';
  return d.toLocaleDateString('id-ID', {day:'numeric',month:'short'});
}
function emptyState(title, sub) {
  return `<div class="empty-state"><div class="empty-title">${title}</div><div class="empty-sub">${sub}</div></div>`;
}
function toast(msg) {
  const wrap = document.getElementById('toastWrap');
  const el   = document.createElement('div');
  el.className = 'toast-item';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// Close overlays on outside click
['payOverlay','editOverlay','editBrandOverlay','postJobOverlay','editPhotoOverlay','editNameOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) {
      if      (id === 'payOverlay')        closePayOverlay();
      else if (id === 'editOverlay')       closeEdit();
      else if (id === 'editBrandOverlay')  closeEditBrand();
      else if (id === 'editPhotoOverlay')  closeEditPhoto();
      else if (id === 'editNameOverlay')   closeEditName();
      else    closePostJob();
    }
  });
});

// ===== PWA INIT (dipanggil setelah DOM siap) =====
document.addEventListener('DOMContentLoaded', () => {
  // Inisialisasi fitur PWA dari settings.js
  if (typeof initPWA === 'function') initPWA();

  // Render panel pengaturan di profil jika elemen tersedia
  if (typeof SettingsUI !== 'undefined') {
    const observer = new MutationObserver(() => {
      const container = document.getElementById('settingsContainer');
      if (container && !container.dataset.rendered) {
        container.dataset.rendered = 'true';
        SettingsUI.render('settingsContainer');
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
});
