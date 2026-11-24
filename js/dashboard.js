/* ==========================================================================
   PORTAL PRESENSI SISWA - SMK MEDIKACOM BANDUNG
   ========================================================================== */

const API_URL = "https://script.google.com/macros/s/AKfycbwyq41g1nO7l_31g9sK_o2J1jZ4z99b6aK_x9R0bO-jX1o5X6qK2yO3G_kM4X-eM9wM/exec";
const idSiswa = localStorage.getItem("idSiswa");
const namaSiswa = localStorage.getItem("namaSiswa") || "Siswa";
const kelasSiswa = localStorage.getItem("kelasSiswa") || "-";

if (!idSiswa) {
  window.location.replace("/");
}

const THEME_PALETTES = {
  burgundy: { primary: "#824653", soft: "#9b5c69", glow: "rgba(130, 70, 83, 0.25)", bg: "#fdf2f4" },
  ocean:    { primary: "#2563eb", soft: "#60a5fa", glow: "rgba(37, 99, 235, 0.25)", bg: "#eff6ff" },
  emerald:  { primary: "#059669", soft: "#34d399", glow: "rgba(5, 150, 105, 0.25)", bg: "#ecfdf5" },
  royal:    { primary: "#7c3aed", soft: "#a78bfa", glow: "rgba(124, 58, 237, 0.25)", bg: "#f5f3ff" },
  sunset:   { primary: "#ea580c", soft: "#fb923c", glow: "rgba(234, 88, 12, 0.25)", bg: "#fff7ed" },
  teal:     { primary: "#0d9488", soft: "#2dd4bf", glow: "rgba(13, 148, 136, 0.25)", bg: "#f0fdfa" },
  indigo:   { primary: "#4f46e5", soft: "#818cf8", glow: "rgba(79, 70, 229, 0.25)", bg: "#eef2ff" },
  slate:    { primary: "#475569", soft: "#94a3b8", glow: "rgba(71, 85, 105, 0.25)", bg: "#f1f5f9" }
};

let currentTheme = localStorage.getItem("sisensi_active_theme") || "burgundy";
let cachedData = null;
let cachedQrDataUrl = "";
let currentAnalyticsMode = "chart";
let chartDotPoints = [];
let selectedDotIndex = -1;
let isDraggingChart = false;

/* Dummy Riwayat Izin Meninggalkan Sekolah */
let dummyIzinHistoryList = [
  {
    id: "IZN-001",
    tanggal: "18 Nov 2026",
    jenis: "Izin Keluar Sementara",
    jamKeluar: "10:15",
    jamKembali: "11:20",
    alasan: "Mengurus administrasi KTP / Kartu Pelajar di kelurahan.",
    status: "Disetujui Piket"
  },
  {
    id: "IZN-002",
    tanggal: "04 Nov 2026",
    jenis: "Izin Pulang Awal",
    jamKeluar: "12:30",
    jamKembali: "-",
    alasan: "Kontrol rutin dokter gigi (surat rujukan terlampir).",
    status: "Disetujui Piket"
  }
];

/* Data Klasemen Kedisiplinan */
function getKlasemenDataList() {
  const baseList = [
    { rank: 1, nama: "Alya Putri Rahmadani", kelas: "XII Farmasi 1", tepatWaktu: "100%", poin: 995, isMe: false },
    { rank: 2, nama: "Muhammad Rizky Pratama", kelas: "XI TKJ 2", tepatWaktu: "100%", poin: 990, isMe: false },
    { rank: 3, nama: "Nadia Khairunnisa", kelas: "XII Keperawatan 1", tepatWaktu: "99.4%", poin: 984, isMe: false },
    { rank: 4, nama: "Fajar Nugraha", kelas: "XI RPL 1", tepatWaktu: "99.1%", poin: 978, isMe: false },
    { rank: 5, nama: "Siti Nurhaliza", kelas: "X Farmasi 2", tepatWaktu: "98.8%", poin: 972, isMe: false },
    { rank: 14, nama: namaSiswa, kelas: kelasSiswa, tepatWaktu: "96.5%", poin: 942, isMe: true }
  ];

  // Jika nama siswa kebetulan sama dengan salah satu top 5, tandai isMe
  const exactMatch = baseList.find((item, idx) => idx < 5 && item.nama.toLowerCase() === namaSiswa.toLowerCase());
  if (exactMatch) {
    exactMatch.isMe = true;
    return baseList.slice(0, 5);
  }
  return baseList;
}

/* ==========================================================================
   CUSTOM DROPDOWN ENGINE
   ========================================================================== */
const CUSTOM_SELECT_INSTANCES = {};

