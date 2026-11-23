/* ==========================================================================
   PORTAL PRESENSI SISWA - SMK MEDICACOM BANDUNG
   File: js/dashboard.js (Hybrid Bento Dashboard + Lazy Mobile + Mock Klasemen & Izin)
   ========================================================================== */

// ==========================================================================
// 1. KONFIGURASI API BACKEND & GLOBAL STATE
// ==========================================================================
const API_URL = "https://script.google.com/macros/s/AKfycbxR0bwVJCXQY5DQKawqOBQO6vNwU8UMFLJ3AuBytSRgQR3TW9rJZ0r58JGkL2u_HxYMhw/exec";
window.templateQrUrl = "./assets/template_qr.png";
window.generatedQrDataUrl = null;

window.AppStore = {
  isLoaded: false,
  isLoadingPromise: null,
  logs: [],
  filterOptions: { taList: [], semesterMap: {} },
  activeSemester: null,
  rawPresensi: [],

  // Ambil data presensi khusus bulan berjalan (untuk Bento Home Desktop & Tab Rekap/Statistik awal)
  getCurrentMonthPresensi: function () {
    if (!this.rawPresensi.length) return [];
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = String(now.getFullYear());
    const suffix = `/${mm}/${yyyy}`;
    const prefix = `${yyyy}-${mm}`;

    const filtered = this.rawPresensi.filter(p => {
      const tgl = String(p.tanggal || "");
      return tgl.endsWith(suffix) || tgl.startsWith(prefix);
    });

    // Fallback jika tanggal server/sheet belum masuk bulan kalender lokal (misal awal bulan)
    return filtered.length > 0 ? filtered : this.rawPresensi.slice(-22);
  },

  // Filter lintas periode untuk Modal "Selengkapnya"
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

window.idSiswaGlobal = null;
window.__INIT_CALLED = false;
window.loadingCount = 0;

// State interaksi titik grafik terpisah antara Home & Modal Arsip
window.chartState = {
  main: { data: [], selectedIndex: null },
  archive: { data: [], selectedIndex: null }
};

// ==========================================================================
// 2. DATA DUMMY (KLASEMEN DISIPLIN & IZIN MENINGGALKAN SEKOLAH)
// ==========================================================================
window.DummyKlasemen = {
  rankSekarang: 14,
  rankKemarin: 17,
  totalSiswaSekolah: 640,
  poinDisiplin: 98
};

window.DummyIzinList = [
  {
    id: "IZN-20261120-01",
    tanggal: "20/11/2026",
    kategori: "Izin Keluar Sementara",
    jamKeluar: "10:15",
    jamKembali: "11:20",
    alasan: "Kontrol kawat gigi di klinik dekat sekolah (surat keterangan orang tua terlampir).",
    status: "Disetujui"
  },
  {
    id: "IZN-20261112-02",
    tanggal: "12/11/2026",
    kategori: "Izin Pulang Awal",
    jamKeluar: "13:00",
    jamKembali: "-",
    alasan: "Menghadiri acara keluarga mendesak di luar kota, dijemput orang tua.",
    status: "Disetujui"
  }
];

// ==========================================================================
// 3. API HELPER & BRANDING CONFIG
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
// 4. 8-THEME ENGINE & HEADER POPOVERS
// ==========================================================================
function toggleThemePopover(event) {
  if (event) event.stopPropagation();
  closeProfilePopover();
  const themePopover = document.getElementById("themePopover");
  if (themePopover) themePopover.classList.toggle("open");
}

function toggleProfilePopover(event) {
  if (event) event.stopPropagation();
  const themePopover = document.getElementById("themePopover");
  const profilePopover = document.getElementById("profilePopover");
  if (themePopover) themePopover.classList.remove("open", "is-open");
  if (profilePopover) profilePopover.classList.toggle("is-open");
}

function closeProfilePopover() {
  const profilePopover = document.getElementById("profilePopover");
  if (profilePopover) profilePopover.classList.remove("is-open", "open");
}

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
  if (popover) popover.classList.remove("open", "is-open");

  // Re-render warna garis grafik utama jika sudah tergambar
  if (PortalLoader.loaded.statistik) {
    renderMainMonthChart();
  }
}

