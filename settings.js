/**
 * settings.js — Manajemen Pengaturan PWA
 * Collab Match Creator
 *
 * Menangani:
 * - Registrasi & update service worker
 * - Prompt install PWA (A2HS)
 * - Notifikasi push
 * - Preferensi pengguna (tema, notif, dll.)
 * - Deteksi & banner update
 */

'use strict';

/* ─────────────────────────────────────────────
   KONFIGURASI
───────────────────────────────────────────── */
const CMK_SETTINGS_KEY = 'cmk_settings';

const DEFAULT_SETTINGS = {
  theme:              'light',       // 'light' | 'dark' | 'system'
  notifPush:          false,
  notifInstallDismissed: false,
  notifMessages:      true,
  notifCollab:        true,
  fontScale:          1,             // 0.9 | 1 | 1.1 | 1.2
  reducedMotion:      false,
  language:           'id',
  lastSeen:           null,
  version:            '1.0.0',
};

/* ─────────────────────────────────────────────
   STORAGE HELPER
───────────────────────────────────────────── */
const Settings = {
  _cache: null,

  load() {
    if (this._cache) return this._cache;
    try {
      const raw = localStorage.getItem(CMK_SETTINGS_KEY);
      this._cache = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch {
      this._cache = { ...DEFAULT_SETTINGS };
    }
    return this._cache;
  },

  save(partial = {}) {
    const current = this.load();
    this._cache   = { ...current, ...partial };
    try {
      localStorage.setItem(CMK_SETTINGS_KEY, JSON.stringify(this._cache));
    } catch (e) {
      console.warn('[Settings] Tidak bisa menyimpan:', e);
    }
    return this._cache;
  },

  get(key) {
    return this.load()[key];
  },

  reset() {
    this._cache = { ...DEFAULT_SETTINGS };
    localStorage.removeItem(CMK_SETTINGS_KEY);
  },
};

/* ─────────────────────────────────────────────
   SERVICE WORKER REGISTRATION
───────────────────────────────────────────── */
const SW = {
  registration: null,

  async register() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[SW] Service Worker tidak didukung di browser ini.');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none', // selalu cek update SW dari network
      });
      this.registration = reg;
      console.log('[SW] Terdaftar. Scope:', reg.scope);

      // Cek update saat halaman dimuat
      reg.addEventListener('updatefound', () => this._onUpdateFound(reg));

      // Cek update setiap 60 menit (saat app aktif)
      setInterval(() => reg.update(), 60 * 60 * 1000);

      // Jika SW sudah aktif sebelumnya, cek apakah ada yang menunggu
      if (reg.waiting) this._showUpdateBanner(reg.waiting);

    } catch (err) {
      console.error('[SW] Registrasi gagal:', err);
    }
  },

  _onUpdateFound(reg) {
    const newWorker = reg.installing;
    if (!newWorker) return;
    console.log('[SW] Update ditemukan, mengunduh…');
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        console.log('[SW] Update siap diterapkan.');
        this._showUpdateBanner(newWorker);
      }
    });
  },

  _showUpdateBanner(worker) {
    const banner = document.getElementById('updateBanner');
    const btn    = document.getElementById('updateBannerBtn');
    if (!banner) return;

    banner.classList.add('show');

    if (btn) {
      btn.onclick = () => {
        worker.postMessage({ type: 'SKIP_WAITING' });
        banner.classList.remove('show');
      };
    }

    // Auto-reload setelah SW aktif
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  },

  async getVersion() {
    if (!navigator.serviceWorker.controller) return null;
    return new Promise(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = e => resolve(e.data?.version || null);
      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_VERSION' }, [channel.port2]
      );
      setTimeout(() => resolve(null), 2000);
    });
  },
};

/* ─────────────────────────────────────────────
   PWA INSTALL PROMPT (Add to Home Screen)
───────────────────────────────────────────── */
const InstallPrompt = {
  _deferredEvent: null,

  init() {
    // Simpan event beforeinstallprompt untuk digunakan nanti
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this._deferredEvent = e;
      console.log('[PWA] Install prompt tersimpan.');
      this._maybeShowBanner();
    });

    // Catat jika berhasil diinstall
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] Berhasil diinstall!');
      this._deferredEvent = null;
      this._hideBanner();
      Settings.save({ notifInstallDismissed: true });
      if (typeof toast === 'function') toast('✅ App berhasil diinstall ke home screen!');
    });
  },

  _maybeShowBanner() {
    // Jangan tampilkan jika sudah dismiss atau sudah standalone
    if (Settings.get('notifInstallDismissed')) return;
    if (this.isStandalone()) return;
    this._showBanner();
  },

  _showBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.classList.add('show');
  },

  _hideBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.classList.remove('show');
  },

  async prompt() {
    if (!this._deferredEvent) {
      // Fallback untuk iOS — tampilkan instruksi manual
      if (this.isIOS()) {
        this._showIOSInstructions();
      }
      return false;
    }
    this._deferredEvent.prompt();
    const { outcome } = await this._deferredEvent.userChoice;
    console.log('[PWA] Pilihan install:', outcome);
    this._deferredEvent = null;
    this._hideBanner();
    return outcome === 'accepted';
  },

  dismiss() {
    this._hideBanner();
    Settings.save({ notifInstallDismissed: true });
  },

  isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  },

  isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  },

  _showIOSInstructions() {
    if (typeof toast === 'function') {
      toast('📲 Di Safari: ketuk Share → "Tambah ke Layar Utama"');
    }
  },
};

