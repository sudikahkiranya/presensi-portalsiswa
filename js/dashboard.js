// TODO: Sesuaikan URL Web App Apps Script dan SESSION_KEY dengan auth.js
const API_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
const SESSION_KEY = "app_portal_user";
const THEME_STORAGE_KEY = "sisensi_active_theme";

window.appData = [];
window.currentPage = 1;
window.rowsPerPage = 25;
window.systemConfig = {};

/* ==========================================================================
   1. SYSTEM CONFIG & ZERO-FLASH THEME ENGINE
   ========================================================================== */
async function loadSystemConfig() {
  try {
    const response = await fetch(`${API_URL}?action=getSystemConfig`);
    const result = await response.json();

    if (result.success && result.data) {
      window.systemConfig = result.data;
      applySystemConfigToUI();
      initThemeEngine();
    }
  } catch (err) {
    console.warn("Gagal memuat system config:", err);
  }
}

function applySystemConfigToUI() {
  const config = window.systemConfig;
  if (!config) return;

  const logoUrl = config.logo_sekolah_direct_url || config.logo_sekolah_url;
  const logoEl = document.getElementById("appLogo");
  if (logoEl && logoUrl) {
    logoEl.src = logoUrl;
    logoEl.onload = () => logoEl.classList.add("is-loaded");
    if (logoEl.complete) logoEl.classList.add("is-loaded");
  }

  const faviconEl = document.getElementById("appFavicon");
  if (faviconEl && logoUrl) faviconEl.href = logoUrl;

  const namaSekolahEl = document.getElementById("headerNamaSekolah");
  if (namaSekolahEl && config.nama_sekolah) {
    namaSekolahEl.textContent = config.nama_sekolah;
  }
}

function initThemeEngine() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const globalTheme = window.systemConfig?.tema_warna || "burgundy";
  const themeToApply = savedTheme || String(globalTheme).toLowerCase() || "burgundy";
  selectTheme(themeToApply, false);
}

function selectTheme(themeName, isUserAction = true) {
  const cleanTheme = String(themeName).toLowerCase();
  document.documentElement.setAttribute("data-theme", cleanTheme);
  document.body.setAttribute("data-theme", cleanTheme);

  document.querySelectorAll(".color-swatch").forEach(swatch => {
    swatch.classList.toggle("active", swatch.dataset.theme === cleanTheme);
  });

  if (isUserAction) {
    localStorage.setItem(THEME_STORAGE_KEY, cleanTheme);
    document.getElementById("themePopover")?.classList.remove("is-open");
  }
}

/* ==========================================================================
   2. HEADER POPOVER & CACHE ENGINE
   ========================================================================== */
function toggleThemePopover(e) {
  if (e) e.stopPropagation();
  document.getElementById("profilePopover")?.classList.remove("is-open");
  document.getElementById("themePopover")?.classList.toggle("is-open");
}

function toggleProfilePopover(e) {
  if (e) e.stopPropagation();
  document.getElementById("themePopover")?.classList.remove("is-open");
  document.getElementById("profilePopover")?.classList.toggle("is-open");
}

document.addEventListener("click", function (e) {
  const themePopover = document.getElementById("themePopover");
  const themeBtn = document.getElementById("themePickerBtn");
  const profilePopover = document.getElementById("profilePopover");
  const profileBtn = document.getElementById("profilePickerBtn");

  if (themePopover?.classList.contains("is-open") && !themePopover.contains(e.target) && !themeBtn?.contains(e.target)) {
    themePopover.classList.remove("is-open");
  }
  if (profilePopover?.classList.contains("is-open") && !profilePopover.contains(e.target) && !profileBtn?.contains(e.target)) {
    profilePopover.classList.remove("is-open");
  }
  if (!e.target.closest(".custom-dropdown")) {
    document.querySelectorAll(".custom-dropdown.open").forEach(el => closeCustomDropdown(el));
  }
});

async function clearSystemCache() {
  showLoading("Membersihkan cache...");
  document.getElementById("profilePopover")?.classList.remove("is-open");

  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "clearSystemConfigCache" })
    });
  } catch (err) {
    console.warn("Soft warning clear cache:", err);
  } finally {
    window.location.reload(true);
  }
}