function initThemeUI() {
  const currentTheme = localStorage.getItem("sisensi_active_theme") || "burgundy";
  setAppTheme(currentTheme, false);
}

// ==========================================================================
// 5. HYBRID VIEWPORT LOADER (EAGER DESKTOP vs LAZY MOBILE)
// ==========================================================================
const PortalLoader = {
  isDesktop: window.matchMedia("(min-width: 769px)").matches,
  loaded: {
    home: false,
    rekap: false,
    statistik: false,
    qr: false
  },

  async init() {
    // 1. Modul Beranda selalu dimuat pertama kali (Desktop & Mobile)
    await this.loadHomeModule();

    // 2. Jika Desktop, langsung muat Rekap & Statistik Bulan Berjalan secara paralel
    if (this.isDesktop) {
      await Promise.all([
        this.loadRekapModule(),
        this.loadStatistikModule()
      ]);
    }

    // 3. Antisipasi perubahan ukuran layar (misal resize browser dari mobile ke desktop)
    const mq = window.matchMedia("(min-width: 769px)");
    mq.addEventListener("change", async (e) => {
      this.isDesktop = e.matches;
      if (this.isDesktop) {
        // Pastikan semua section tampil di desktop
        document.querySelectorAll(".tab-content").forEach(el => {
          if (!el.classList.contains("mobile-only-tab")) {
            el.style.display = "";
          }
        });
        await Promise.all([
          this.loadRekapModule(),
          this.loadStatistikModule()
        ]);
      } else {
        // Kembalikan perilaku tab mobile
        const activeBtn = document.querySelector(".float-nav-btn.active");
        const activeTab = activeBtn ? activeBtn.getAttribute("data-tab") : "hariIni";
        switchMobileTab(null, activeTab);
      }
    });
  },

  async loadHomeModule() {
    if (this.loaded.home) return;
    this.loaded.home = true;

    const idSiswa = window.idSiswaGlobal;
    renderDisciplineRankDummy();
    renderRiwayatIzinList();
    updateBulanBerjalanLabel();

    // Muat Presensi Hari Ini & Sinkronkan Data Bulan Berjalan
    await Promise.all([
      loadHariIni(idSiswa),
      this.syncMasterPresensi(false)
    ]);

    // Isi 5 mini KPI Ringkasan Bulan Berjalan di Baris 1 Kanan
    renderMonthTopKpi();
  },

  async syncMasterPresensi(showLoading = false) {
    if (window.AppStore.isLoaded) return;
    if (window.AppStore.isLoadingPromise) {
      return window.AppStore.isLoadingPromise;
    }

    const idSiswa = window.idSiswaGlobal;
    if (!idSiswa) return;

    if (showLoading) showSpinner("Menyinkronkan data presensi...");

    window.AppStore.isLoadingPromise = callBackendApi("getMasterDataSiswaApi", { idSiswa })
      .then(res => {
        if (res && res.success) {
          window.AppStore.isLoaded = true;
          window.AppStore.logs = res.logs || [];
          window.AppStore.filterOptions = res.filterOptions || { taList: [], semesterMap: {} };
          window.AppStore.activeSemester = res.activeSemester || null;
          window.AppStore.rawPresensi = res.rawPresensi || [];
          populateFilterDropdowns();
        }
      })
      .catch(err => {
        console.error("❌ Gagal sinkronisasi master presensi:", err);
      })
      .finally(() => {
        window.AppStore.isLoadingPromise = null;
        if (showLoading) hideSpinner();
      });

    return window.AppStore.isLoadingPromise;
  },

  async loadRekapModule() {
    if (this.loaded.rekap) return;
    this.loaded.rekap = true;

    await this.syncMasterPresensi(!this.isDesktop);
    const monthData = window.AppStore.getCurrentMonthPresensi();
    renderMonthSummaryAndTable(monthData);
  },

  async loadStatistikModule() {
    if (this.loaded.statistik) return;
    this.loaded.statistik = true;

    await this.syncMasterPresensi(!this.isDesktop);
    setTimeout(() => {
      renderMainMonthChart();
      attachChartClickInteraction("trendChartCanvas", "main");
    }, 40);
  }
};