function initCustomSelect(containerId, options, defaultValue, onChangeCallback) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.classList.add("custom-select-container");
  container.dataset.value = defaultValue;

  const initialOpt = options.find(o => o.value === defaultValue) || options[0] || { label: "Pilih...", value: "" };

  container.innerHTML = `
    <div class="custom-select-trigger" tabindex="0" role="button" aria-haspopup="listbox" aria-expanded="false">
      <span class="custom-select-label">${initialOpt.label}</span>
      <svg class="custom-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
    <div class="custom-select-menu" role="listbox">
      ${options.map(opt => `
        <div class="custom-select-option ${opt.value === initialOpt.value ? "selected" : ""}" data-value="${opt.value}" role="option">
          ${opt.label}
        </div>
      `).join("")}
    </div>
  `;

  const trigger = container.querySelector(".custom-select-trigger");
  const labelEl = container.querySelector(".custom-select-label");
  const menu = container.querySelector(".custom-select-menu");

  function closeMenu() {
    container.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    Object.values(CUSTOM_SELECT_INSTANCES).forEach(inst => {
      if (inst && inst.container !== container) inst.close();
    });
    container.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    container.classList.contains("open") ? closeMenu() : openMenu();
  });

  menu.addEventListener("click", (e) => {
    const optEl = e.target.closest(".custom-select-option");
    if (!optEl) return;
    e.stopPropagation();

    const val = optEl.dataset.value;
    const text = optEl.textContent.trim();

    container.dataset.value = val;
    labelEl.textContent = text;
    menu.querySelectorAll(".custom-select-option").forEach(el => el.classList.remove("selected"));
    optEl.classList.add("selected");

    closeMenu();
    if (typeof onChangeCallback === "function") onChangeCallback(val, text);
  });

  const instance = {
    container,
    getValue: () => container.dataset.value,
    getLabel: () => labelEl.textContent.trim(),
    close: closeMenu
  };
  CUSTOM_SELECT_INSTANCES[containerId] = instance;
  return instance;
}

/* ==========================================================================
   INITIALIZATION & THEME SYNC
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  setAppTheme(currentTheme, false);
  populateIdentityUI();
  initGreetingAndRank();
  initFilterTimeline();
  initChartDragScroll();
  renderRiwayatIzinModal();
  loadDashboardData();
});

document.addEventListener("click", (e) => {
  const themeWrap = document.querySelector(".theme-picker-wrapper");
  const themePop = document.getElementById("themePopover");
  if (themeWrap && themePop && !themeWrap.contains(e.target)) {
    themePop.classList.remove("open", "is-open");
  }

  const profWrap = document.querySelector(".user-profile-wrapper");
  const profPop = document.getElementById("profilePopover");
  if (profWrap && profPop && !profWrap.contains(e.target)) {
    profPop.classList.remove("open", "is-open");
  }

  if (!e.target.closest(".custom-select-container")) {
    Object.values(CUSTOM_SELECT_INSTANCES).forEach(inst => inst && inst.close());
  }
});

function toggleThemePopover(e) {
  if (e) e.stopPropagation();
  const pop = document.getElementById("themePopover");
  const profPop = document.getElementById("profilePopover");
  if (profPop) profPop.classList.remove("open", "is-open");
  if (pop) pop.classList.toggle("open");
}

function toggleProfilePopover(e) {
  if (e) e.stopPropagation();
  const pop = document.getElementById("profilePopover");
  const themePop = document.getElementById("themePopover");
  if (themePop) themePop.classList.remove("open", "is-open");
  if (pop) pop.classList.toggle("is-open");
}

function setAppTheme(themeKey, regenerateQr = true) {
  if (!THEME_PALETTES[themeKey]) themeKey = "burgundy";
  currentTheme = themeKey;
  localStorage.setItem("sisensi_active_theme", themeKey);

  document.documentElement.setAttribute("data-theme", themeKey);
  document.body.setAttribute("data-theme", themeKey);

  document.querySelectorAll(".theme-swatch-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.themeVal === themeKey);
  });

  const themePop = document.getElementById("themePopover");
  if (themePop) themePop.classList.remove("open", "is-open");

  if (regenerateQr) {
    cachedQrDataUrl = "";
    if (document.getElementById("qrModalOverlay")?.classList.contains("active")) {
      generateAndCacheQRCard();
    }
  }

  if (cachedData) {
    renderTrendChart(cachedData.riwayat || []);
  }
}

/* ==========================================================================
   IDENTITAS, SAPAAN & PERINGKAT KEDISIPLINAN
   ========================================================================== */
function populateIdentityUI() {
  const initial = (namaSiswa.trim()[0] || "S").toUpperCase();

  setText("namaSiswa", namaSiswa);
  setText("kelasSiswa", kelasSiswa);
  setText("greetingStudentName", namaSiswa);

  setText("profilAvatarLarge", initial);
  setText("profilNama", namaSiswa);
  setText("profilNamaKelas", kelasSiswa);
  setText("profilNis", idSiswa);

  setText("modalBiodataAvatar", initial);
  setText("modalBiodataNama", namaSiswa);
  setText("modalBiodataKelas", kelasSiswa);
  setText("modalBiodataNis", idSiswa);

  // Extract jurusan dari nama kelas jika tersedia
  let jurusan = "Kompetensi Keahlian Terdaftar";
  const upperKelas = kelasSiswa.toUpperCase();
  if (upperKelas.includes("FARMASI")) jurusan = "Farmasi Klinis dan Komunitas";
  else if (upperKelas.includes("PERAWAT") || upperKelas.includes("KEPERAWATAN")) jurusan = "Asisten Keperawatan";
  else if (upperKelas.includes("RPL")) jurusan = "Rekayasa Perangkat Lunak";
  else if (upperKelas.includes("TKJ")) jurusan = "Teknik Komputer dan Jaringan";
  else if (upperKelas.includes("TLM") || upperKelas.includes("ANALIS")) jurusan = "Teknologi Laboratorium Medik";

  setText("profilJurusan", jurusan);
  setText("modalBiodataJurusan", jurusan);
  setText("profilNisn", localStorage.getItem("nisnSiswa") || "-");
  setText("modalBiodataNisn", localStorage.getItem("nisnSiswa") || "-");
  setText("profilJk", localStorage.getItem("jkSiswa") || "-");
  setText("modalBiodataJk", localStorage.getItem("jkSiswa") || "-");
  setText("profilTtl", localStorage.getItem("ttlSiswa") || "-");
  setText("modalBiodataTtl", localStorage.getItem("ttlSiswa") || "-");
}

