/* ==========================================================================
   PORTAL PRESENSI SISWA - SMK MEDICACOM BANDUNG
   File: js/dashboard.js
   ========================================================================== */

// ==========================================================================
// 1. KONFIGURASI API BACKEND & GLOBAL STATE
// ==========================================================================
const API_URL = "https://script.google.com/macros/s/AKfycbxR0bwVJCXQY5DQKawqOBQO6vNwU8UMFLJ3AuBytSRgQR3TW9rJZ0r58JGkL2u_HxYMhw/exec";
window.templateQrUrl = "./assets/template_qr.png";
window.generatedQrDataUrl = null;

window.AppStore = {
  isLoaded: false,
  logs: [],
  filterOptions: { taList: [], semesterMap: {} },
  activeSemester: null,
  rawPresensi: [],

  getPresensiByRange: function (rangeType, param1, param2) {
    if (!this.rawPresensi.length) return [];

    if (rangeType === "1w") {
      return this.rawPresensi.slice(-5);
    } else if (rangeType === "1m") {
      return this.rawPresensi.slice(-30);
    } else if (rangeType === "semester") {
      const targetDigit = param2 === "Ganjil" ? "1" : (param2 === "Genap" ? "2" : "");
      return this.rawPresensi.filter(p => {
        const matchTA = p.tahunAjaran === param1;
        if (p.idSemester) return matchTA && p.idSemester.endsWith(targetDigit);
        return matchTA && p.semester === param2;
      });
    } else if (rangeType === "tahun_ajaran") {
      return this.rawPresensi.filter(p => p.tahunAjaran === param1);
    } else if (rangeType === "custom") {
      return this.rawPresensi.filter(p => p.tanggal >= param1 && p.tanggal <= param2);
    }
    return this.rawPresensi;
  }
};

window.riwayatData = [];
window.idSiswaGlobal = null;
window.isLoaded = { hariIni: false, statistik: false, riwayat: false, qr: false };
window.__INIT_CALLED = false;
window.loadingCount = 0;
window.currentChartData = [];
window.selectedDotIndex = null;

// ==========================================================================
// 2. API HELPER & BRANDING CONFIG
// ==========================================================================
async function callBackendApi(action, params = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...params })
  });
  return await response.json();
}

async function loadSystemBranding() {
  try {
    const res = await fetch(`${API_URL}?action=getSystemConfig`).then(r => r.json());
    if (res && res.success && res.data) {
      const logoPolos =
        res.data.logo_polos_direct_url ||
        res.data.logo_polos_url ||
        res.data.logo_sekolah_direct_url ||
        res.data.logo_sekolah_url;

      if (logoPolos) {
        const dLogo = document.getElementById("logoDesktop");
        const fav = document.getElementById("appFavicon");
        if (dLogo) dLogo.src = logoPolos;
        if (fav) fav.href = logoPolos;
      }

      if (res.data.template_qr_direct_url || res.data.template_qr_url) {
        window.templateQrUrl = res.data.template_qr_direct_url || res.data.template_qr_url;
      }

      if (!localStorage.getItem("sisensi_active_theme") && res.data.tema_warna) {
        setAppTheme(String(res.data.tema_warna).toLowerCase(), false);
      }
    }
  } catch (e) {
    console.warn("Branding fallback lokal:", e);
  }
}

// ==========================================================================
// 3. 8-THEME ENGINE (SYNC DENGAN PORTAL PIKET)
// ==========================================================================
function toggleThemePopover(event) {
  if (event) event.stopPropagation();
  const profilePopover = document.getElementById("profilePopover");
  if (profilePopover) profilePopover.classList.remove("is-open");

  const themePopover = document.getElementById("themePopover");
  if (themePopover) themePopover.classList.toggle("open"); // pakai class bawaan tema lu ('open' / 'is-open')
}

function toggleProfilePopover(event) {
  if (event) event.stopPropagation();
  const themePopover = document.getElementById("themePopover");
  const profilePopover = document.getElementById("profilePopover");

  if (themePopover) themePopover.classList.remove("open", "is-open");
  if (profilePopover) profilePopover.classList.toggle("is-open");
}

document.addEventListener("click", function (event) {
  const profilePopover = document.getElementById("profilePopover");
  const profileBtn = document.getElementById("profilePickerBtn");

  if (profilePopover && profilePopover.classList.contains("is-open")) {
    if (!profilePopover.contains(event.target) && (!profileBtn || !profileBtn.contains(event.target))) {
      profilePopover.classList.remove("is-open");
    }
  }
});

function setAppTheme(themeName, persist = true) {
  const validThemes = ["burgundy", "ocean", "emerald", "royal", "sunset", "teal", "indigo", "slate"];
  const targetTheme = validThemes.includes(themeName) ? themeName : "burgundy";

  document.documentElement.setAttribute("data-theme", targetTheme);
  document.body.setAttribute("data-theme", targetTheme);

  if (persist) {
    localStorage.setItem("sisensi_active_theme", targetTheme);
  }

  document.querySelectorAll(".theme-swatch-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-theme-val") === targetTheme);
  });

  const popover = document.getElementById("themePopover");
  if (popover) popover.classList.remove("open");
}

function initThemeUI() {
  const currentTheme = localStorage.getItem("sisensi_active_theme") || "burgundy";
  setAppTheme(currentTheme, false);
}