// Handler Navigasi Tab Khusus Mobile Floating Bottom Bar
function switchMobileTab(event, tabName) {
  if (window.matchMedia("(min-width: 769px)").matches) return;

  document.querySelectorAll(".tab-content").forEach(el => {
    el.classList.remove("active");
    el.style.display = "none";
  });

  document.querySelectorAll(".float-nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
  });

  const targetTab = document.getElementById(tabName);
  if (targetTab) {
    targetTab.classList.add("active");
    targetTab.style.display = "block";
  }

  // Lazy Load per Tab di Mobile
  if (tabName === "hariIni") {
    PortalLoader.loadHomeModule();
  } else if (tabName === "riwayat") {
    PortalLoader.loadRekapModule();
  } else if (tabName === "statistik") {
    PortalLoader.loadStatistikModule();
  }
}

// ==========================================================================
// 6. KLASEMEN DISIPLIN & IZIN MENINGGALKAN SEKOLAH (DUMMY + INTERAKTIF)
// ==========================================================================
function renderDisciplineRankDummy() {
  const { rankSekarang, rankKemarin, totalSiswaSekolah, poinDisiplin } = window.DummyKlasemen;
  const diff = rankKemarin - rankSekarang; // Positif = peringkat naik (angka makin kecil)

  const elRankNum = document.getElementById("rankNumber");
  const elTotal = document.getElementById("rankTotalSiswa");
  const elPill = document.getElementById("rankTrendPill");
  const elArrow = document.getElementById("rankTrendArrow");
  const elText = document.getElementById("rankTrendText");
  const elPoin = document.getElementById("rankPoinDisiplin");
  const elKemarin = document.getElementById("rankKemarin");

  if (elRankNum) elRankNum.textContent = rankSekarang;
  if (elTotal) elTotal.textContent = `/ ${totalSiswaSekolah} Siswa`;
  if (elPoin) elPoin.textContent = `${poinDisiplin} Poin`;
  if (elKemarin) elKemarin.textContent = `#${rankKemarin}`;

  if (elPill && elArrow && elText) {
    elPill.classList.remove("is-up", "is-down", "is-flat");
    if (diff > 0) {
      elPill.classList.add("is-up");
      elArrow.textContent = "▲";
      elText.textContent = `Naik ${diff}`;
    } else if (diff < 0) {
      elPill.classList.add("is-down");
      elArrow.textContent = "▼";
      elText.textContent = `Turun ${Math.abs(diff)}`;
    } else {
      elPill.classList.add("is-flat");
      elArrow.textContent = "—";
      elText.textContent = "Tetap";
    }
  }
}

function toggleJamKembaliField() {
  const jenis = document.getElementById("inputJenisIzinKeluar")?.value;
  const fieldKembali = document.getElementById("fieldJamKembali");
  if (!fieldKembali) return;
  fieldKembali.style.display = jenis === "Izin Pulang Awal" ? "none" : "block";
}

