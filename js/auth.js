// TODO: Sesuaikan URL Web App Apps Script dan key session aplikasi ini
const API_URL = "https://script.google.com/macros/s/AKfycbxR0bwVJCXQY5DQKawqOBQO6vNwU8UMFLJ3AuBytSRgQR3TW9rJZ0r58JGkL2u_HxYMhw/exec";
const SESSION_KEY = "sisensi_siswa_user";
const REDIRECT_PAGE = "dashboard";

/* ==========================================================================
   1. THEME, LOGO CONFIG & PASSWORD VISIBILITY INIT
   ========================================================================== */
(function initLoginTheme() {
  const savedTheme = localStorage.getItem("sisensi_active_theme") || "burgundy";
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.body.setAttribute("data-theme", savedTheme);
})();

async function loadLoginBranding() {
  if (!API_URL || API_URL.includes("YOUR_DEPLOYMENT_ID")) return;
  try {
    const response = await fetch(`${API_URL}?action=getSystemConfig`);
    const result = await response.json();

    if (result.success && result.data) {
      const logoUrl = result.data.logo_sekolah_direct_url || result.data.logo_sekolah_url;
      if (logoUrl) {
        const logoEl = document.getElementById("loginLogo");
        const favEl = document.getElementById("appFavicon");
        if (logoEl) logoEl.src = logoUrl;
        if (favEl) favEl.href = logoUrl;
      }

      if (!localStorage.getItem("sisensi_active_theme") && result.data.tema_warna) {
        const theme = String(result.data.tema_warna).toLowerCase();
        document.documentElement.setAttribute("data-theme", theme);
        document.body.setAttribute("data-theme", theme);
      }
    }
  } catch (err) {
    console.warn("Gagal memuat branding sekolah:", err);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // Toggle Eye Password
  const password = document.getElementById("kodeAkses");
  const toggle = document.getElementById("togglePassword");
  const icon = document.getElementById("passwordEyeIcon");

  const eye = `
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  `;
  const eyeOff = `
    <path d="M3 3l18 18"></path>
    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path>
    <path d="M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-4 4.8"></path>
    <path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7c1 0 2-.2 2.9-.5"></path>
  `;

  if (toggle && password && icon) {
    toggle.addEventListener("click", function () {
      const show = password.type === "password";
      password.type = show ? "text" : "password";
      icon.innerHTML = show ? eyeOff : eye;
      toggle.setAttribute("aria-label", show ? "Sembunyikan password" : "Tampilkan password");
      toggle.setAttribute("title", show ? "Sembunyikan password" : "Tampilkan password");
      toggle.setAttribute("aria-pressed", String(show));
    });
  }

  // Auto-redirect jika siswa sudah pernah login (migrasi dari window.onload GAS)
  const savedUserRaw = localStorage.getItem(SESSION_KEY);
  const legacySavedID = localStorage.getItem("idSiswa");

  if (savedUserRaw) {
    try {
      const user = JSON.parse(savedUserRaw);
      if (user && user.id_siswa && user.nama) {
        showLoading("Masuk Portal...");
        window.location.replace(REDIRECT_PAGE);
        return;
      }
    } catch (err) {
      localStorage.removeItem(SESSION_KEY);
    }
  } else if (legacySavedID) {
    // Migrasi otomatis jika browser masih menyimpan key lama dari versi GAS
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id_siswa: legacySavedID,
      nama: localStorage.getItem("namaSiswa") || "-",
      kelas: localStorage.getItem("kelasSiswa") || "-",
      id_rombel: localStorage.getItem("idRombel") || "-",
      role: localStorage.getItem("kelasSiswa") || "Siswa"
    }));
    showLoading("Masuk Portal...");
    window.location.replace(REDIRECT_PAGE);
    return;
  }

  loadLoginBranding();
});

/* ==========================================================================
   2. LOADING OVERLAY & TOAST HELPERS
   ========================================================================== */
function showLoading(message = "Memproses...") {
  const overlay = document.getElementById("loadingOverlay");
  const loadingText = document.getElementById("loadingText");
  if (loadingText) loadingText.textContent = message;
  if (overlay) overlay.classList.add("active");
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.classList.remove("active");
}

let toastTimeout = null;
function showToast(message, type = "info", duration = 3000) {
  const toast = document.getElementById("appToast");
  const titleEl = document.getElementById("toastTitle");
  const msgEl = document.getElementById("toastMessage");
  const iconBg = document.getElementById("toastIconBg");
  if (!toast) return;

  toast.setAttribute("data-type", type);
  if (type === "success") {
    if (titleEl) titleEl.textContent = "Sukses";
    if (iconBg) iconBg.textContent = "✓";
  } else if (type === "error") {
    if (titleEl) titleEl.textContent = "Gagal";
    if (iconBg) iconBg.textContent = "✕";
  } else {
    if (titleEl) titleEl.textContent = "Informasi";
    if (iconBg) iconBg.textContent = "ℹ";
  }

  if (msgEl) msgEl.textContent = message;
  toast.classList.add("is-visible");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => hideAppToast(), duration);
}

function hideAppToast() {
  document.getElementById("appToast")?.classList.remove("is-visible");
}

/* ==========================================================================
   3. LOGIN HANDLER (MIGRASI DARI verifikasiLoginSiswa GAS)
   ========================================================================== */
async function login() {
  const id = document.getElementById("idSiswa").value.trim();
  const kode = document.getElementById("kodeAkses").value.trim();
  const errorMsg = document.getElementById("errorMsg");

  errorMsg.style.display = "none";
  errorMsg.textContent = "";

  if (!id || !kode) {
    errorMsg.textContent = "ID dan Password isi terlebih dahulu.";
    errorMsg.style.display = "block";
    return;
  }

  showLoading("Memverifikasi...");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "verifikasiLoginSiswa",
        idSiswa: id,
        kodeAkses: kode
      })
    });

    const result = await response.json();

    if (result && result.success && result.siswa) {
      // Simpan format baru (object JSON untuk Anti-Flash Guard & Header Dashboard)
      const sessionData = {
        id_siswa: result.siswa.id_siswa,
        nama: result.siswa.nama,
        kelas: result.siswa.kelas,
        id_rombel: result.siswa.id_rombel,
        role: result.siswa.kelas || "Siswa"
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

      // Tetap simpan key individual agar kompatibel dengan modul form siswa lama
      localStorage.setItem("idSiswa", result.siswa.id_siswa);
      localStorage.setItem("namaSiswa", result.siswa.nama);
      localStorage.setItem("kelasSiswa", result.siswa.kelas);
      localStorage.setItem("idRombel", result.siswa.id_rombel);

      showLoading("Memuat Portal...");
      window.location.href = REDIRECT_PAGE;
    } else {
      hideLoading();
      errorMsg.textContent = (result && result.message) ? result.message : "ID atau Password salah!";
      errorMsg.style.display = "block";
    }
  } catch (err) {
    console.error("Login error:", err);
    hideLoading();
    errorMsg.textContent = "Gagal terhubung ke server: " + err.message;
    errorMsg.style.display = "block";
  }
}