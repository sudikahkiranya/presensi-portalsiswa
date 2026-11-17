// TODO: Sesuaikan URL Web App Apps Script dan key session aplikasi ini
const API_URL = "https://script.google.com/macros/s/AKfycbxR0bwVJCXQY5DQKawqOBQO6vNwU8UMFLJ3AuBytSRgQR3TW9rJZ0r58JGkL2u_HxYMhw/exec";
const SESSION_KEY = "app_portal_user";
const REDIRECT_PAGE = "dashboard";

/* ==========================================================================
   1. THEME & PASSWORD VISIBILITY INIT
   ========================================================================== */
(function initLoginTheme() {
  const savedTheme = localStorage.getItem("sisensi_active_theme") || "burgundy";
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.body.setAttribute("data-theme", savedTheme);
})();

document.addEventListener("DOMContentLoaded", function () {
  // Toggle Eye Password
  const password = document.getElementById("passwordInput");
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

  // Pengecekan Sesi Login Otomatis (Reset jika berganti hari)
  const savedUserRaw = localStorage.getItem(SESSION_KEY);
  if (!savedUserRaw) return;

  const today = new Date().toLocaleDateString("id-ID");

  try {
    const user = JSON.parse(savedUserRaw);
    if (user && user.loginDate !== today) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }

    if (user && user.userID && user.nama && user.loginDate === today) {
      window.location.replace(REDIRECT_PAGE);
    }
  } catch (err) {
    localStorage.removeItem(SESSION_KEY);
  }
});

/* ==========================================================================
   2. LOADING OVERLAY & TOAST HELPERS
   ========================================================================== */
function showLoading(text = "Memproses...") {
  const el = document.getElementById("loadingOverlay");
  const label = document.getElementById("loadingText");
  if (label) label.textContent = text;
  if (el) el.classList.add("active");
}

function hideLoading() {
  const el = document.getElementById("loadingOverlay");
  if (el) el.classList.remove("active");
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
  const toast = document.getElementById("appToast");
  if (toast) toast.classList.remove("is-visible");
}

/* ==========================================================================
   3. LOGIN HANDLER
   ========================================================================== */
async function login() {
  const username = document.getElementById("usernameInput").value.trim();
  const password = document.getElementById("passwordInput").value.trim();
  const errorMsg = document.getElementById("errorMsg");

  errorMsg.style.display = "none";
  errorMsg.textContent = "";

  if (!username || !password) {
    errorMsg.textContent = "Username dan Password isi terlebih dahulu.";
    errorMsg.style.display = "block";
    return;
  }

  showLoading("Login...");

  try {
    // TODO: Sesuaikan nama action & parameter payload dengan backend Apps Script
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "login",
        idInput: username,
        kodeInput: password
      })
    });

    const result = await response.json();

    if (result.success) {
      const today = new Date().toLocaleDateString("id-ID");

      localStorage.setItem(SESSION_KEY, JSON.stringify({
        userID: username,
        nama: result.nama,
        role: result.role || "User",
        loginDate: today
      }));

      window.location.href = REDIRECT_PAGE;
    } else {
      hideLoading();
      errorMsg.textContent = result.message || "Username/Password salah atau tidak diizinkan.";
      errorMsg.style.display = "block";
    }
  } catch (err) {
    console.error("Login error:", err);
    hideLoading();
    errorMsg.textContent = "Gagal terhubung ke server.";
    errorMsg.style.display = "block";
  }
}