function submitDummyIzinKeluar() {
  const kategori = document.getElementById("inputJenisIzinKeluar")?.value || "Izin Keluar Sementara";
  const jamKeluar = document.getElementById("inputJamKeluar")?.value || "-";
  const jamKembali = kategori === "Izin Pulang Awal"
    ? "-"
    : (document.getElementById("inputJamKembali")?.value || "-");
  const alasan = document.getElementById("inputAlasanIzinKeluar")?.value.trim();

  if (!alasan) {
    alert("Harap tuliskan alasan izin meninggalkan sekolah terlebih dahulu.");
    return;
  }

  const now = new Date();
  const tglStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  window.DummyIzinList.unshift({
    id: `IZN-${Date.now()}`,
    tanggal: tglStr,
    kategori,
    jamKeluar,
    jamKembali,
    alasan,
    status: "Menunggu Piket"
  });

  // Reset form & perbarui daftar riwayat
  const elAlasan = document.getElementById("inputAlasanIzinKeluar");
  if (elAlasan) elAlasan.value = "";

  renderRiwayatIzinList();
  closeModalQuick(null, "modalIzin");
  openModalQuick("modalLogIzin");
}

function renderRiwayatIzinList() {
  const container = document.getElementById("listRiwayatIzinContainer");
  const badgeCount = document.getElementById("badgeJumlahIzin");

  if (badgeCount) badgeCount.textContent = window.DummyIzinList.length;
  if (!container) return;

  if (!window.DummyIzinList.length) {
    container.innerHTML = `<div style="text-align:center; padding:24px; font-size:12.5px; color:var(--text-muted);">Belum ada riwayat pengajuan izin meninggalkan sekolah.</div>`;
    return;
  }

  container.innerHTML = window.DummyIzinList.map(item => {
    let statusClass = "is-pending";
    if (item.status.toLowerCase().includes("setuju")) statusClass = "is-approved";
    else if (item.status.toLowerCase().includes("tolak")) statusClass = "is-rejected";

    const waktuInfo = item.kategori === "Izin Pulang Awal"
      ? `Pulang pukul ${item.jamKeluar} WIB`
      : `Keluar ${item.jamKeluar} • Kembali ${item.jamKembali} WIB`;

    return `
      <div class="izin-history-item">
        <div class="izin-history-top">
          <span class="izin-history-type">${item.kategori}</span>
          <span class="izin-status-pill ${statusClass}">${item.status}</span>
        </div>
        <div class="izin-history-meta">${item.tanggal} • ${waktuInfo}</div>
        <div class="izin-history-reason">${item.alasan}</div>
      </div>
    `;
  }).join("");
}

// ==========================================================================
// 7. GREETING, PRESENSI HARI INI, RINGKASAN BULAN BERJALAN & TABEL
// ==========================================================================
function setGreeting() {
  const nama = localStorage.getItem("namaSiswa") || "Siswa";
  const now = new Date();
  const hour = now.getHours();

  let greeting = "Selamat Malam 🌙";
  if (hour >= 4 && hour < 11) greeting = "Selamat Pagi ☀️";
  else if (hour >= 11 && hour < 15) greeting = "Selamat Siang 🌤️";
  else if (hour >= 15 && hour < 18) greeting = "Selamat Sore 🌇";

  const elGreeting = document.getElementById("greetingText");
  if (elGreeting) elGreeting.textContent = `${greeting}, ${nama}!`;
}

function updateBulanBerjalanLabel() {
  const now = new Date();
  const bulanTahun = now.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const elLabel = document.getElementById("labelBulanBerjalan");
  const elSub = document.getElementById("statistikPeriodSubtitle");
  if (elLabel) elLabel.textContent = `Periode ${bulanTahun}`;
  if (elSub) elSub.textContent = `Grafik kedisiplinan jam kedatangan periode ${bulanTahun}.`;
}

async function loadHariIni(idSiswa) {
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
    }
  } catch (err) {
    console.error("Gagal loadHariIni:", err);
  }
}