function initGreetingAndRank() {
  const hour = new Date().getHours();
  let salutation = "Selamat Malam 🌙";
  if (hour >= 4 && hour < 11) salutation = "Selamat Pagi ☀️";
  else if (hour >= 11 && hour < 15) salutation = "Selamat Siang 🌤️";
  else if (hour >= 15 && hour < 18) salutation = "Selamat Sore 🌇";

  setText("greetingSalutation", salutation);

  const myRow = getKlasemenDataList().find(item => item.isMe);
  if (myRow) {
    setText("rankNumber", `#${myRow.rank}`);
  }
}

/* ==========================================================================
   FETCH DATA UTAMA & PRESENSI HARI INI
   ========================================================================== */
async function loadDashboardData() {
  showLoading(true, "Memuat data presensi...");
  try {
    const res = await fetch(`${API_URL}?action=getDashboardSiswa&idSiswa=${encodeURIComponent(idSiswa)}`);
    const json = await res.json();

    if (json && json.status === "success") {
      cachedData = json;
      renderTodaySection(json.hariIni || {});
      if (json.biodata) updateBiodataFromApi(json.biodata);
      handleTimelineChange("1w");
    } else {
      throw new Error(json?.message || "Gagal memuat data");
    }
  } catch (err) {
    console.warn("Menggunakan fallback data lokal:", err);
    cachedData = buildFallbackData();
    renderTodaySection(cachedData.hariIni);
    handleTimelineChange("1w");
  } finally {
    showLoading(false);
  }
}

function updateBiodataFromApi(bio) {
  if (bio.nisn) {
    setText("profilNisn", bio.nisn);
    setText("modalBiodataNisn", bio.nisn);
  }
  if (bio.jurusan) {
    setText("profilJurusan", bio.jurusan);
    setText("modalBiodataJurusan", bio.jurusan);
  }
  if (bio.jenisKelamin) {
    setText("profilJk", bio.jenisKelamin);
    setText("modalBiodataJk", bio.jenisKelamin);
  }
  if (bio.ttl) {
    setText("profilTtl", bio.ttl);
    setText("modalBiodataTtl", bio.ttl);
  }
}

function renderTodaySection(today) {
  const nowStr = today.tanggal || new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  setText("tanggalHariIni", nowStr);

  const jamMasuk = today.jamMasuk || "-";
  const statusMasuk = today.statusMasuk || "Belum Presensi";
  const jamPulang = today.jamPulang || "-";
  const statusPulang = today.statusPulang || "Belum Presensi";

  setText("jamMasuk", jamMasuk);
  setText("jamPulang", jamPulang);

  const elStatusMasuk = document.getElementById("statusMasuk");
  if (elStatusMasuk) {
    elStatusMasuk.textContent = statusMasuk;
    elStatusMasuk.className = "status-text " + getStatusTextClass(statusMasuk);
  }

  const elStatusPulang = document.getElementById("statusPulang");
  if (elStatusPulang) {
    elStatusPulang.textContent = statusPulang;
    elStatusPulang.className = "status-text " + getStatusTextClass(statusPulang);
  }
}

function getStatusTextClass(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("tepat") || s.includes("hadir") || s.includes("pulang")) return "status-text-hadir";
  if (s.includes("terlambat")) return "status-text-terlambat";
  if (s.includes("alpa")) return "status-text-alpa";
  if (s.includes("sakit")) return "status-text-sakit";
  if (s.includes("izin")) return "status-text-izin";
  if (s.includes("prakerin") || s.includes("dispensasi")) return "status-text-prakerin";
  return "";
}

/* ==========================================================================
   FILTER TIMELINE, REKAP BOX & PILL KEDISIPLINAN
   ========================================================================== */
function initFilterTimeline() {
  const options = [
    { value: "1w", label: "1 Minggu Terakhir" },
    { value: "1m", label: "1 Bulan Terakhir" },
    { value: "semester", label: "Per Semester" },
    { value: "ta", label: "Per Tahun Ajaran" },
    { value: "custom", label: "Kustom Rentang Tanggal" }
  ];

  initCustomSelect("filterTimelineStatistik", options, "1w", (val) => {
    handleTimelineChange(val);
  });

  populateSemesterAndTaDropdowns();
}