// ==========================================================================
// 4. MASTER DATA COLLECTOR & DYNAMIC FILTER SUB-PANELS
// ==========================================================================
async function initAppDataCollector(callback) {
  const idSiswa = window.idSiswaGlobal || localStorage.getItem("idSiswa");
  if (!idSiswa) return;

  showSpinner("Menyinkronkan arsip presensi lintas semester...");

  const loadingTimer1 = setTimeout(() => {
    const el = document.getElementById("loadingText");
    if (el) el.textContent = "Membaca data rekap tingkat & angkatan...";
  }, 4000);

  const loadingTimer2 = setTimeout(() => {
    const el = document.getElementById("loadingText");
    if (el) el.textContent = "Menyusun tren grafik & riwayat harian...";
  }, 9000);

  try {
    const res = await callBackendApi("getMasterDataSiswaApi", { idSiswa });
    clearTimeout(loadingTimer1);
    clearTimeout(loadingTimer2);
    hideSpinner();

    if (res && res.success) {
      window.AppStore.isLoaded = true;
      window.AppStore.logs = res.logs || [];
      window.AppStore.filterOptions = res.filterOptions || { taList: [], semesterMap: {} };
      window.AppStore.activeSemester = res.activeSemester || null;
      window.AppStore.rawPresensi = res.rawPresensi || [];

      ensureDynamicSubPanelsExist();
      populateFilterDropdowns();

      if (typeof callback === "function") callback(res);
    }
  } catch (err) {
    clearTimeout(loadingTimer1);
    clearTimeout(loadingTimer2);
    hideSpinner();
    console.error("❌ [NETWORK ERROR] Collector Backend:", err);
  }
}

function ensureDynamicSubPanelsExist() {
  const customBox = document.getElementById("customDateRangeBox");
  if (!customBox) return;

  if (!document.getElementById("semesterSelectBox")) {
    const semBox = document.createElement("div");
    semBox.id = "semesterSelectBox";
    semBox.className = "custom-date-box";
    semBox.style.display = "none";
    semBox.innerHTML = `
      <div class="custom-date-inputs">
        <div class="date-field">
          <label for="selectTaForSemester">Tahun Ajaran</label>
          <select id="selectTaForSemester" class="date-input-clean" onchange="updateSemesterDropdownOptions()"></select>
        </div>
        <div class="date-field">
          <label for="selectSemesterType">Semester</label>
          <select id="selectSemesterType" class="date-input-clean"></select>
        </div>
      </div>
      <button type="button" class="btn-apply-filter" onclick="applySemesterFilter()">Terapkan Filter Semester</button>
    `;
    customBox.parentNode.insertBefore(semBox, customBox.nextSibling);
  }

  if (!document.getElementById("thnAjaranSelectBox")) {
    const taBox = document.createElement("div");
    taBox.id = "thnAjaranSelectBox";
    taBox.className = "custom-date-box";
    taBox.style.display = "none";
    taBox.innerHTML = `
      <div class="custom-date-inputs">
        <div class="date-field">
          <label for="selectTahunAjaranFull">Pilih Tahun Ajaran Full</label>
          <select id="selectTahunAjaranFull" class="date-input-clean"></select>
        </div>
      </div>
      <button type="button" class="btn-apply-filter" onclick="applyTahunAjaranFilter()">Terapkan Filter Tahun Ajaran</button>
    `;
    customBox.parentNode.insertBefore(taBox, customBox.nextSibling);
  }
}

function populateFilterDropdowns() {
  const taList = window.AppStore.filterOptions.taList;
  const selectTaSem = document.getElementById("selectTaForSemester");
  const selectTaFull = document.getElementById("selectTahunAjaranFull");
  if (!selectTaSem || !selectTaFull) return;

  selectTaSem.innerHTML = "";
  selectTaFull.innerHTML = "";

  if (!taList || taList.length === 0) {
    selectTaSem.innerHTML = `<option value="">Tidak ada data TA</option>`;
    selectTaFull.innerHTML = `<option value="">Tidak ada data TA</option>`;
    return;
  }

  taList.forEach(ta => {
    selectTaSem.innerHTML += `<option value="${ta}">Tahun Ajaran ${ta}</option>`;
    selectTaFull.innerHTML += `<option value="${ta}">Tahun Ajaran ${ta}</option>`;
  });

  updateSemesterDropdownOptions();
}

function updateSemesterDropdownOptions() {
  const selectedTA = document.getElementById("selectTaForSemester")?.value;
  const selectSem = document.getElementById("selectSemesterType");
  if (!selectSem || !selectedTA) return;

  selectSem.innerHTML = "";
  const availableSemesters = window.AppStore.filterOptions.semesterMap[selectedTA] || [];

  if (availableSemesters.length === 0) {
    selectSem.innerHTML = `<option value="">Tidak ada semester</option>`;
    return;
  }

  availableSemesters.forEach(sem => {
    selectSem.innerHTML += `<option value="${sem}">${sem === "Ganjil" ? "Ganjil (Semester 1)" : "Genap (Semester 2)"}</option>`;
  });
}

// ==========================================================================
// 5. NAVIGATION & TAB SWITCHING
// ==========================================================================
function showTab(event, tabName) {
  const idSiswa = window.idSiswaGlobal || localStorage.getItem("idSiswa");

  document.querySelectorAll(".tab-content").forEach(el => {
    el.classList.remove("active");
    el.style.display = "none";
  });

  document.querySelectorAll(".tab-btn, .float-nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
  });

  const targetTab = document.getElementById(tabName);
  if (targetTab) {
    targetTab.classList.add("active");
    targetTab.style.display = "block";
  }

  if (tabName === "hariIni" && !window.isLoaded.hariIni) {
    loadHariIni(idSiswa);
    window.isLoaded.hariIni = true;
  }

  if (tabName === "statistik") {
    const triggerStatistik = () => {
      if (!window.isLoaded.statistik) {
        loadStatistik(idSiswa);
        window.isLoaded.statistik = true;
      }
      setTimeout(() => {
        initTimelineDropdown();
        renderTrendChart("1w");
        attachChartClickInteraction();
      }, 50);
    };

    if (!window.AppStore.isLoaded) {
      initAppDataCollector(() => triggerStatistik());
    } else {
      triggerStatistik();
    }
  }

  if (tabName === "riwayat") {
    const triggerRiwayat = () => {
      if (!window.isLoaded.statistik) {
        loadStatistik(idSiswa);
        window.isLoaded.statistik = true;
      }
      renderRiwayat(window.AppStore.rawPresensi);
    };

    if (!window.AppStore.isLoaded) {
      initAppDataCollector(() => triggerRiwayat());
    } else {
      triggerRiwayat();
    }
  }
}