/* ==========================================================================
   3. LOADING OVERLAY, TOAST & MODAL HELPERS
   ========================================================================== */
function showLoading(text = "Memproses...") {
  const el = document.getElementById("loadingOverlay");
  const label = document.getElementById("loadingText");
  if (label) label.textContent = text;
  if (el) el.classList.add("active");
}

function hideLoading() {
  document.getElementById("loadingOverlay")?.classList.remove("active");
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

function openConfirmModal(text, onYesCallback) {
  const modal = document.getElementById("confirmModal");
  const textEl = document.getElementById("confirmText");
  if (textEl) textEl.textContent = text;
  window.onConfirmCallback = onYesCallback;
  modal?.classList.add("active");
}

function closeConfirm() {
  document.getElementById("confirmModal")?.classList.remove("active");
}

function handleConfirmYes() {
  if (typeof window.onConfirmCallback === "function") window.onConfirmCallback();
  closeConfirm();
}

function openErrorModal(message, title = "Terjadi Kendala") {
  const modal = document.getElementById("errorModal");
  const titleEl = document.getElementById("errorTitle");
  const msgEl = document.getElementById("errorMessage");
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  modal?.classList.add("active");
}

function closeError() {
  document.getElementById("errorModal")?.classList.remove("active");
}

/* ==========================================================================
   4. CUSTOM DROPDOWN & SEARCH INPUT HELPERS
   ========================================================================== */
function createCustomDropdown(containerElement, optionsArray, selectedValue, onSelectCallback) {
  containerElement.className = "custom-dropdown";
  containerElement.innerHTML = `
    <div class="dropdown-selected">
      <span class="dropdown-text"></span>
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
    <div class="dropdown-menu">
      <div class="dropdown-menu-inner"></div>
    </div>
  `;

  const textSpan = containerElement.querySelector(".dropdown-text");
  const menuOuter = containerElement.querySelector(".dropdown-menu");
  const menuInner = containerElement.querySelector(".dropdown-menu-inner");
  const selectedBox = containerElement.querySelector(".dropdown-selected");

  const currentObj = optionsArray.find(opt => opt.value === selectedValue) || optionsArray[0];
  textSpan.innerText = currentObj.label;
  containerElement.setAttribute("data-value", currentObj.value);

  optionsArray.forEach(item => {
    const div = document.createElement("div");
    div.className = `dropdown-item ${item.class || ""}`;
    div.setAttribute("data-value", item.value);
    div.innerText = item.label;
    menuInner.appendChild(div);
  });

  selectedBox.onclick = function (e) {
    e.stopPropagation();
    const isOpen = containerElement.classList.contains("open");
    document.querySelectorAll(".custom-dropdown.open").forEach(el => closeCustomDropdown(el));
    if (!isOpen) containerElement.classList.add("open");
  };

  menuOuter.onclick = function (e) {
    e.stopPropagation();
    const item = e.target.closest(".dropdown-item");
    if (!item) return;

    const value = item.getAttribute("data-value");
    const label = item.innerText;
    textSpan.innerText = label;
    containerElement.setAttribute("data-value", value);
    closeCustomDropdown(containerElement);

    if (typeof onSelectCallback === "function") onSelectCallback(value, label);
  };
}

function closeCustomDropdown(dropdown) {
  if (dropdown) dropdown.classList.remove("open");
}

function handleSearchInput(inputEl, clearBtnId, callbackFn) {
  const clearBtn = document.getElementById(clearBtnId);
  if (clearBtn) clearBtn.hidden = !inputEl.value;
  if (typeof callbackFn === "function") callbackFn();
}

function clearSearchInput(inputId, clearBtnId, callbackFn) {
  const inputEl = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearBtnId);
  if (inputEl) {
    inputEl.value = "";
    inputEl.focus();
  }
  if (clearBtn) clearBtn.hidden = true;
  if (typeof callbackFn === "function") callbackFn();
}

/* ==========================================================================
   5. INITIALIZATION, FETCH DATA & LOGOUT
   ========================================================================== */