function populateSemesterAndTaDropdowns() {
  const now = new Date();
  const y = now.getFullYear();
  const taList = [`${y - 1}/${y}`, `${y}/${y + 1}`];

  const selTaSem = document.getElementById("selectTaForSemester");
  const selTaFull = document.getElementById("selectTahunAjaranFull");

  if (selTaSem) {
    selTaSem.innerHTML = taList.map(ta => `<option value="${ta}">TA ${ta}</option>`).join("");
    selTaSem.value = taList[1];
  }
  if (selTaFull) {
    selTaFull.innerHTML = taList.map(ta => `<option value="${ta}">TA ${ta}</option>`).join("");
    selTaFull.value = taList[1];
  }
  updateSemesterDropdownOptions();
}

function updateSemesterDropdownOptions() {
  const selSem = document.getElementById("selectSemesterType");
  if (!selSem) return;
  selSem.innerHTML = `
    <option value="ganjil">Semester Ganjil (Jul - Des)</option>
    <option value="genap">Semester Genap (Jan - Jun)</option>
  `;
}

function handleTimelineChange(val) {
  const semBox = document.getElementById("semesterSelectBox");
  const taBox = document.getElementById("thnAjaranSelectBox");
  const custBox = document.getElementById("customDateRangeBox");

  if (semBox) semBox.style.display = val === "semester" ? "flex" : "none";
  if (taBox) taBox.style.display = val === "ta" ? "flex" : "none";
  if (custBox) custBox.style.display = val === "custom" ? "flex" : "none";

  const titleMap = {
    "1w": "Riwayat Presensi 1 Minggu Terakhir",
    "1m": "Riwayat Presensi 1 Bulan Terakhir",
    "semester": "Riwayat Presensi Per Semester",
    "ta": "Riwayat Presensi Per Tahun Ajaran",
    "custom": "Riwayat Presensi Rentang Kustom"
  };
  setText("leftPaneTitle", titleMap[val] || "Riwayat Presensi Siswa");

  if (val === "1w" || val === "1m") {
    filterAndRenderHistory(val);
  }
}

function applySemesterFilter() {
  const ta = document.getElementById("selectTaForSemester")?.value || "";
  const sem = document.getElementById("selectSemesterType")?.value || "ganjil";
  setText("leftPaneTitle", `Riwayat Presensi Semester ${sem === "ganjil" ? "Ganjil" : "Genap"} (${ta})`);
  filterAndRenderHistory("semester");
}

function applyTahunAjaranFilter() {
  const ta = document.getElementById("selectTahunAjaranFull")?.value || "";
  setText("leftPaneTitle", `Riwayat Presensi Tahun Ajaran ${ta}`);
  filterAndRenderHistory("ta");
}

function applyCustomDateRange() {
  const start = document.getElementById("inputDateStart")?.value;
  const end = document.getElementById("inputDateEnd")?.value;
  if (!start || !end) {
    alert("Pilih tanggal mulai dan tanggal akhir terlebih dahulu.");
    return;
  }
  setText("leftPaneTitle", `Riwayat Presensi (${start} s/d ${end})`);
  filterAndRenderHistory("custom", { start, end });
}

function filterAndRenderHistory(mode, range = {}) {
  const allRows = (cachedData && Array.isArray(cachedData.riwayat)) ? cachedData.riwayat : [];
  let filtered = [...allRows];

  if (mode === "1w") {
    filtered = allRows.slice(-7);
  } else if (mode === "1m") {
    filtered = allRows.slice(-22);
  } else if (mode === "custom" && range.start && range.end) {
    const sTime = new Date(range.start).getTime();
    const eTime = new Date(range.end).getTime();
    filtered = allRows.filter(r => {
      if (!r.isoDate) return true;
      const t = new Date(r.isoDate).getTime();
      return t >= sTime && t <= eTime;
    });
  }

  hitungRekapBox(filtered);
  updateHistoryWarningPill(filtered);
  renderTabelPresensi(filtered);
  renderTrendChart(filtered);
}

function hitungRekapBox(rows) {
  let tepat = 0, terlambat = 0, htp = 0, daring = 0, sakit = 0, izin = 0, alpa = 0;

  rows.forEach(r => {
    const st = (r.status || "").toLowerCase();
    if (st.includes("tepat")) tepat++;
    else if (st.includes("terlambat")) terlambat++;
    else if (st.includes("tidak presensi") || st === "htp") htp++;
    else if (st.includes("prakerin") || st.includes("dispensasi")) daring++;
    else if (st.includes("sakit")) sakit++;
    else if (st.includes("izin")) izin++;
    else if (st.includes("alpa")) alpa++;
  });

  const totalHadir = tepat + terlambat + htp + daring;
  const totalHari = totalHadir + sakit + izin + alpa;
  const ratePersen = totalHari > 0 ? Math.round((totalHadir / totalHari) * 100) : 100;

  setText("boxTepat", tepat);
  setText("boxTerlambat", terlambat);
  setText("boxHtp", htp);
  setText("boxDaring", daring);
  setText("boxTotalHadir", totalHadir);
  setText("boxSakit", sakit);
  setText("boxIzin", izin);
  setText("boxAlpa", alpa);
  setText("boxRatePersen", `${ratePersen}%`);
}