// ==========================================================================
// 6. QUICK MODALS
// ==========================================================================
function openModalQuick(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("active");
}

function closeModalQuick(e, id) {
  if (!e || e.target.id === id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("active");
  }
}

function submitDummyIzin() {
  alert("Form perizinan berhasil dikirim (Dummy)! Backend siap diintegrasikan.");
  closeModalQuick(null, "modalIzin");
}

// ==========================================================================
// 7. GREETING, PRESENSI HARI INI, REKAP & RIWAYAT
// ==========================================================================
function setGreeting() {
  const nama = localStorage.getItem("namaSiswa") || "Siswa";
  const kelas = localStorage.getItem("kelasSiswa") || "";
  const idSiswa = localStorage.getItem("idSiswa") || "";
  const hour = new Date().getHours();

  let greeting = "";
  if (hour >= 4 && hour < 11) greeting = "Selamat Pagi";
  else if (hour >= 11 && hour < 15) greeting = "Selamat Siang";
  else if (hour >= 15 && hour < 18) greeting = "Selamat Sore";
  else greeting = "Selamat Malam";

  const elGreeting = document.getElementById("greetingText");
  if (elGreeting) elGreeting.textContent = `${greeting}, ${nama}`;

  const elSub = document.getElementById("greetingSubtext");
  if (elSub) {
    const parts = [];
    if (idSiswa) parts.push(`NIS ${idSiswa}`);
    if (kelas && kelas !== "-") parts.push(kelas);
    if (parts.length) elSub.textContent = parts.join(" \u00b7 ");
  }
}

// Badge status presensi di kartu hero (Belum presensi / Tepat waktu / Terlambat / dst.)
function updateHeroStatus(data) {
  const pill = document.getElementById("heroStatusPill");
  const text = document.getElementById("heroStatusText");
  if (!pill || !text) return;

  const jamMasuk = data && data.jamMasuk && data.jamMasuk !== "-" ? data.jamMasuk : "";
  const jamPulang = data && data.jamPulang && data.jamPulang !== "-" ? data.jamPulang : "";
  const statusVal = data && data.statusMasuk && data.statusMasuk !== "-" ? String(data.statusMasuk) : "";
  const s = statusVal.toLowerCase();
  const belum = !statusVal || s.includes("belum");

  let tone = "neutral";
  let label = "";

  if (belum && !jamMasuk) {
    tone = "pending";
    label = "Belum presensi masuk";
  } else {
    if (s.includes("terlambat")) tone = "late";
    else if (s.includes("alpa")) tone = "alpa";
    else if (s.includes("sakit")) tone = "sakit";
    else if (s.includes("izin")) tone = "izin";
    else if (s.includes("prakerin") || s.includes("daring") || s.includes("dispensasi")) tone = "info";
    else tone = "ok";

    label = statusVal || "Sudah presensi masuk";
    if (jamMasuk) label += ` \u00b7 ${jamMasuk}`;
    if (jamPulang) label += " \u00b7 sudah pulang";
  }

  pill.className = `rd-pill rd-pill-${tone}`;
  text.textContent = label;
}

// Ringkasan semester di Beranda (pakai endpoint rekap yang sama dengan tab Rekap)
async function loadRingkasanBeranda(idSiswa) {
  try {
    const data = await callBackendApi("getRekapTotalByNIS", { idSiswa });
    if (data && data.sukses) {
      tampilkanRekapPresensi(data);
      window.isLoaded.statistik = true; // tab Rekap tidak perlu fetch ulang
    }
  } catch (err) {
    console.warn("Ringkasan Beranda gagal dimuat:", err);
  }
}

async function loadHariIni(idSiswa) {
  showSpinner("Memuat presensi...");
  try {
    const data = await callBackendApi("getPresensiHariIni", { idSiswa });
    if (data && data.success) {
      const elTanggal = document.getElementById("tanggalHariIni");
      if (elTanggal && data.tanggalFormatted) elTanggal.textContent = data.tanggalFormatted;

      const elMasuk = document.getElementById("jamMasuk");
      const elPulang = document.getElementById("jamPulang");
      if (elMasuk) elMasuk.textContent = data.jamMasuk || "-";
      if (elPulang) elPulang.textContent = data.jamPulang || "-";

      const elStatusMasuk = document.getElementById("statusMasuk");
      if (elStatusMasuk) {
        const statusVal = data.statusMasuk || "-";
        elStatusMasuk.textContent = statusVal;
        elStatusMasuk.className = "status-text";

        const statusLower = statusVal.toLowerCase();
        if (statusLower.includes("tepat") || statusLower.includes("hadir")) elStatusMasuk.classList.add("status-text-hadir");
        else if (statusLower.includes("terlambat")) elStatusMasuk.classList.add("status-text-terlambat");
        else if (statusLower.includes("alpa")) elStatusMasuk.classList.add("status-text-alpa");
        else if (statusLower.includes("sakit")) elStatusMasuk.classList.add("status-text-sakit");
        else if (statusLower.includes("izin")) elStatusMasuk.classList.add("status-text-izin");
        else if (statusLower.includes("prakerin") || statusLower.includes("daring")) elStatusMasuk.classList.add("status-text-prakerin");
      }

      const elStatusPulang = document.getElementById("statusPulang");
      if (elStatusPulang) {
        const stPulang = data.statusPulang || "Belum Presensi";
        elStatusPulang.textContent = stPulang;
        elStatusPulang.className = "status-text";

        const stPulangLower = stPulang.toLowerCase();
        if (stPulangLower.includes("tepat") || stPulangLower.includes("hadir") || stPulangLower.includes("sudah")) {
          elStatusPulang.classList.add("status-text-hadir");
        } else {
          elStatusPulang.style.color = "var(--text-muted)";
        }
      }

      updateHeroStatus(data);
    }
  } catch (err) {
    console.error("Gagal loadHariIni:", err);
  } finally {
    hideSpinner();
  }
}