/* ─────────────────────────────────────────────
   PUSH NOTIFICATIONS
───────────────────────────────────────────── */
const PushNotif = {
  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('[Push] Notifikasi tidak didukung.');
      return false;
    }
    if (Notification.permission === 'granted') {
      Settings.save({ notifPush: true });
      return true;
    }
    if (Notification.permission === 'denied') {
      if (typeof toast === 'function') toast('Notifikasi diblokir. Aktifkan di pengaturan browser.');
      return false;
    }
    const result = await Notification.requestPermission();
    const granted = result === 'granted';
    Settings.save({ notifPush: granted });
    if (granted) {
      if (typeof toast === 'function') toast('🔔 Notifikasi diaktifkan!');
      this._subscribe();
    } else {
      if (typeof toast === 'function') toast('Notifikasi tidak diaktifkan.');
    }
    return granted;
  },

  async _subscribe() {
    if (!SW.registration) return;
    try {
      // Contoh: subscribe ke push server (VAPID key dummy)
      // Ganti VAPID_PUBLIC_KEY dengan key asli dari server
      const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
      const subscription = await SW.registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: this._urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      console.log('[Push] Berlangganan:', JSON.stringify(subscription));
      // TODO: kirim `subscription` ke backend
    } catch (err) {
      console.warn('[Push] Gagal berlangganan:', err);
    }
  },

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = window.atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  },

  getPermissionState() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  },

  showLocal(title, body, tag = 'cmk-local') {
    if (Notification.permission !== 'granted') return;
    const notif = new Notification(title, {
      body,
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag,
    });
    notif.onclick = () => { window.focus(); notif.close(); };
  },
};

/* ─────────────────────────────────────────────
   TEMA (Light / Dark / System)
───────────────────────────────────────────── */
const Theme = {
  apply(theme) {
    const root    = document.documentElement;
    const isDark  = theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    Settings.save({ theme });

    // Perbarui meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = isDark ? '#0a2463' : '#1a4fa8';
  },

  init() {
    const saved = Settings.get('theme') || 'light';
    this.apply(saved);

    // Pantau perubahan preferensi sistem
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (Settings.get('theme') === 'system') this.apply('system');
    });
  },
};

/* ─────────────────────────────────────────────
   ONLINE / OFFLINE STATUS
───────────────────────────────────────────── */
const NetworkStatus = {
  init() {
    window.addEventListener('online',  () => this._onChange(true));
    window.addEventListener('offline', () => this._onChange(false));
  },

  _onChange(isOnline) {
    if (isOnline) {
      if (typeof toast === 'function') toast('✅ Koneksi kembali!');
      // Trigger background sync jika tersedia
      if (SW.registration && 'sync' in SW.registration) {
        SW.registration.sync.register('cmk-sync-messages').catch(() => {});
        SW.registration.sync.register('cmk-sync-applications').catch(() => {});
      }
    } else {
      if (typeof toast === 'function') toast('⚠️ Kamu sedang offline.');
    }
    document.body.dataset.networkStatus = isOnline ? 'online' : 'offline';
  },

  isOnline() {
    return navigator.onLine;
  },
};