function updateConnectionBadge() {
  const panel = document.getElementById("syncStatusPanel");
  const icon = document.getElementById("syncStatusIcon");
  const label = document.getElementById("syncStatusLabel");
  const caption = document.getElementById("syncStatusCaption");
  if (!panel) return;

  const online = navigator.onLine;
  panel.dataset.state = online ? "saved" : "offline";
  if (label) label.textContent = online ? "Online" : "Offline";
  if (caption) caption.textContent = online ? "Terhubung ke server" : "Koneksi terputus";
  if (icon) {
    icon.innerHTML = online
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M18.72 18.727h-12.063c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773"/></svg>`;
  }
}

window.addEventListener("online", () => {
  updateConnectionBadge();
  showToast("Koneksi terhubung kembali.", "info", 2000);
});

window.addEventListener("offline", () => {
  updateConnectionBadge();
  showToast("Koneksi terputus.", "error");
});

function initDashboard() {
  const user = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  const today = new Date().toLocaleDateString("id-ID");

  if (!user || (user.loginDate && user.loginDate !== today)) {
    localStorage.removeItem(SESSION_KEY);
    window.location.replace("/");
    return;
  }

  const userNameEl = document.getElementById("userName");
  const userRoleEl = document.getElementById("userRole");
  if (userNameEl) userNameEl.textContent = user.nama || "-";
  if (userRoleEl) userRoleEl.textContent = user.role || "User";

  initThemeEngine();
  loadSystemConfig();
  updateConnectionBadge();

  // Inisialisasi Filter Contoh
  const filterKategori = document.getElementById("filterKategori");
  if (filterKategori) {
    createCustomDropdown(filterKategori, [{ value: "", label: "Semua" }], "", () => applyFilter());
  }

  fetchData();
}

async function fetchData() {
  showLoading("Memuat data...");
  try {
    // TODO: Ganti action endpoint sesuai backend portal ini
    const response = await fetch(`${API_URL}?action=getDataDashboard`);
    const result = await response.json();

    window.appData = Array.isArray(result) ? result : (result.data || []);
    applyFilter();
    hideLoading();
    return true;
  } catch (err) {
    console.error("Fetch error:", err);
    hideLoading();
    const tbody = document.getElementById("tbodyData");
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center-cell">Belum ada data atau gagal terhubung ke server.</td></tr>`;
    return false;
  }
}

async function refreshData() {
  const ok = await fetchData();
  if (ok) showToast("Data terbaru berhasil dimuat!", "success");
}

function applyFilter() {
  const keyword = document.getElementById("filterSearch")?.value.toLowerCase().trim() || "";
  const tbody = document.getElementById("tbodyData");
  if (!tbody) return;

  const filtered = window.appData.filter(item =>
    !keyword || JSON.stringify(item).toLowerCase().includes(keyword)
  );

  const jumlahEl = document.getElementById("jumlahData");
  if (jumlahEl) jumlahEl.textContent = filtered.length;

  const startIndex = (window.currentPage - 1) * window.rowsPerPage;
  const pageData = filtered.slice(startIndex, startIndex + window.rowsPerPage);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center-cell">Tidak ada data.</td></tr>`;
    renderPagination(0);
    return;
  }

  // TODO: Sesuaikan kolom tabel dengan struktur field data aplikasi ini
  tbody.innerHTML = pageData.map((item, idx) => `
    <tr>
      <td>${startIndex + idx + 1}</td>
      <td>${item.nama || "-"}</td>
      <td>${item.keterangan || "-"}</td>
      <td><span class="status-badge-btn status-hadir">${item.status || "Aktif"}</span></td>
      <td>-</td>
    </tr>
  `).join("");

  renderPagination(filtered.length);
}

function renderPagination(total) {
  const container = document.getElementById("pagination");
  if (!container) return;
  container.innerHTML = "";

  const totalPages = Math.ceil(total / window.rowsPerPage);
  if (totalPages <= 1) return;

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = i;
    if (i === window.currentPage) {
      btn.disabled = true;
      btn.classList.add("active");
    } else {
      btn.onclick = () => { window.currentPage = i; applyFilter(); };
    }
    container.appendChild(btn);
  }
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.replace("/");
}

document.addEventListener("DOMContentLoaded", initDashboard);