function updateHistoryWarningPill(rows) {
  const pill = document.getElementById("histLateWarningPill");
  if (!pill) return;

  let lateCount = 0;
  let alpaCount = 0;
  rows.forEach(r => {
    const st = (r.status || "").toLowerCase();
    if (st.includes("terlambat")) lateCount++;
    if (st.includes("alpa")) alpaCount++;
  });

  pill.classList.remove("is-good", "is-warning", "is-danger");

  if (alpaCount >= 2 || lateCount >= 4) {
    pill.classList.add("is-danger");
    pill.textContent = `Perlu Perhatian (${lateCount} Terlambat, ${alpaCount} Alpa)`;
  } else if (lateCount >= 1 || alpaCount === 1) {
    pill.classList.add("is-warning");
    pill.textContent = `${lateCount}x Terlambat • Tetap Jaga Disiplin`;
  } else {
    pill.classList.add("is-good");
    pill.textContent = "Disiplin Sangat Baik";
  }
}

/* ==========================================================================
   SWITCH MODE KURVA VS LOG & TABEL RIWAYAT
   ========================================================================== */
function switchAnalyticsMode(mode) {
  currentAnalyticsMode = mode;
  document.querySelectorAll(".mode-switch-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  const chartView = document.getElementById("analyticsChartView");
  const logView = document.getElementById("analyticsLogView");

  if (chartView) chartView.style.display = mode === "chart" ? "flex" : "none";
  if (logView) logView.style.display = mode === "log" ? "flex" : "none";

  if (mode === "chart" && cachedData) {
    renderTrendChart(cachedData.riwayat || []);
  }
}

function renderTabelPresensi(rows) {
  const countText = `${rows.length} Hari`;
  setText("jumlahRiwayatDesktop", countText);
  setText("jumlahRiwayatMobile", countText);

  const reversed = [...rows].reverse();
  const htmlRows = reversed.length === 0
    ? `<tr><td colspan="5" style="padding:20px; color:#64748b;">Belum ada catatan presensi pada periode ini.</td></tr>`
    : reversed.map(r => `
      <tr>
        <td data-label="Tanggal"><strong>${r.tanggal || "-"}</strong></td>
        <td data-label="Masuk">${r.jamMasuk || "-"}</td>
        <td data-label="Status"><span class="status-text ${getStatusTextClass(r.status)}">${r.status || "-"}</span></td>
        <td data-label="Pulang">${r.jamPulang || "-"}</td>
        <td data-label="Keterangan">${r.keterangan || "-"}</td>
      </tr>
    `).join("");

  const tbodyDesk = document.querySelector("#tabelPresensiDesktop tbody");
  const tbodyMob = document.querySelector("#tabelPresensiMobile tbody");
  if (tbodyDesk) tbodyDesk.innerHTML = htmlRows;
  if (tbodyMob) tbodyMob.innerHTML = htmlRows;
}

/* ==========================================================================
   KURVA TREN KEHADIRAN & DRAG-TO-SCROLL
   ========================================================================== */
function initChartDragScroll() {
  const scroller = document.getElementById("chartScrollContainer");
  if (!scroller) return;

  let isDown = false;
  let startX = 0;
  let scrollLeftStart = 0;

  scroller.addEventListener("mousedown", (e) => {
    isDown = true;
    isDraggingChart = false;
    scroller.classList.add("is-dragging");
    startX = e.pageX - scroller.offsetLeft;
    scrollLeftStart = scroller.scrollLeft;
  });

  scroller.addEventListener("mouseleave", () => {
    isDown = false;
    scroller.classList.remove("is-dragging");
  });

  scroller.addEventListener("mouseup", () => {
    isDown = false;
    scroller.classList.remove("is-dragging");
    setTimeout(() => { isDraggingChart = false; }, 60);
  });

  scroller.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - scroller.offsetLeft;
    const walk = (x - startX) * 1.4;
    if (Math.abs(walk) > 4) isDraggingChart = true;
    scroller.scrollLeft = scrollLeftStart - walk;
  });
}

function getStatusPointConfig(status) {
  const s = (status || "").toLowerCase();
  // Urutan 8 Level Sumbu Y (0 = paling atas, 7 = paling bawah) persis seperti Portal Piket
  if (s.includes("tepat") || s.includes("prakerin") || s.includes("dispensasi")) {
    return { level: 0, color: "#15803d", shortLabel: status || "Tepat Waktu", showTime: true };
  }
  if (s.includes("sangat terlambat sekali")) {
    return { level: 3, color: "#b91c1c", shortLabel: "Sangat Terlambat Sekali", showTime: true };
  }
  if (s.includes("sangat terlambat")) {
    return { level: 2, color: "#c2410c", shortLabel: "Sangat Terlambat", showTime: true };
  }
  if (s.includes("terlambat")) {
    return { level: 1, color: "#d97706", shortLabel: "Terlambat", showTime: true };
  }
  if (s.includes("tidak presensi") || s === "htp") {
    return { level: 4, color: "#7c3aed", shortLabel: "Hadir Tidak Presensi", showTime: false };
  }
  if (s.includes("izin")) {
    return { level: 5, color: "#0284c7", shortLabel: "Izin", showTime: false };
  }
  if (s.includes("sakit")) {
    return { level: 6, color: "#0891b2", shortLabel: "Sakit", showTime: false };
  }
  return { level: 7, color: "#111827", shortLabel: "Alpa", showTime: false };
}