async function loadStatistik(idSiswa) {
  showSpinner("Memuat statistik...");
  try {
    const data = await callBackendApi("getRekapTotalByNIS", { idSiswa });
    tampilkanRekapPresensi(data);
  } catch (err) {
    console.error("Gagal loadStatistik:", err);
  } finally {
    hideSpinner();
  }
}

function tampilkanRekapPresensi(data) {
  if (!data || !data.sukses) return;
  const mapping = {
    s_tepat: data.tepatWaktu,
    s_terlambat: data.terlambat,
    s_tidak: data.tidakPresensi,
    s_daring: data.daring,
    s_total: data.totalHadir,
    s_sakit: data.sakit,
    s_izin: data.izin,
    s_alpa: data.alpa,
    s_total_tidak: data.totalTidakHadir,
    h_hadir: data.totalHadir,
    h_izin: data.izin,
    h_sakit: data.sakit,
    h_alpa: data.alpa
  };
  Object.entries(mapping).forEach(([id, nilai]) => {
    const el = document.getElementById(id);
    if (el) el.innerText = nilai || 0;
  });
}

function renderRiwayat(data = window.riwayatData) {
  const tbody = document.querySelector("#tabelPresensi tbody");
  const info = document.getElementById("jumlahRiwayat");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">Tidak ada data presensi</td></tr>`;
    if (info) info.textContent = "0 data";
    return;
  }

  data.forEach(item => {
    const row = `
      <tr>
        <td data-label="Tanggal">${item.tanggal}</td>
        <td data-label="Masuk">${item.jamMasuk || "-"}</td>
        <td data-label="Status">${item.statusMasuk || "-"}</td>
        <td data-label="Pulang">${item.jamPulang || "-"}</td>
        <td data-label="Keterangan">${item.keterangan || "-"}</td>
      </tr>
    `;
    tbody.innerHTML += row;
  });

  if (info) info.textContent = `${data.length} Hari`;
}

// ==========================================================================
// 8. KARTU QR PRESENSI GENERATOR (DESKTOP BENTO & MOBILE MODAL)
// ==========================================================================
function generateQROffline(text) {
  return new Promise((resolve, reject) => {
    const qrContainer = document.createElement("div");
    new QRCode(qrContainer, {
      text: String(text || ""),
      width: 300,
      height: 300,
      correctLevel: QRCode.CorrectLevel.H
    });

    let attempts = 0;
    const checkInterval = setInterval(() => {
      const qrImg = qrContainer.querySelector("img");
      const qrCanvas = qrContainer.querySelector("canvas");

      if (qrImg && qrImg.src && qrImg.src.startsWith("data:image")) {
        clearInterval(checkInterval);
        resolve(qrImg);
      } else if (qrCanvas) {
        clearInterval(checkInterval);
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = qrCanvas.toDataURL("image/png");
      }
      if (attempts++ > 50) {
        clearInterval(checkInterval);
        reject(new Error("QR Generation Timeout"));
      }
    }, 100);
  });
}

function loadImageCORS(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal load image: " + src));
    img.src = src;
  });
}