function summarizePresensiList(list) {
  const stats = {
    tepatWaktu: 0,
    terlambat: 0,
    tidakPresensi: 0,
    daring: 0,
    sakit: 0,
    izin: 0,
    alpa: 0,
    totalHadir: 0,
    totalTidakHadir: 0,
    persenHadir: 0
  };

  (list || []).forEach(item => {
    const s = String(item.statusMasuk || "").toLowerCase();
    if (s.includes("tidak presensi")) {
      stats.tidakPresensi++;
      stats.totalHadir++;
    } else if (s.includes("terlambat")) {
      stats.terlambat++;
      stats.totalHadir++;
    } else if (s.includes("prakerin") || s.includes("daring") || s.includes("dispensasi")) {
      stats.daring++;
      stats.totalHadir++;
    } else if (s.includes("sakit")) {
      stats.sakit++;
      stats.totalTidakHadir++;
    } else if (s.includes("izin")) {
      stats.izin++;
      stats.totalTidakHadir++;
    } else if (s.includes("alpa")) {
      stats.alpa++;
      stats.totalTidakHadir++;
    } else if (s.includes("tepat") || s.includes("hadir")) {
      stats.tepatWaktu++;
      stats.totalHadir++;
    }
  });

  const totalHari = stats.totalHadir + stats.totalTidakHadir;
  stats.persenHadir = totalHari > 0 ? Math.round((stats.totalHadir / totalHari) * 100) : 100;
  return stats;
}

function renderMonthTopKpi() {
  const monthData = window.AppStore.getCurrentMonthPresensi();
  const st = summarizePresensiList(monthData);

  const elHadir = document.getElementById("kpiBulanHadir");
  const elTelat = document.getElementById("kpiBulanTerlambat");
  const elSakitIzin = document.getElementById("kpiBulanSakitIzin");
  const elAlpa = document.getElementById("kpiBulanAlpa");
  const elPersen = document.getElementById("kpiBulanPersen");

  if (elHadir) elHadir.textContent = st.totalHadir;
  if (elTelat) elTelat.textContent = st.terlambat;
  if (elSakitIzin) elSakitIzin.textContent = st.sakit + st.izin;
  if (elAlpa) elAlpa.textContent = st.alpa;
  if (elPersen) elPersen.textContent = `${st.persenHadir}%`;
}

function renderMonthSummaryAndTable(data) {
  const st = summarizePresensiList(data);

  // Update kartu detail khusus tampilan Mobile Tab Rekap
  const mapping = {
    s_tepat: st.tepatWaktu,
    s_terlambat: st.terlambat,
    s_tidak: st.tidakPresensi,
    s_daring: st.daring,
    s_total: st.totalHadir,
    s_sakit: st.sakit,
    s_izin: st.izin,
    s_alpa: st.alpa,
    s_total_tidak: st.totalTidakHadir
  };
  Object.entries(mapping).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });

  renderPresensiTableRows("#tabelPresensi tbody", "jumlahRiwayat", data, true);
}