function formatShortSlashDate(row) {
  if (row.isoDate && /^\d{4}-\d{2}-\d{2}/.test(row.isoDate)) {
    const [yyyy, mm, dd] = row.isoDate.slice(0, 10).split("-");
    return `${dd}/${mm}/${yyyy.slice(-2)}`;
  }
  return row.tanggal || "-";
}

function renderTrendChart(rows) {
  const canvas = document.getElementById("trendChartCanvas");
  const wrapper = document.getElementById("chartInnerWrapper");
  const scroller = document.getElementById("chartScrollContainer");
  if (!canvas || !wrapper || !scroller) return;

  const palette = THEME_PALETTES[currentTheme] || THEME_PALETTES.burgundy;
  const pointSpacing = 105; // Jarak antar titik lega agar label status & jam tidak bertumpuk
  const minWidth = scroller.clientWidth || 680;
  const calculatedWidth = Math.max(minWidth, rows.length * pointSpacing + 90);

  wrapper.style.width = `${calculatedWidth}px`;
  const height = 250;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = calculatedWidth * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${calculatedWidth}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, calculatedWidth, height);

  const padLeft = 34;
  const padRight = 48;
  const padTop = 22;
  const padBottom = 46;
  const plotW = calculatedWidth - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // 8 Tingkat Sumbu Y + Garis Putus-putus + Titik Warna Indikator di Kiri
  const yLevelColors = [
    "#15803d", // 0: Tepat Waktu
    "#d97706", // 1: Terlambat
    "#c2410c", // 2: Sangat Terlambat
    "#b91c1c", // 3: Sangat Terlambat Sekali
    "#7c3aed", // 4: Hadir Tidak Presensi
    "#0284c7", // 5: Izin
    "#0891b2", // 6: Sakit
    "#111827"  // 7: Alpa
  ];

  // Garis Sumbu Y (kiri) & Sumbu X (bawah)
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop - 6);
  ctx.lineTo(padLeft, height - padBottom + 12);
  ctx.lineTo(calculatedWidth - 16, height - padBottom + 12);
  ctx.stroke();

  for (let i = 0; i < 8; i++) {
    const y = padTop + (plotH / 7) * i;

    // Garis horizontal putus-putus
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft + 6, y);
    ctx.lineTo(calculatedWidth - 16, y);
    ctx.stroke();
    ctx.restore();

    // Titik indikator warna di garis sumbu kiri
    ctx.beginPath();
    ctx.arc(padLeft, y, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = yLevelColors[i];
    ctx.fill();
  }

  if (!rows.length) return;

  chartDotPoints = rows.map((r, idx) => {
    const cfg = getStatusPointConfig(r.status);
    const x = rows.length === 1
      ? padLeft + plotW / 2
      : padLeft + 52 + ((plotW - 52) / (rows.length - 1)) * idx;
    const y = padTop + (cfg.level / 7) * plotH;
    return {
      x,
      y,
      color: cfg.color,
      shortLabel: cfg.shortLabel,
      showTime: cfg.showTime,
      data: r,
      index: idx
    };
  });

  // Garis Kurva Halus (Smooth Cubic Bezier)
  ctx.beginPath();
  chartDotPoints.forEach((p, idx) => {
    if (idx === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      const prev = chartDotPoints[idx - 1];
      const cpX = (prev.x + p.x) / 2;
      ctx.bezierCurveTo(cpX, prev.y, cpX, p.y, p.x, p.y);
    }
  });
  ctx.strokeStyle = palette.primary;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.stroke();

  // Titik Data, Label Status + Jam Masuk di Bawah Titik, dan Tanggal Sumbu X
  ctx.textAlign = "center";

  chartDotPoints.forEach((p) => {
    const isSelected = p.index === selectedDotIndex;

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15, 23, 42, 0.12)";
      ctx.fill();
    }

    // Lingkaran Titik Status
    ctx.beginPath();
    ctx.arc(p.x, p.y, isSelected ? 6.2 : 5, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    // Teks Status langsung di bawah titik
    ctx.font = "700 10.5px Roboto, sans-serif";
    ctx.fillStyle = p.color;
    ctx.fillText(p.shortLabel, p.x, p.y + 16);

    // Teks Jam Masuk langsung di bawah status (jika hadir/terlambat)
    if (p.showTime && p.data.jamMasuk && p.data.jamMasuk !== "-") {
      ctx.font = "700 10.5px Roboto, sans-serif";
      ctx.fillStyle = "#475569";
      ctx.fillText(p.data.jamMasuk, p.x, p.y + 28);
    }

    // Label Tanggal Sumbu X (format 14/10/26)
    const dateLabel = formatShortSlashDate(p.data);
    ctx.font = "700 11px Roboto, sans-serif";
    ctx.fillStyle = isSelected ? palette.primary : "#64748b";
    ctx.fillText(dateLabel, p.x, height - 12);
  });

  // Auto-scroll ke data terbaru
  scroller.scrollLeft = scroller.scrollWidth;

  canvas.onclick = (e) => {
    if (isDraggingChart) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    let nearest = null;
    let minDist = 26;
    chartDotPoints.forEach(p => {
      const dist = Math.hypot(p.x - clickX, p.y - clickY);
      if (dist <= minDist) {
        minDist = dist;
        nearest = p;
      }
    });

    if (nearest) {
      selectedDotIndex = nearest.index;
      const d = nearest.data;
      setText(
        "selectedDotDetailBar",
        `📅 ${d.tanggal} • Masuk: ${d.jamMasuk || "-"} • Pulang: ${d.jamPulang || "-"} (${d.status})`
      );
      renderTrendChart(rows);
    }
  };
}