/* ─────────────────────────────────────────────
   PENGATURAN UI (Panel di Profile)
───────────────────────────────────────────── */
const SettingsUI = {
  /**
   * Render panel pengaturan ke dalam elemen target.
   * @param {string} containerId — ID elemen container
   */
  render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const s = Settings.load();

    el.innerHTML = `
      <div class="info-card" id="settingsPanel">
        <div class="info-card-title">Pengaturan Aplikasi</div>

        <!-- Notifikasi -->
        <div class="settings-row">
          <div class="settings-label">
            <span class="settings-icon">🔔</span>
            <div>
              <div class="settings-title">Notifikasi Push</div>
              <div class="settings-desc">Pesan & update kolaborasi baru</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="settingNotifPush" ${s.notifPush ? 'checked' : ''}
              onchange="SettingsUI.toggleNotif(this)">
            <span class="toggle-knob"></span>
          </label>
        </div>

        <!-- Tema -->
        <div class="settings-row">
          <div class="settings-label">
            <span class="settings-icon">🎨</span>
            <div>
              <div class="settings-title">Tema</div>
              <div class="settings-desc">Tampilan aplikasi</div>
            </div>
          </div>
          <select class="settings-select" id="settingTheme"
            onchange="SettingsUI.changeTheme(this.value)">
            <option value="light"  ${s.theme==='light'  ? 'selected':''}>Terang</option>
            <option value="dark"   ${s.theme==='dark'   ? 'selected':''}>Gelap</option>
            <option value="system" ${s.theme==='system' ? 'selected':''}>Sistem</option>
          </select>
        </div>

        <!-- Install App -->
        ${!InstallPrompt.isStandalone() ? `
        <div class="settings-row">
          <div class="settings-label">
            <span class="settings-icon">📲</span>
            <div>
              <div class="settings-title">Install Aplikasi</div>
              <div class="settings-desc">Tambah ke layar utama perangkat</div>
            </div>
          </div>
          <button class="settings-btn-sm" onclick="SettingsUI.triggerInstall()">Install</button>
        </div>
        ` : `
        <div class="settings-row">
          <div class="settings-label">
            <span class="settings-icon">✅</span>
            <div>
              <div class="settings-title">Aplikasi Terinstall</div>
              <div class="settings-desc">Kamu menggunakan mode app</div>
            </div>
          </div>
        </div>
        `}

        <!-- Versi -->
        <div class="settings-row" style="padding-top:8px;border-top:1px solid var(--gray-100);margin-top:4px;">
          <div class="settings-label" style="font-size:11px;color:var(--gray-400);">
            <span class="settings-icon">ℹ️</span>
            <span>Versi Aplikasi</span>
          </div>
          <span id="settingsVersion" style="font-size:11px;color:var(--gray-400);">v1.0.0</span>
        </div>

      </div>
    `;

    // Tambahkan style inline untuk elemen settings jika belum ada
    this._injectStyles();

    // Ambil versi dari SW
    SW.getVersion().then(v => {
      const el = document.getElementById('settingsVersion');
      if (el && v) el.textContent = 'v' + v;
    });
  },

  async toggleNotif(checkbox) {
    if (checkbox.checked) {
      const granted = await PushNotif.requestPermission();
      if (!granted) checkbox.checked = false;
    } else {
      Settings.save({ notifPush: false });
    }
  },

  changeTheme(value) {
    Theme.apply(value);
  },

  async triggerInstall() {
    const accepted = await InstallPrompt.prompt();
    if (!accepted && InstallPrompt.isIOS()) {
      // Sudah ditangani oleh InstallPrompt.prompt()
    }
  },

  _injectStyles() {
    if (document.getElementById('cmk-settings-styles')) return;
    const style = document.createElement('style');
    style.id = 'cmk-settings-styles';
    style.textContent = `
      .settings-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 0; border-bottom: 1px solid var(--gray-100);
      }
      .settings-row:last-child { border-bottom: none; }
      .settings-label {
        display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;
      }
      .settings-icon { font-size: 18px; flex-shrink: 0; }
      .settings-title { font-size: 13px; font-weight: 600; color: var(--gray-900); }
      .settings-desc  { font-size: 11px; color: var(--gray-400); margin-top: 1px; }
      .settings-select {
        border: 1px solid var(--gray-300); border-radius: 6px; padding: 5px 8px;
        font-family: 'Inter', sans-serif; font-size: 12px; color: var(--gray-900);
        background: var(--white); outline: none; cursor: pointer; flex-shrink: 0;
      }
      .settings-btn-sm {
        background: var(--blue-700); color: var(--white); border: none;
        border-radius: 6px; padding: 6px 12px; font-family: 'Inter', sans-serif;
        font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0;
        transition: background 0.15s;
      }
      .settings-btn-sm:hover { background: var(--blue-800); }
      /* Toggle switch */
      .toggle-switch { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
      .toggle-switch input { opacity: 0; width: 0; height: 0; }
      .toggle-knob {
        position: absolute; cursor: pointer; inset: 0;
        background: var(--gray-300); border-radius: 22px; transition: 0.2s;
      }
      .toggle-knob::before {
        content: ''; position: absolute; height: 16px; width: 16px;
        left: 3px; bottom: 3px; background: var(--white); border-radius: 50%;
        transition: 0.2s;
      }
      .toggle-switch input:checked + .toggle-knob { background: var(--blue-600); }
      .toggle-switch input:checked + .toggle-knob::before { transform: translateX(18px); }
    `;
    document.head.appendChild(style);
  },
};

/* ─────────────────────────────────────────────
   INISIALISASI UTAMA
   Dipanggil dari app.js saat DOMContentLoaded
───────────────────────────────────────────── */
function initPWA() {
  // 1. Registrasi Service Worker
  SW.register();

  // 2. Tema awal
  Theme.init();

  // 3. Install prompt
  InstallPrompt.init();

  // 4. Network status listener
  NetworkStatus.init();

  // 5. Tandai status standalone
  if (InstallPrompt.isStandalone()) {
    document.body.dataset.pwaMode = 'standalone';
    console.log('[PWA] Berjalan sebagai standalone app.');
  }

  console.log('[PWA] Inisialisasi selesai.');
}

// Ekspos ke global agar bisa dipanggil dari app.js dan HTML
window.CMK = window.CMK || {};
window.CMK.Settings     = Settings;
window.CMK.SW           = SW;
window.CMK.InstallPrompt = InstallPrompt;
window.CMK.PushNotif    = PushNotif;
window.CMK.Theme        = Theme;
window.CMK.NetworkStatus = NetworkStatus;
window.CMK.SettingsUI   = SettingsUI;
window.SettingsUI       = SettingsUI; // shorthand untuk inline HTML handlers
window.initPWA          = initPWA;