function renderPresensiTableRows(tbodySelector, badgeId, data, reverseLatest = false) {
  const tbody = document.querySelector(tbodySelector);
  const info = badgeId ? document.getElementById(badgeId) : null;
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">Tidak ada data presensi pada periode ini</td></tr>`;
    if (info) info.textContent = "0 Hari";
    return;
  }

  const rows = reverseLatest ? [...data].reverse() : data;
  rows.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td data-label="Tanggal">${item.tanggal}</td>
        <td data-label="Masuk">${item.jamMasuk || "-"}</td>
        <td data-label="Status">${item.statusMasuk || "-"}</td>
        <td data-label="Pulang">${item.jamPulang || "-"}</td>
        <td data-label="Keterangan">${item.keterangan || "-"}</td>
      </tr>
    `;
  });

  if (info) info.textContent = `${data.length} Hari`;
}

// ==========================================================================
// 8. KARTU QR PRESENSI ON-DEMAND (TOMBOL DI PRESENSI HARI INI & MOBILE BAR)
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
    applyGeneratedQRToModal(window.generatedQrDataUrl);
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
    PortalLoader.loaded.qr = true;

    applyGeneratedQRToModal(resultDataUrl);
  } catch (err) {
    console.error("❌ ERROR GENERATE QR CARD:", err);
    const skeleton = document.getElementById("qrModalSkeleton");
    if (skeleton) skeleton.textContent = "Gagal memuat Kartu QR";
  }
}

function applyGeneratedQRToModal(dataUrl) {
  const elModalPreview = document.getElementById("qrPreviewModal");
  const elModalSkeleton = document.getElementById("qrModalSkeleton");

  if (elModalPreview) {
    elModalPreview.src = dataUrl;
    elModalPreview.style.display = "block";
  }
  if (elModalSkeleton) {
    elModalSkeleton.style.display = "none";
  }
}

async function openQrModal() {
  const modal = document.getElementById("qrModalOverlay");
  if (!modal) return;
  modal.classList.add("active");

  if (!PortalLoader.loaded.qr) {
    await generateQRCard();
  }
}

function closeQrModal(event) {
  if (!event || event.target.id === "qrModalOverlay") {
    const modal = document.getElementById("qrModalOverlay");
    if (modal) modal.classList.remove("active");
  }
}

function downloadQRCard() {
  const dataUrl = window.generatedQrDataUrl || document.getElementById("qrPreviewModal")?.src;

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
// 9. GRAFIK KURVA TREN PRESENSI (ENGINE PORTAL PIKET - REUSABLE)
// ==========================================================================
function renderMainMonthChart() {
  const monthData = window.AppStore.getCurrentMonthPresensi();
  renderTrendChartOnCanvas({
    canvasId: "trendChartCanvas",
    wrapperId: "chartInnerWrapper",
    scrollId: "chartScrollContainer",
    stateKey: "main",
    records: monthData,
    compactFit: false
  });
}

function renderTrendChartOnCanvas({ canvasId, wrapperId, scrollId, stateKey, records, compactFit = false }) {
  const canvas = document.getElementById(canvasId);
  const wrapper = document.getElementById(wrapperId);
  const scrollEl = document.getElementById(scrollId);
  if (!canvas || !wrapper || !scrollEl) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  const rawData = (records || []).map(item => ({
    label: String(item.tanggal || "").slice(0, 5),
    status: item.statusMasuk
  }));

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

  const sampleData = rawData.map(item => {
    const st = getStatusInfo(item.status);
    return { label: item.label, val: st.level, color: st.color, fullName: st.fullName };
  });

  window.chartState[stateKey].data = sampleData;

  const parentWidth = scrollEl.clientWidth || 500;
  let computedWidth = parentWidth;

  if (!compactFit) {
    const pointSpacing = 56;
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
  const paddingLeft = compactFit ? 40 : 44;
  const paddingRight = compactFit ? 34 : 28;
  const paddingTop = 20;
  const paddingBottom = 46;

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

  const selectedIdx = window.chartState[stateKey].selectedIndex;
  if (selectedIdx !== null && sampleData[selectedIdx]) {
    const selectedItem = sampleData[selectedIdx];
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
    const isSelected = selectedIdx === index;

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(item.x, item.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(130, 70, 83, 0.22)";
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(item.x, item.y, isSelected ? 6.5 : 5, 0, Math.PI * 2);
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    const maxLabelWidth = 54;
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

function attachChartClickInteraction(canvasId, stateKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || canvas.dataset.hasClickListener) return;
  canvas.dataset.hasClickListener = "true";

  let startX = 0;
  let startY = 0;

  const handleSelect = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const data = window.chartState[stateKey].data || [];

    let clickedIndex = null;
    let minDist = Infinity;
    data.forEach((item, i) => {
      const dist = Math.abs(item.x - clickX);
      if (dist < minDist && dist <= 32) {
        minDist = dist;
        clickedIndex = i;
      }
    });

    window.chartState[stateKey].selectedIndex =
      clickedIndex !== null && window.chartState[stateKey].selectedIndex !== clickedIndex
        ? clickedIndex
        : null;

    if (stateKey === "main") {
      renderMainMonthChart();
    } else {
      const activeRange = document.getElementById("filterTimelineStatistik")?.getAttribute("data-value") || "1m";
      refreshArchiveFromCurrentFilter(activeRange);
    }
  };

  canvas.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  canvas.addEventListener("touchend", e => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    if (Math.abs(endX - startX) > 8 || Math.abs(endY - startY) > 8) return;
    handleSelect(endX);
  });

  canvas.addEventListener("click", e => {
    handleSelect(e.clientX);
  });
}

// ==========================================================================
// 10. MODAL "SELENGKAPNYA" — ARSIP REKAP & GRAFIK LINTAS PERIODE
// ==========================================================================
async function openArchiveModal(focusMode = "rekap") {
  const modal = document.getElementById("modalArsipPresensi");
  if (!modal) return;
  modal.classList.add("active");

  if (!window.AppStore.isLoaded) {
    await PortalLoader.syncMasterPresensi(true);
  }

  initTimelineDropdown();
  attachChartClickInteraction("archiveTrendChartCanvas", "archive");

  setTimeout(() => {
    renderArchiveView("1m");
    if (focusMode === "rekap") {
      const tableBox = document.getElementById("tabelArsipPresensi");
      tableBox?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, 50);
}

function populateFilterDropdowns() {
  const taList = window.AppStore.filterOptions.taList || [];
  const selectTaSem = document.getElementById("selectTaForSemester");
  const selectTaFull = document.getElementById("selectTahunAjaranFull");
  if (!selectTaSem || !selectTaFull) return;

  selectTaSem.innerHTML = "";
  selectTaFull.innerHTML = "";

  if (taList.length === 0) {
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

  createCustomDropdown(container, timelineOptions, "1m", function (selectedVal) {
    const customBox = document.getElementById("customDateRangeBox");
    const semesterBox = document.getElementById("semesterSelectBox");
    const taBox = document.getElementById("thnAjaranSelectBox");

    if (customBox) customBox.style.display = "none";
    if (semesterBox) semesterBox.style.display = "none";
    if (taBox) taBox.style.display = "none";

    if (selectedVal === "custom") {
      if (customBox) customBox.style.display = "flex";
    } else if (selectedVal === "semester_select") {
      if (semesterBox) semesterBox.style.display = "flex";
      applySemesterFilter();
    } else if (selectedVal === "ta_select") {
      if (taBox) taBox.style.display = "flex";
      applyTahunAjaranFilter();
    } else {
      renderArchiveView(selectedVal);
    }
  });
}

function refreshArchiveFromCurrentFilter(activeRange) {
  if (activeRange === "semester_select") applySemesterFilter();
  else if (activeRange === "ta_select") applyTahunAjaranFilter();
  else if (activeRange === "custom") applyCustomDateRange();
  else renderArchiveView(activeRange);
}

function applySemesterFilter() {
  const ta = document.getElementById("selectTaForSemester")?.value;
  const sem = document.getElementById("selectSemesterType")?.value;
  renderArchiveView("semester", ta, sem);
}

function applyTahunAjaranFilter() {
  const taFull = document.getElementById("selectTahunAjaranFull")?.value;
  renderArchiveView("tahun_ajaran", taFull);
}

function applyCustomDateRange() {
  const startDate = document.getElementById("inputDateStart")?.value;
  const endDate = document.getElementById("inputDateEnd")?.value;
  if (!startDate || !endDate) {
    alert("Harap isi tanggal Mulai dan Selesai!");
    return;
  }
  renderArchiveView("custom", startDate, endDate);
}

function renderArchiveView(rangeType, param1 = null, param2 = null) {
  const records = window.AppStore.getPresensiByRange(rangeType, param1, param2);
  const st = summarizePresensiList(records);

  const statMap = {
    arcTepat: st.tepatWaktu,
    arcTerlambat: st.terlambat,
    arcHtp: st.tidakPresensi,
    arcPrakerin: st.daring,
    arcSakit: st.sakit,
    arcIzin: st.izin,
    arcAlpa: st.alpa,
    arcTotalHadir: st.totalHadir
  };
  Object.entries(statMap).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });

  renderTrendChartOnCanvas({
    canvasId: "archiveTrendChartCanvas",
    wrapperId: "archiveChartInnerWrapper",
    scrollId: "archiveChartScrollContainer",
    stateKey: "archive",
    records,
    compactFit: rangeType === "1w"
  });

  renderPresensiTableRows("#tabelArsipPresensi tbody", null, records, true);
}

// ==========================================================================
// 11. CUSTOM DROPDOWN COMPONENT
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
      containerElement.classList.remove("open");
      return;
    }
    document.querySelectorAll(".custom-dropdown.open").forEach(el => el.classList.remove("open"));
    containerElement.classList.add("open");
  };

  menu.onclick = function (e) {
    e.stopPropagation();
    const item = e.target.closest(".dropdown-item");
    if (!item) return;

    const value = item.getAttribute("data-value");
    const label = item.innerText;

    textSpan.innerText = label;
    containerElement.setAttribute("data-value", value);
    containerElement.classList.remove("open");

    if (typeof onSelectCallback === "function") {
      onSelectCallback(value, label);
    }
  };
}

// ==========================================================================
// 12. QUICK MODALS, BIODATA, SPINNER & SESSION INIT
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

function populateBiodataUI(idSiswa, nama, kelas, jurusan) {
  let userObj = {};
  try {
    userObj = JSON.parse(localStorage.getItem("sisensi_siswa_user") || "{}");
  } catch (e) {}

  const initial = nama.trim().charAt(0).toUpperCase() || "S";
  const nisn = userObj.nisn || localStorage.getItem("nisnSiswa") || "-";
  const jk = userObj.jenisKelamin || userObj.jk || "-";
  const ttl = userObj.ttl || (userObj.tempatLahir && userObj.tanggalLahir ? `${userObj.tempatLahir}, ${userObj.tanggalLahir}` : "-");

  // Header & Greeting
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("namaSiswa", nama);
  setTxt("kelasSiswa", kelas);
  setTxt("badgeNisSiswa", idSiswa);

  // Mobile Tab Profil
  setTxt("profilAvatarLarge", initial);
  setTxt("profilNama", nama);
  setTxt("profilNamaKelas", kelas);
  setTxt("profilNis", idSiswa);
  setTxt("profilNisn", nisn);
  setTxt("profilJurusan", jurusan);
  setTxt("profilJk", jk);
  setTxt("profilTtl", ttl);

  // Modal Biodata (Desktop)
  setTxt("modalBiodataAvatar", initial);
  setTxt("modalBiodataNama", nama);
  setTxt("modalBiodataKelas", kelas);
  setTxt("modalBiodataNis", idSiswa);
  setTxt("modalBiodataNisn", nisn);
  setTxt("modalBiodataJurusan", jurusan);
  setTxt("modalBiodataJk", jk);
  setTxt("modalBiodataTtl", ttl);
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
  const jurusan = getJurusan(kelas);

  populateBiodataUI(idSiswa, nama, kelas, jurusan);
  initThemeUI();
  setGreeting();
  loadSystemBranding();

  // Jalankan Hybrid Loader (Eager di Desktop, Lazy di Mobile)
  PortalLoader.init();
}

// Global Click Listener untuk menutup Dropdown, Theme Popover, & Profile Popover
document.addEventListener("click", function (e) {
  if (!e.target.closest(".custom-dropdown")) {
    document.querySelectorAll(".custom-dropdown.open").forEach(el => el.classList.remove("open"));
  }
  if (!e.target.closest(".theme-picker-wrapper")) {
    document.getElementById("themePopover")?.classList.remove("open", "is-open");
  }
  if (!e.target.closest(".user-profile-wrapper")) {
    closeProfilePopover();
  }
});

document.addEventListener("DOMContentLoaded", function () {
  updateTanggalSekarang();
  initFormSiswa();
});