async function generateQRCard() {
  if (window.generatedQrDataUrl) {
    applyGeneratedQRToDOM(window.generatedQrDataUrl);
    return;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 800;
  canvas.height = 1200;

  const idSiswa = window.idSiswaGlobal || localStorage.getItem("idSiswa") || "-";
  const nama = localStorage.getItem("namaSiswa") || "-";
  const kelas = localStorage.getItem("kelasSiswa") || "-";
  const jurusan = getJurusan(kelas);

  try {
    const qrFinal = await generateQROffline(idSiswa);
    try {
      const bg = await loadImageCORS(window.templateQrUrl);
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    try {
      await document.fonts.load("700 64px Oswald");
      await document.fonts.load("400 48px Oswald");
    } catch (e) {}

    const qrSize = 480 * 0.9;
    const x = (canvas.width - qrSize) / 2;
    ctx.drawImage(qrFinal, x, 585, qrSize, qrSize);
    drawNamaKelasCenter(ctx, nama.toUpperCase(), jurusan.toUpperCase(), canvas.width / 2, 300, 600);

    const resultDataUrl = canvas.toDataURL("image/png");
    window.generatedQrDataUrl = resultDataUrl;
    window.isLoaded.qr = true;

    applyGeneratedQRToDOM(resultDataUrl);
  } catch (err) {
    console.error("❌ ERROR GENERATE QR CARD:", err);
    const skeleton = document.getElementById("qrDesktopSkeleton");
    if (skeleton) skeleton.textContent = "Gagal memuat Kartu QR";
  }
}

function applyGeneratedQRToDOM(dataUrl) {
  const elDesktopPreview = document.getElementById("qrPreviewDesktop");
  const elDesktopSkeleton = document.getElementById("qrDesktopSkeleton");
  const elModalPreview = document.getElementById("qrPreviewModal");

  if (elDesktopPreview) {
    elDesktopPreview.src = dataUrl;
    elDesktopPreview.style.display = "block";
  }
  if (elDesktopSkeleton) {
    elDesktopSkeleton.style.display = "none";
  }
  if (elModalPreview) {
    elModalPreview.src = dataUrl;
  }
}

function downloadQRCard() {
  const dataUrl =
    window.generatedQrDataUrl ||
    document.getElementById("qrPreviewDesktop")?.src ||
    document.getElementById("qrPreviewModal")?.src;

  if (!dataUrl || !dataUrl.startsWith("data:image")) {
    alert("Kartu QR sedang disiapkan, coba beberapa saat lagi.");
    return;
  }

  const link = document.createElement("a");
  link.href = dataUrl;
  const nama = localStorage.getItem("namaSiswa") || "Siswa";
  link.download = `QR_${nama.replace(/\s+/g, "_")}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Alias kompatibilitas jika masih ada pemanggilan lama
const downloadQRModal = downloadQRCard;

function toggleQRModalMobile() {
  const modal = document.getElementById("mobileQrOverlay");
  if (!modal) return;
  modal.classList.toggle("active");
  if (modal.classList.contains("active") && !window.isLoaded.qr) {
    generateQRCard();
  }
}

function closeQRModalMobile(e) {
  if (e && e.target.id === "mobileQrOverlay") {
    toggleQRModalMobile();
  }
}

function fitNamaText(ctx, nama, maxWidth) {
  let fontSize = 52;
  while (fontSize > 40) {
    ctx.font = `700 ${fontSize}px Oswald`;
    const words = nama.split(" ");
    let line = "";
    const lines = [];
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const width = ctx.measureText(testLine).width;
      if (width > maxWidth && n > 0) {
        lines.push(line.trim());
        line = words[n] + " ";
      } else {
        line = testLine;
      }
    }
    lines.push(line.trim());
    if (lines.length <= 3) return { fontSize, lines };
    fontSize -= 2;
  }
  return { fontSize: 40, lines: [nama] };
}

function drawNamaKelasCenter(ctx, nama, kelas, x, centerY, maxWidth) {
  const result = fitNamaText(ctx, nama, maxWidth);
  let fontSize = result.fontSize;
  const lines = result.lines;

  if (lines.length === 1) fontSize += 14;
  else if (lines.length === 2) fontSize += 6;
  fontSize = Math.min(fontSize, 72);

  const namaLineHeight = fontSize * 1.2;
  const kelasFontSize = Math.round(fontSize * 0.8);
  const gap = 10;
  const totalHeight = (lines.length * namaLineHeight) + gap + (kelasFontSize * 1.2);
  const startY = centerY - (totalHeight / 2) + namaLineHeight;

  ctx.fillStyle = "#824653";
  ctx.textAlign = "center";
  ctx.font = `700 ${fontSize}px Oswald`;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + (i * namaLineHeight));
  }

  ctx.font = `400 ${kelasFontSize}px Oswald`;
  ctx.fillText(kelas, x, startY + (lines.length * namaLineHeight) + gap);
}

function getJurusan(kelas) {
  if (!kelas) return "-";
  const kode = kelas.split(" ")[0];
  const map = {
    AKN: "AKUNTANSI",
    DKV: "DESAIN KOMUNIKASI VISUAL",
    FAR: "FARMASI",
    KLR: "KULINER",
    RPL: "REKAYASA PERANGKAT LUNAK",
    TKJ: "TEKNIK KOMPUTER DAN JARINGAN",
    TKR: "TEKNIK KENDARAAN RINGAN",
    TPM: "TEKNIK PEMESINAN",
    TSM: "TEKNIK SEPEDA MOTOR"
  };
  return map[kode] || kode;
}

// ==========================================================================
// 9. GRAFIK KURVA TREN PRESENSI (CANVAS)
// ==========================================================================
function renderTrendChart(filterRange = "1w", param1 = null, param2 = null) {
  const canvas = document.getElementById("trendChartCanvas");
  const wrapper = document.getElementById("chartInnerWrapper");
  if (!canvas || !wrapper) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  let rawData = [];
  if (window.AppStore.isLoaded && window.AppStore.rawPresensi.length > 0) {
    const collected = window.AppStore.getPresensiByRange(filterRange, param1, param2);
    rawData = collected.map(item => ({
      label: item.tanggal.slice(0, 5),
      status: item.statusMasuk
    }));
  } else {
    if (filterRange === "1w") {
      rawData = [
        { label: "26/10", status: "Tepat Waktu" },
        { label: "27/10", status: "Tepat Waktu" },
        { label: "28/10", status: "Terlambat" },
        { label: "29/10", status: "Sakit" },
        { label: "30/10", status: "Dispensasi" }
      ];
    } else if (filterRange === "1m") {
      for (let i = 1; i <= 20; i++) {
        const dayStr = String(i).padStart(2, "0");
        let st = "Tepat Waktu";
        if (i === 3) st = "Terlambat";
        if (i === 7) st = "Sangat Terlambat";
        if (i === 12) st = "Sakit";
        if (i === 15) st = "Prakerin";
        if (i === 18) st = "Alpa";
        rawData.push({ label: `${dayStr}/10`, status: st });
      }
    } else {
      for (let i = 1; i <= 60; i++) {
        const month = i <= 30 ? "09" : "10";
        const day = String((i % 30) || 30).padStart(2, "0");
        rawData.push({ label: `${day}/${month}`, status: i % 8 === 0 ? "Terlambat" : "Tepat Waktu" });
      }
    }
  }

  const levelColors = {
    8: "#15803d",
    7: "#d97706",
    6: "#c2410c",
    5: "#b91c1c",
    4: "#7c3aed",
    3: "#0284c7",
    2: "#0891b2",
    1: "#111827"
  };

  function getStatusInfo(statusStr) {
    const s = String(statusStr || "").toLowerCase();
    if (s.includes("prakerin") || s.includes("dispensasi") || s.includes("tepat")) return { level: 8, color: levelColors[8], fullName: "Tepat Waktu" };
    if (s.includes("sangat terlambat sekali")) return { level: 5, color: levelColors[5], fullName: "Sangat Terlambat Sekali" };
    if (s.includes("sangat terlambat")) return { level: 6, color: levelColors[6], fullName: "Sangat Terlambat" };
    if (s.includes("terlambat")) return { level: 7, color: levelColors[7], fullName: "Terlambat" };
    if (s.includes("tidak presensi")) return { level: 4, color: levelColors[4], fullName: "Hadir Tidak Presensi" };
    if (s.includes("izin")) return { level: 3, color: levelColors[3], fullName: "Izin" };
    if (s.includes("sakit")) return { level: 2, color: levelColors[2], fullName: "Sakit" };
    if (s.includes("alpa")) return { level: 1, color: levelColors[1], fullName: "Alpa" };
    return { level: 8, color: levelColors[8], fullName: "Tepat Waktu" };
  }

  window.currentChartData = rawData.map(item => {
    const st = getStatusInfo(item.status);
    return { label: item.label, val: st.level, color: st.color, fullName: st.fullName };
  });

  const sampleData = window.currentChartData;
  const parentWidth = document.getElementById("chartScrollContainer").clientWidth;
  let computedWidth = parentWidth;

  if (filterRange !== "1w") {
    const pointSpacing = 58;
    if (sampleData.length * pointSpacing > parentWidth) {
      computedWidth = sampleData.length * pointSpacing;
    }
  }

  wrapper.style.width = computedWidth + "px";
  canvas.width = computedWidth * dpr;
  canvas.height = wrapper.clientHeight * dpr;
  ctx.scale(dpr, dpr);

  const width = computedWidth;
  const height = wrapper.clientHeight;
  ctx.clearRect(0, 0, width, height);

  if (sampleData.length === 0) {
    ctx.font = "500 12px Roboto";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.fillText("Belum ada data presensi pada periode ini", width / 2, height / 2);
    return;
  }

  const axisXPos = 3;
  const paddingLeft = filterRange === "1w" ? 42 : 46;
  const paddingRight = filterRange === "1w" ? 36 : 28;
  const paddingTop = 22;
  const paddingBottom = 48;

  const graphWidth = width - paddingLeft - paddingRight;
  const graphHeight = height - paddingTop - paddingBottom;
  const minY = 1;
  const maxY = 8;

  function getX(index) {
    if (sampleData.length === 1) return paddingLeft + graphWidth / 2;
    return paddingLeft + (index / (sampleData.length - 1)) * graphWidth;
  }

  function getY(val) {
    return paddingTop + graphHeight - ((val - minY) / (maxY - minY)) * graphHeight;
  }

  sampleData.forEach((item, i) => {
    item.x = getX(i);
    item.y = getY(item.val);
  });

  const bottomAxisY = height - 20;

  ctx.beginPath();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.moveTo(axisXPos, paddingTop);
  ctx.lineTo(axisXPos, bottomAxisY);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.moveTo(axisXPos, bottomAxisY);
  ctx.lineTo(width - (paddingRight - 10), bottomAxisY);
  ctx.stroke();

  for (let level = 1; level <= 8; level++) {
    const yPos = getY(level);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(axisXPos + 5, yPos);
    ctx.lineTo(width - (paddingRight - 10), yPos);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(axisXPos, yPos, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = levelColors[level] || "#94a3b8";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.setLineDash([]);

  const primaryStroke = getComputedStyle(document.documentElement).getPropertyValue("--header-bg").trim() || "#824653";

  if (sampleData.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = primaryStroke;
    ctx.lineWidth = 2.5;

    for (let i = 0; i < sampleData.length; i++) {
      const x = sampleData[i].x;
      const y = sampleData[i].y;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevX = sampleData[i - 1].x;
        const prevY = sampleData[i - 1].y;
        const cpX1 = prevX + (x - prevX) / 2;
        const cpX2 = prevX + (x - prevX) / 2;
        ctx.bezierCurveTo(cpX1, prevY, cpX2, y, x, y);
      }
    }
    ctx.stroke();
  }

  if (window.selectedDotIndex !== null && sampleData[window.selectedDotIndex]) {
    const selectedItem = sampleData[window.selectedDotIndex];
    ctx.strokeStyle = primaryStroke;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(selectedItem.x, paddingTop);
    ctx.lineTo(selectedItem.x, bottomAxisY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(axisXPos, selectedItem.y);
    ctx.lineTo(width - (paddingRight - 10), selectedItem.y);
    ctx.stroke();

    ctx.setLineDash([]);
  }

  sampleData.forEach((item, index) => {
    const isSelected = window.selectedDotIndex === index;

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(item.x, item.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(130, 70, 83, 0.25)";
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(item.x, item.y, isSelected ? 6.5 : 5, 0, Math.PI * 2);
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    const maxLabelWidth = 55;
    const words = item.fullName.split(" ");
    const lines = [];
    let currentLine = words[0];

    for (let w = 1; w < words.length; w++) {
      ctx.font = "400 9px Roboto";
      const testLine = currentLine + " " + words[w];
      if (ctx.measureText(testLine).width > maxLabelWidth) {
        lines.push(currentLine);
        currentLine = words[w];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);

    ctx.font = "400 9px Roboto";
    ctx.textAlign = "center";
    const startTextY = item.y + 13;

    lines.forEach((lineText, lineIdx) => {
      const lineY = startTextY + (lineIdx * 10);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeText(lineText, item.x, lineY);
      ctx.fillStyle = item.color;
      ctx.fillText(lineText, item.x, lineY);
    });

    ctx.fillStyle = isSelected ? "#0f172a" : "#64748b";
    ctx.font = isSelected ? "700 10.5px Roboto" : "500 10px Roboto";
    ctx.fillText(item.label, item.x, height - 6);
  });
}

function attachChartClickInteraction() {
  const canvas = document.getElementById("trendChartCanvas");
  if (!canvas || canvas.dataset.hasClickListener) return;
  canvas.dataset.hasClickListener = "true";

  let startX = 0;
  let startY = 0;

  canvas.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  canvas.addEventListener("touchend", e => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    if (Math.abs(endX - startX) > 8 || Math.abs(endY - startY) > 8) return;
    processDotClick(endX, endY, canvas);
  });

  canvas.addEventListener("click", e => {
    processDotClick(e.clientX, e.clientY, canvas);
  });
}

function processDotClick(clientX, clientY, canvas) {
  const rect = canvas.getBoundingClientRect();
  const clickX = clientX - rect.left;

  let clickedIndex = null;
  let minHorizontalDist = Infinity;

  const data = window.currentChartData || [];
  data.forEach((item, i) => {
    const xDist = Math.abs(item.x - clickX);
    if (xDist < minHorizontalDist && xDist <= 32) {
      minHorizontalDist = xDist;
      clickedIndex = i;
    }
  });

  if (clickedIndex !== null) {
    window.selectedDotIndex = window.selectedDotIndex === clickedIndex ? null : clickedIndex;
  } else {
    window.selectedDotIndex = null;
  }

  const activeRange = document.getElementById("filterTimelineStatistik")?.getAttribute("data-value") || "1w";
  renderTrendChart(activeRange);
}

// ==========================================================================
// 10. CUSTOM DROPDOWN ENGINE & TIMELINE FILTER HANDLERS
// ==========================================================================
function createCustomDropdown(containerElement, optionsArray, selectedValue, onSelectCallback) {
  containerElement.className = "custom-dropdown";
  containerElement.innerHTML = `
    <div class="dropdown-selected">
      <span class="dropdown-text"></span>
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
    <div class="dropdown-menu"></div>
  `;

  const textSpan = containerElement.querySelector(".dropdown-text");
  const menu = containerElement.querySelector(".dropdown-menu");
  const selectedBox = containerElement.querySelector(".dropdown-selected");

  const currentObj = optionsArray.find(opt => opt.value === selectedValue) || optionsArray[0];
  textSpan.innerText = currentObj.label;
  containerElement.setAttribute("data-value", currentObj.value);

  optionsArray.forEach(item => {
    const div = document.createElement("div");
    div.className = `dropdown-item ${item.class || ""}`;
    div.setAttribute("data-value", item.value);
    div.innerText = item.label;
    menu.appendChild(div);
  });

  selectedBox.onclick = function (e) {
    e.stopPropagation();
    if (containerElement.classList.contains("open")) {
      closeCustomDropdown(containerElement);
      return;
    }
    openCustomDropdown(containerElement);
  };

  menu.onclick = function (e) {
    e.stopPropagation();
    const item = e.target.closest(".dropdown-item");
    if (!item) return;

    const value = item.getAttribute("data-value");
    const label = item.innerText;

    textSpan.innerText = label;
    containerElement.setAttribute("data-value", value);
    closeCustomDropdown(containerElement);

    if (typeof onSelectCallback === "function") {
      onSelectCallback(value, label);
    }
  };
}

function closeCustomDropdown(dropdown) {
  if (!dropdown) return;
  dropdown.classList.remove("open", "drop-up");
  const menu = dropdown.querySelector(".dropdown-menu");
  if (!menu) return;
  menu.style.removeProperty("top");
  menu.style.removeProperty("bottom");
  menu.style.removeProperty("margin-top");
  menu.style.removeProperty("margin-bottom");
  menu.style.removeProperty("max-height");
  menu.style.removeProperty("overflow-y");
}

function openCustomDropdown(dropdown) {
  if (!dropdown) return;
  const menu = dropdown.querySelector(".dropdown-menu");
  if (!menu) return;

  document.querySelectorAll(".custom-dropdown.open").forEach(el => {
    if (el !== dropdown) closeCustomDropdown(el);
  });

  dropdown.classList.remove("drop-up");
  dropdown.classList.add("open");

  menu.style.setProperty("top", "calc(100% + 4px)", "important");
  menu.style.setProperty("bottom", "auto", "important");
  menu.style.setProperty("max-height", "250px", "important");
  menu.style.setProperty("overflow-y", "auto", "important");

  const rect = dropdown.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8);
  const spaceAbove = Math.max(0, rect.top - 8);
  const menuHeight = Math.min(menu.scrollHeight, 250);
  const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

  if (openUp) {
    dropdown.classList.add("drop-up");
    menu.style.setProperty("top", "auto", "important");
    menu.style.setProperty("bottom", "calc(100% + 4px)", "important");
  }

  const availableSpace = openUp ? spaceAbove : spaceBelow;
  if (availableSpace < menuHeight) {
    menu.style.setProperty("max-height", Math.max(80, availableSpace) + "px", "important");
  }
}

function initTimelineDropdown() {
  const container = document.getElementById("filterTimelineStatistik");
  if (!container || container.querySelector(".dropdown-selected")) return;

  const timelineOptions = [
    { value: "1w", label: "📅 1 Minggu (5 Hari KBM)" },
    { value: "1m", label: "🗓️ 1 Bulan Terakhir" },
    { value: "semester_select", label: "🎓 Per Semester..." },
    { value: "ta_select", label: "🏫 Per Tahun Ajaran..." },
    { value: "custom", label: "⚙️ Kustom Rentang Tanggal..." }
  ];

  createCustomDropdown(container, timelineOptions, "1w", function (selectedVal) {
    const customBox = document.getElementById("customDateRangeBox");
    const semesterBox = document.getElementById("semesterSelectBox");
    const taBox = document.getElementById("thnAjaranSelectBox");

    if (customBox) customBox.style.display = "none";
    if (semesterBox) semesterBox.style.display = "none";
    if (taBox) taBox.style.display = "none";

    if (selectedVal === "custom") {
      if (customBox) customBox.style.display = "block";
    } else if (selectedVal === "semester_select") {
      if (semesterBox) semesterBox.style.display = "block";
    } else if (selectedVal === "ta_select") {
      if (taBox) taBox.style.display = "block";
    } else {
      renderTrendChart(selectedVal);
    }
  });
}

function applySemesterFilter() {
  const ta = document.getElementById("selectTaForSemester").value;
  const sem = document.getElementById("selectSemesterType").value;
  renderTrendChart("semester", ta, sem);
}

function applyTahunAjaranFilter() {
  const taFull = document.getElementById("selectTahunAjaranFull").value;
  renderTrendChart("tahun_ajaran", taFull);
}

function applyCustomDateRange() {
  const startDate = document.getElementById("inputDateStart").value;
  const endDate = document.getElementById("inputDateEnd").value;

  if (!startDate || !endDate) {
    alert("Harap isi tanggal Mulai dan Selesai!");
    return;
  }

  renderTrendChart("custom", startDate, endDate);
}

// ==========================================================================
// 11. SPINNER, SESSION INIT & LOGOUT
// ==========================================================================
function showSpinner(text = "Loading...") {
  const overlay = document.getElementById("loadingOverlay");
  const loadingText = document.getElementById("loadingText");
  if (loadingText) loadingText.textContent = text;
  window.loadingCount++;
  if (overlay) overlay.classList.add("active");
}

function hideSpinner() {
  const overlay = document.getElementById("loadingOverlay");
  window.loadingCount--;
  if (window.loadingCount <= 0) {
    window.loadingCount = 0;
    if (overlay) overlay.classList.remove("active");
  }
}

function logout() {
  showSpinner("Logout...");
  localStorage.removeItem("idSiswa");
  localStorage.removeItem("namaSiswa");
  localStorage.removeItem("kelasSiswa");
  localStorage.removeItem("idRombel");
  localStorage.removeItem("sisensi_siswa_user");
  window.location.replace("/");
}

function updateTanggalSekarang() {
  const options = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
  const hariIni = new Date().toLocaleDateString("id-ID", options);
  const el = document.getElementById("tanggalHariIni");
  if (el) el.textContent = hariIni;
}

function initFormSiswa() {
  if (window.__INIT_CALLED) return;
  window.__INIT_CALLED = true;

  const idSiswa = localStorage.getItem("idSiswa");
  if (!idSiswa) {
    window.location.replace("/");
    return;
  }

  window.idSiswaGlobal = idSiswa;

  const nama = localStorage.getItem("namaSiswa") || "Siswa";
  const kelas = localStorage.getItem("kelasSiswa") || "-";
  const initial = nama.trim().charAt(0).toUpperCase() || "S";
  const jurusan = getJurusan(kelas);

  // Header & Greeting
  const elNama = document.getElementById("namaSiswa");
  const elKelas = document.getElementById("kelasSiswa");
  const elHeaderAvatar = document.getElementById("headerAvatarInitial");
  const elBadgeNis = document.getElementById("badgeNisSiswa");

  if (elNama) elNama.textContent = nama;
  if (elKelas) elKelas.textContent = kelas;
  if (elHeaderAvatar) elHeaderAvatar.textContent = initial;
  if (elBadgeNis) elBadgeNis.textContent = idSiswa;

  // Tab Profil
  const elProfilAvatar = document.getElementById("profilAvatarLarge");
  const elProfilNama = document.getElementById("profilNama");
  const elProfilKelas = document.getElementById("profilNamaKelas");
  const elProfilNis = document.getElementById("profilNis");
  const elProfilJurusan = document.getElementById("profilJurusan");

  if (elProfilAvatar) elProfilAvatar.textContent = initial;
  if (elProfilNama) elProfilNama.textContent = nama;
  if (elProfilKelas) elProfilKelas.textContent = kelas;
  if (elProfilNis) elProfilNis.textContent = idSiswa;
  if (elProfilJurusan) elProfilJurusan.textContent = jurusan;

  initThemeUI();
  setGreeting();
  loadSystemBranding().then(() => {
    generateQRCard();
  });
  loadHariIni(idSiswa);
  window.isLoaded.hariIni = true;
  loadRingkasanBeranda(idSiswa);
}

// Global Click Listener untuk menutup Dropdown & Theme Popover
document.addEventListener("click", function (e) {
  if (!e.target.closest(".custom-dropdown")) {
    document.querySelectorAll(".custom-dropdown.open").forEach(el => closeCustomDropdown(el));
  }
  if (!e.target.closest(".theme-picker-wrapper")) {
    document.getElementById("themePopover")?.classList.remove("open");
  }
});

document.addEventListener("DOMContentLoaded", function () {
  updateTanggalSekarang();
  initFormSiswa();
});