/* ==========================================================================
   KARTU QR PRESENSI MODAL
   ========================================================================== */
function openQrModal() {
  const overlay = document.getElementById("qrModalOverlay");
  if (!overlay) return;
  overlay.classList.add("active");
  generateAndCacheQRCard();
}

function closeQrModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const overlay = document.getElementById("qrModalOverlay");
  if (overlay) overlay.classList.remove("active");
}

function generateAndCacheQRCard() {
  const imgEl = document.getElementById("qrPreviewModal");
  const skelEl = document.getElementById("qrModalSkeleton");
  if (!imgEl || !skelEl) return;

  if (cachedQrDataUrl) {
    imgEl.src = cachedQrDataUrl;
    imgEl.style.display = "block";
    skelEl.style.display = "none";
    return;
  }

  imgEl.style.display = "none";
  skelEl.style.display = "flex";

  const tempDiv = document.createElement("div");
  new QRCode(tempDiv, {
    text: idSiswa,
    width: 260,
    height: 260,
    colorDark: "#0f172a",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  setTimeout(() => {
    const qrCanvas = tempDiv.querySelector("canvas");
    if (!qrCanvas) return;

    const palette = THEME_PALETTES[currentTheme] || THEME_PALETTES.burgundy;
    const cardCanvas = document.createElement("canvas");
    cardCanvas.width = 420;
    cardCanvas.height = 630;
    const ctx = cardCanvas.getContext("2d");

    // Background putih kartu
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 420, 630);

    // Header warna tema
    ctx.fillStyle = palette.primary;
    ctx.fillRect(0, 0, 420, 130);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 22px Oswald, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("KARTU PRESENSI DIGITAL", 210, 56);

    ctx.font = "400 14px Roboto, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText("SMK MEDIKACOM BANDUNG", 210, 84);

    // Frame QR
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.strokeRect(72, 165, 276, 276);
    ctx.drawImage(qrCanvas, 80, 173, 260, 260);

    // Identitas Siswa
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 21px Roboto, sans-serif";
    ctx.fillText(namaSiswa.toUpperCase(), 210, 492);

    ctx.fillStyle = palette.primary;
    ctx.font = "700 15px Roboto, sans-serif";
    ctx.fillText(`${kelasSiswa} • NIS: ${idSiswa}`, 210, 522);

    ctx.fillStyle = "#64748b";
    ctx.font = "400 12px Roboto, sans-serif";
    ctx.fillText("Tunjukkan kartu ini pada mesin scanner sekolah", 210, 585);

    cachedQrDataUrl = cardCanvas.toDataURL("image/png");
    imgEl.src = cachedQrDataUrl;
    imgEl.style.display = "block";
    skelEl.style.display = "none";
  }, 120);
}

function downloadQRCard() {
  if (!cachedQrDataUrl) {
    generateAndCacheQRCard();
    return;
  }
  const link = document.createElement("a");
  link.href = cachedQrDataUrl;
  link.download = `Kartu_QR_${namaSiswa.replace(/\s+/g, "_")}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ==========================================================================
   MODALS CEPAT (IZIN KELUAR, LOG IZIN, BIODATA, KLASEMEN)
   ========================================================================== */
function openModalQuick(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add("active");
}

function closeModalQuick(e, modalId) {
  if (e && e.target !== e.currentTarget) return;
  const el = document.getElementById(modalId);
  if (el) el.classList.remove("active");
}

function toggleJamKembaliField() {
  const jenis = document.getElementById("inputJenisIzinKeluar")?.value || "";
  const field = document.getElementById("fieldJamKembali");
  if (field) {
    field.style.display = jenis.includes("Pulang Awal") ? "none" : "block";
  }
}

function submitDummyIzinKeluar() {
  const jenis = document.getElementById("inputJenisIzinKeluar")?.value || "Izin Keluar Sementara";
  const jamKeluar = document.getElementById("inputJamKeluar")?.value || "10:30";
  const jamKembali = jenis.includes("Pulang Awal")
    ? "-"
    : (document.getElementById("inputJamKembali")?.value || "11:30");
  const alasan = (document.getElementById("inputAlasanIzinKeluar")?.value || "").trim();

  if (!alasan) {
    alert("Mohon isi alasan atau keperluan izin terlebih dahulu.");
    return;
  }

  const todayStr = new Date().toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric"
  });

  dummyIzinHistoryList.unshift({
    id: `IZN-00${dummyIzinHistoryList.length + 1}`,
    tanggal: todayStr,
    jenis,
    jamKeluar,
    jamKembali,
    alasan,
    status: "Menunggu Persetujuan"
  });

  document.getElementById("inputAlasanIzinKeluar").value = "";
  renderRiwayatIzinModal();
  closeModalQuick(null, "modalIzin");
  openModalQuick("modalLogIzin");
}

function renderRiwayatIzinModal() {
  const container = document.getElementById("listRiwayatIzinContainer");
  setText("badgeJumlahIzin", dummyIzinHistoryList.length);
  if (!container) return;

  container.innerHTML = dummyIzinHistoryList.map(item => {
    const isApproved = item.status.toLowerCase().includes("disetujui");
    const isRejected = item.status.toLowerCase().includes("ditolak");
    const pillClass = isApproved ? "is-approved" : (isRejected ? "is-rejected" : "is-pending");

    return `
      <div class="izin-history-item">
        <div class="izin-history-top">
          <span class="izin-history-type">${item.jenis}</span>
          <span class="izin-status-pill ${pillClass}">${item.status}</span>
        </div>
        <div class="izin-history-meta">
          📅 ${item.tanggal} • Keluar: ${item.jamKeluar} ${item.jamKembali !== "-" ? `• Kembali: ${item.jamKembali}` : ""}
        </div>
        <div class="izin-history-reason">${item.alasan}</div>
      </div>
    `;
  }).join("");
}

function openKlasemenModal() {
  renderKlasemenModal();
  openModalQuick("modalKlasemen");
}

function renderKlasemenModal() {
  const container = document.getElementById("listKlasemenContainer");
  if (!container) return;

  const list = getKlasemenDataList();
  container.innerHTML = list.map(item => {
    const topClass = item.rank === 1 ? "top-1" : (item.rank === 2 ? "top-2" : (item.rank === 3 ? "top-3" : ""));
    return `
      <div class="klasemen-row ${item.isMe ? "is-me" : ""}">
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          <div class="klasemen-rank-badge ${topClass}">#${item.rank}</div>
          <div style="min-width:0;">
            <div style="font-size:13px; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${item.nama} ${item.isMe ? "(Kamu)" : ""}
            </div>
            <div style="font-size:11px; color:#64748b;">${item.kelas} • Ketepatan Waktu ${item.tepatWaktu}</div>
          </div>
        </div>
        <div style="font-size:12px; font-weight:800; color:var(--primary); flex-shrink:0;">
          ${item.poin} pts
        </div>
      </div>
    `;
  }).join("");
}

/* ==========================================================================
   MOBILE BOTTOM NAVIGATION & UTILITIES
   ========================================================================== */
function switchMobileTab(e, tabId) {
  document.querySelectorAll(".float-nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  document.querySelectorAll(".tab-content").forEach(sec => {
    sec.classList.toggle("active", sec.id === tabId);
  });

  if (tabId === "statistik" && cachedData) {
    setTimeout(() => renderTrendChart(cachedData.riwayat || []), 60);
  }
}

function showLoading(show, text = "Memproses...") {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return;
  setText("loadingText", text);
  overlay.style.display = show ? "flex" : "none";
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function logout() {
  localStorage.removeItem("idSiswa");
  localStorage.removeItem("namaSiswa");
  localStorage.removeItem("kelasSiswa");
  window.location.replace("/");
}

/* Fallback data jika offline / pengujian lokal */
function buildFallbackData() {
  const sampleStatuses = [
    { status: "Tepat Waktu", masuk: "06:42", pulang: "15:10", ket: "-" },
    { status: "Tepat Waktu", masuk: "06:48", pulang: "15:05", ket: "-" },
    { status: "Terlambat", masuk: "07:08", pulang: "15:12", ket: "Terlambat 8 menit" },
    { status: "Tepat Waktu", masuk: "06:39", pulang: "15:03", ket: "-" },
    { status: "Tepat Waktu", masuk: "06:45", pulang: "15:07", ket: "-" },
    { status: "Izin", masuk: "-", pulang: "-", ket: "Izin kegiatan keluarga" },
    { status: "Tepat Waktu", masuk: "06:41", pulang: "15:09", ket: "-" }
  ];

  const riwayat = [];
  const baseDate = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const item = sampleStatuses[(13 - i) % sampleStatuses.length];
    riwayat.push({
      isoDate: d.toISOString().slice(0, 10),
      tanggal: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
      jamMasuk: item.masuk,
      jamPulang: item.pulang,
      status: item.status,
      keterangan: item.ket
    });
  }

  return {
    hariIni: {
      tanggal: baseDate.toLocaleDateString("id-ID", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
      }),
      jamMasuk: "06:44",
      statusMasuk: "Tepat Waktu",
      jamPulang: "-",
      statusPulang: "Belum Presensi"
    },
    riwayat
  };
}