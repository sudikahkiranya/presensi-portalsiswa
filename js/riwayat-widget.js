/* ==========================================================================
   RIWAYAT PRESENSI WIDGET ENGINE (PORTAL SISWA & PORTAL PIKET)
   ========================================================================== */
(function (global) {
  const RiwayatWidget = {
    apiUrl: "",
    mode: "siswa", // "siswa" | "piket"
    container: null,
    toolbarEl: null,
    onNotify: null,
    layoutVariant: "piket", // "piket" | "siswa-split"
    defaultRange: "1w",
    onDataFiltered: null,
    store: {
      recentCache: {},
      fullCache: {},
      hasFullArchive: false,
      currentSiswa: null,
      rawPresensi: [],
      filterOptions: { taList: [], semesterMap: {} },
      currentFiltered: [],
      chartData: [],
      selectedDotIndex: null,
      activeRange: "1w",
      activeViewMode: "chart", // "chart" | "log"
      selectedStatuses: []
    },

    init(options = {}) {
      this.apiUrl = options.apiUrl || (typeof API_URL !== "undefined" ? API_URL : "");
      this.mode = options.mode || "siswa";
      this.onNotify = typeof options.onNotify === "function" ? options.onNotify : null;
      this.layoutVariant = options.layoutVariant || (this.mode === "siswa" ? "siswa-split" : "piket");
      this.defaultRange = options.defaultRange || (this.mode === "siswa" ? "1m" : "1w");
      this.onDataFiltered = typeof options.onDataFiltered === "function" ? options.onDataFiltered : null;
      this.store.activeRange = this.defaultRange;
      this.store.activeViewMode = "chart";

      const el = typeof options.containerId === "string"
        ? document.getElementById(options.containerId)
        : options.containerEl;

      if (!el) {
        console.error("[RiwayatWidget] Container tidak ditemukan.");
        return;
      }

      this.container = el;
      this.renderScaffold();
      this.bindGlobalEvents();
      this.initRangeDropdown();

      if (options.idSiswa) {
        if (this.mode === "piket") {
          const inp = this.q(".rw-input-nis");
          const clr = this.q(".rw-clear-nis");
          if (inp) inp.value = options.idSiswa;
          if (clr) clr.hidden = false;
        }
        this.loadStudentHistory(options.idSiswa);
      } else if (this.mode === "piket") {
        setTimeout(() => this.q(".rw-input-nis")?.focus(), 60);
      }
    },

    q(selector) {
      if (this.container) {
        const found = this.container.querySelector(selector);
        if (found) return found;
      }
      if (this.toolbarEl) {
        if (this.toolbarEl.matches(selector)) return this.toolbarEl;
        return this.toolbarEl.querySelector(selector);
      }
      return null;
    },

    qa(selector) {
      const results = [];
      if (this.container) {
        results.push(...this.container.querySelectorAll(selector));
      }
      if (this.toolbarEl && !this.container?.contains(this.toolbarEl)) {
        if (this.toolbarEl.matches(selector)) results.push(this.toolbarEl);
        results.push(...this.toolbarEl.querySelectorAll(selector));
      }
      return results;
    },

    notify(msg, type = "info") {
      if (this.onNotify) this.onNotify(msg, type);
      else if (typeof showToast === "function") showToast(msg, type);
      else alert(msg);
    },

    reset() {
      this.setSearchDisabled(false);
      Object.assign(this.store, {
        currentSiswa: null,
        rawPresensi: [],
        currentFiltered: [],
        chartData: [],
        selectedDotIndex: null,
        activeRange: this.defaultRange,
        activeViewMode: "chart",
        selectedStatuses: []
      });

      if (!this.container) return;
      const inp = this.q(".rw-input-nis");
      const clr = this.q(".rw-clear-nis");
      if (inp) inp.value = "";
      if (clr) clr.hidden = true;

      const divEl = this.q(".rw-result-divider");
      const boxEl = this.q(".rw-student-box");
      if (divEl) divEl.style.display = "none";
      if (boxEl) boxEl.style.display = "none";

      if (this.toolbarEl && !this.container.contains(this.toolbarEl)) {
        this.toolbarEl.style.display = "none";
      }
      this.q(".rw-result-wrap").style.display = "none";
      this.q(".rw-loading-box").style.display = "none";
      const ph = this.q(".rw-empty-box");
      ph.innerHTML = this.mode === "piket"
        ? `Silakan <strong>scan kartu QR siswa</strong> atau masukkan <strong>NIS</strong> di atas untuk melihat grafik riwayat kehadiran.`
        : `Data riwayat presensi belum dimuat.`;
      ph.style.display = "block";
    },

    renderScaffold() {
      const searchHeaderHTML = this.mode === "piket" ? `
        <div class="rw-search-grid">
          <div class="rw-filter-item" style="flex: 0 0 auto;">
            <label>Input ID / NIS Siswa:</label>
            <div class="rw-scan-row">
              <div class="rw-input-wrap">
                <input type="text" class="rw-input-text rw-input-nis" placeholder="Scan QR / ketik NIS...">
                <button type="button" class="rw-clear-btn rw-clear-nis" title="Hapus" hidden>✕</button>
              </div>
              <button type="button" class="rw-btn-primary rw-btn-cek">Cek</button>
            </div>
          </div>
          <div class="rw-result-divider" style="display:none; width:1px; align-self:stretch; background:#e2e8f0;"></div>
          <div class="rw-student-box" style="display:none; flex:1; flex-direction:column; justify-content:center; gap:6px; font-size:14px;">
            <div style="display:flex; align-items:baseline;">
              <span style="width:105px; font-weight:600; color:#64748b;">Nama Siswa</span>
              <span style="margin-right:8px; color:#64748b;">:</span>
              <span class="rw-res-nama" style="font-weight:700; color:#0f172a;">-</span>
            </div>
            <div style="display:flex; align-items:baseline;">
              <span style="width:105px; font-weight:600; color:#64748b;">Kelas</span>
              <span style="margin-right:8px; color:#64748b;">:</span>
              <span class="rw-res-kelas" style="font-weight:700; color:#0f172a;">-</span>
            </div>
          </div>
        </div>
      ` : "";

      const chartCardHTML = `
        <div class="rw-chart-card">
          <div class="rw-chart-scroll">
            <div class="rw-chart-inner">
              <canvas class="rw-trend-canvas"></canvas>
            </div>
          </div>

          <div class="rw-legend-grid">
            <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#15803d;"></span><span>Tepat Waktu / Dispensasi / Prakerin / Daring</span></div>
            <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#d97706;"></span><span>Terlambat</span></div>
            <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#c2410c;"></span><span>Sangat Terlambat</span></div>
            <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#b91c1c;"></span><span>Sangat Terlambat Sekali</span></div>
            <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#7c3aed;"></span><span>Hadir Tidak Presensi</span></div>
            <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#0284c7;"></span><span>Izin</span></div>
            <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#0891b2;"></span><span>Sakit</span></div>
            <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#111827;"></span><span>Alpa</span></div>
          </div>
        </div>
      `;

      const bodyHTML = this.layoutVariant === "siswa-split" ? `
        <div class="rw-split-layout">
          <!-- KIRI (3/4): KURVA / LOG -->
          <div class="rw-pane-left">
            <div class="rw-pane-header rw-pane-header-switch-only">
              <div class="rw-mode-switch" role="tablist" aria-label="Mode Tampilan Data">
                <button type="button" class="rw-mode-btn active" data-view="chart">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                  </svg>
                  <span>Kurva</span>
                </button>
                <button type="button" class="rw-mode-btn" data-view="log">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                  </svg>
                  <span>Log</span>
                </button>
              </div>
              <div class="rw-log-filter-bar" style="display:none;">
                <button type="button" class="rw-filter-trigger-btn">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                  </svg>
                  <span>Filter Status</span>
                </button>
                <div class="rw-active-chips"></div>
              </div>
            </div>

            <div class="rw-view-chart">${chartCardHTML}</div>

            <div class="rw-view-log" style="display:none;">
              <div class="rw-log-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Masuk</th>
                      <th>Status</th>
                      <th>Pulang</th>
                      <th>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody class="rw-log-tbody"></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- DIVIDER VERTIKAL -->
          <div class="rw-vertical-divider" aria-hidden="true"></div>

          <!-- KANAN (1/4): REKAP KEHADIRAN PER KELOMPOK CARD -->
          <div class="rw-pane-right">
            <div class="rw-rekap-cards-stack">
              <!-- Card 1: Kehadiran -->
              <div class="rw-rekap-group-card rw-card-hadir" style="display:none;">
                <div class="rw-group-card-header">
                  <span class="rw-group-card-title">Kehadiran</span>
                  <span class="rw-group-total-badge tone-badge-hadir rw-badge-total-hadir">0</span>
                </div>
                <div class="rw-group-items-flex">
                  <div class="num-box tone-hadir" data-stat="tepat" style="display:none;">
                    <span class="num-box-lbl">Tepat Waktu</span>
                    <span class="num-box-val">0</span>
                  </div>
                  <div class="num-box tone-late" data-stat="terlambat" style="display:none;">
                    <span class="num-box-lbl">Terlambat</span>
                    <span class="num-box-val">0</span>
                  </div>
                  <div class="num-box tone-sangat-late" data-stat="sangat_terlambat" style="display:none;">
                    <span class="num-box-lbl">Sangat Terlambat</span>
                    <span class="num-box-val">0</span>
                  </div>
                  <div class="num-box tone-sangat-late-sekali" data-stat="sangat_terlambat_sekali" style="display:none;">
                    <span class="num-box-lbl">Sangat Terlambat Sekali</span>
                    <span class="num-box-val">0</span>
                  </div>
                  <div class="num-box tone-htp" data-stat="htp" style="display:none;">
                    <span class="num-box-lbl">Hadir Tidak Presensi</span>
                    <span class="num-box-val">0</span>
                  </div>
                </div>
              </div>

              <!-- Card 2: Lainnya / Aktivitas Khusus -->
              <div class="rw-rekap-group-card rw-card-lainnya" style="display:none;">
                <div class="rw-group-card-header">
                  <span class="rw-group-card-title">Lainnya</span>
                  <span class="rw-group-total-badge tone-badge-lainnya rw-badge-total-lainnya">0</span>
                </div>
                <div class="rw-group-items-flex">
                  <div class="num-box tone-daring" data-stat="daring" style="display:none;">
                    <span class="num-box-lbl">Daring</span>
                    <span class="num-box-val">0</span>
                  </div>
                  <div class="num-box tone-prakerin" data-stat="prakerin" style="display:none;">
                    <span class="num-box-lbl">Prakerin</span>
                    <span class="num-box-val">0</span>
                  </div>
                  <div class="num-box tone-dispensasi" data-stat="dispensasi" style="display:none;">
                    <span class="num-box-lbl">Dispensasi</span>
                    <span class="num-box-val">0</span>
                  </div>
                </div>
              </div>

              <!-- Card 3: Tidak Hadir -->
              <div class="rw-rekap-group-card rw-card-absen" style="display:none;">
                <div class="rw-group-card-header">
                  <span class="rw-group-card-title">Tidak Hadir</span>
                  <span class="rw-group-total-badge tone-badge-absen rw-badge-total-absen">0</span>
                </div>
                <div class="rw-group-items-flex">
                  <div class="num-box tone-sakit" data-stat="sakit" style="display:none;">
                    <span class="num-box-lbl">Sakit</span>
                    <span class="num-box-val">0</span>
                  </div>
                  <div class="num-box tone-izin" data-stat="izin" style="display:none;">
                    <span class="num-box-lbl">Izin</span>
                    <span class="num-box-val">0</span>
                  </div>
                  <div class="num-box tone-alpa" data-stat="alpa" style="display:none;">
                    <span class="num-box-lbl">Alpa</span>
                    <span class="num-box-val">0</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="rw-empty-rekap-note" style="display:none; text-align:center; font-size:12px; color:#64748b; padding:18px 8px;">
              Belum ada catatan presensi pada periode ini.
            </div>
          </div>
        </div>
      ` : `
        <div class="rw-stats-row">
          <div class="rw-stat-pill rw-tone-green" data-stat="tepat" style="display:none;"><label>Tepat Waktu</label><span>0</span></div>
          <div class="rw-stat-pill rw-tone-amber" data-stat="terlambat" style="display:none;"><label>Terlambat</label><span>0</span></div>
          <div class="rw-stat-pill rw-tone-purple" data-stat="htp" style="display:none;"><label>Tidak Presensi</label><span>0</span></div>
          <div class="rw-stat-pill rw-tone-green" data-stat="prakerin" style="display:none;"><label>Prakerin</label><span>0</span></div>
          <div class="rw-stat-pill rw-tone-green" data-stat="dispensasi" style="display:none;"><label>Dispensasi</label><span>0</span></div>
          <div class="rw-stat-pill rw-tone-green" data-stat="daring" style="display:none;"><label>Daring</label><span>0</span></div>
          <div class="rw-stat-pill rw-tone-cyan" data-stat="sakit" style="display:none;"><label>Sakit</label><span>0</span></div>
          <div class="rw-stat-pill rw-tone-blue" data-stat="izin" style="display:none;"><label>Izin</label><span>0</span></div>
          <div class="rw-stat-pill rw-tone-red" data-stat="alpa" style="display:none;"><label>Alpa</label><span>0</span></div>
        </div>
        ${chartCardHTML}
      `;

      this.container.innerHTML = `
        <div class="rw-container">
          ${searchHeaderHTML}

          <div class="rw-empty-box">
            ${this.mode === "piket"
              ? `Silakan <strong>scan kartu QR siswa</strong> atau masukkan <strong>NIS</strong> di atas untuk melihat grafik riwayat kehadiran.`
              : `Memuat riwayat presensi...`}
          </div>

          <div class="rw-loading-box" style="display:none;">
            <div class="rw-dots"><span></span><span></span><span></span></div>
            <div class="rw-loading-text">Memuat riwayat presensi...</div>
          </div>

          <div class="rw-result-wrap" style="display:none;">
            <div class="rw-toolbar-row">
              <div class="rw-range-wrap">
                <div class="rw-range-dropdown" data-value="${this.defaultRange}"></div>
              </div>

              <div class="rw-inline-subfilter rw-sub-semester" style="display:none;">
                <div class="rw-sel-ta-sem" data-value="" style="flex:1; min-width:140px;"></div>
                <div class="rw-sel-sem-type" data-value="" style="flex:1.2; min-width:165px;"></div>
                <button type="button" class="rw-btn-primary rw-apply-sem">Terapkan</button>
              </div>

              <div class="rw-inline-subfilter rw-sub-ta" style="display:none;">
                <div class="rw-sel-ta-full" data-value="" style="flex:1; min-width:155px;"></div>
                <button type="button" class="rw-btn-primary rw-apply-ta">Terapkan</button>
              </div>

              <div class="rw-inline-subfilter rw-sub-custom" style="display:none;">
                <input type="date" class="rw-date-start" title="Dari Tanggal">
                <span class="rw-date-sep">s.d.</span>
                <input type="date" class="rw-date-end" title="Sampai Tanggal">
                <button type="button" class="rw-btn-primary rw-apply-custom">Terapkan</button>
              </div>
            </div>

            ${bodyHTML}
          </div>
        </div>
      `;

      this.toolbarEl = this.q(".rw-toolbar-row");

      // Pindahkan toolbar ke header card utama jika tersedia (Portal Siswa)
      const externalHeader = document.querySelector("#unifiedAnalyticsCard .unified-card-header");
      if (this.layoutVariant === "siswa-split" && externalHeader && this.toolbarEl) {
        externalHeader.querySelectorAll(".rw-toolbar-row").forEach(old => old.remove());
        this.toolbarEl.style.marginBottom = "0";
        this.toolbarEl.style.display = "none";
        externalHeader.appendChild(this.toolbarEl);
      }

      // Bind event tombol-tombol internal
      if (this.mode === "piket") {
        const inp = this.q(".rw-input-nis");
        const clr = this.q(".rw-clear-nis");
        const btnCek = this.q(".rw-btn-cek");

        inp?.addEventListener("input", () => { if (clr) clr.hidden = !inp.value; });
        inp?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); this.searchByNis(); }
        });
        clr?.addEventListener("click", () => {
          if (inp) { inp.value = ""; inp.focus(); }
          clr.hidden = true;
        });
        btnCek?.addEventListener("click", () => this.searchByNis());
      }

      if (this.layoutVariant === "siswa-split") {
        this.qa(".rw-mode-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            const view = btn.getAttribute("data-view");
            this.switchViewMode(view);
          });
        });

        // <-- TAMBAHKAN EVENT INI -->
        this.q(".rw-filter-trigger-btn")?.addEventListener("click", () => {
          this.openStatusFilterModal();
        });
      }

      this.q(".rw-apply-sem")?.addEventListener("click", () => this.applySemesterFilter());
      this.q(".rw-apply-ta")?.addEventListener("click", () => this.applyTaFilter());
      this.q(".rw-apply-custom")?.addEventListener("click", () => this.applyCustomDateFilter());
    },

    switchViewMode(view) {
      this.store.activeViewMode = view === "log" ? "log" : "chart";
      this.qa(".rw-mode-btn").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-view") === this.store.activeViewMode);
      });

      const chartView = this.q(".rw-view-chart");
      const logView = this.q(".rw-view-log");
      const filterBar = this.q(".rw-log-filter-bar"); // <-- TAMBAHKAN INI

      if (chartView) chartView.style.display = this.store.activeViewMode === "chart" ? "block" : "none";
      if (logView) logView.style.display = this.store.activeViewMode === "log" ? "flex" : "none";
      if (filterBar) filterBar.style.display = this.store.activeViewMode === "log" ? "inline-flex" : "none"; // <-- TAMBAHKAN INI

      if (this.store.activeViewMode === "chart") {
        this.renderTrendChart(this.store.currentFiltered, this.store.activeRange);
      }
    },

    bindGlobalEvents() {
      if (RiwayatWidget._globalBound) return;
      RiwayatWidget._globalBound = true;

      document.addEventListener("click", (e) => {
        if (!e.target.closest(".rw-dropdown")) {
          document.querySelectorAll(".rw-dropdown.open").forEach(el => el.classList.remove("open"));
        }
      });
    },

    createDropdown(containerEl, options, selectedValue, onSelect) {
      if (!containerEl) return;
      containerEl.classList.add("rw-dropdown");
      containerEl.innerHTML = `
        <div class="rw-dropdown-selected">
          <span class="rw-dropdown-text"></span>
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div class="rw-dropdown-menu">
          <div class="rw-dropdown-menu-inner"></div>
        </div>
      `;

      const textSpan = containerEl.querySelector(".rw-dropdown-text");
      const menuOuter = containerEl.querySelector(".rw-dropdown-menu");
      const menuInner = containerEl.querySelector(".rw-dropdown-menu-inner");
      const selectedBox = containerEl.querySelector(".rw-dropdown-selected");

      const currentObj = options.find(opt => opt.value === selectedValue) || options[0] || { value: "", label: "-" };
      textSpan.innerText = currentObj.label;
      containerEl.setAttribute("data-value", currentObj.value);

      options.forEach(item => {
        const div = document.createElement("div");
        div.className = "rw-dropdown-item";
        div.setAttribute("data-value", item.value);
        div.innerText = item.label;
        menuInner.appendChild(div);
      });

      selectedBox.onclick = (e) => {
        e.stopPropagation();
        const isOpen = containerEl.classList.contains("open");
        document.querySelectorAll(".rw-dropdown.open").forEach(el => el.classList.remove("open"));
        if (!isOpen) containerEl.classList.add("open");
      };

      menuOuter.onclick = (e) => {
        e.stopPropagation();
        const item = e.target.closest(".rw-dropdown-item");
        if (!item) return;
        const val = item.getAttribute("data-value");
        const lbl = item.innerText;
        textSpan.innerText = lbl;
        containerEl.setAttribute("data-value", val);
        containerEl.classList.remove("open");
        if (typeof onSelect === "function") onSelect(val, lbl);
      };
    },

    initRangeDropdown() {
      const rangeDropEl = this.q(".rw-range-dropdown");
      const rangeOptions = [
        { value: "1w", label: "1 Minggu Terakhir" },
        { value: "1m", label: "1 Bulan Terakhir" },
        { value: "semester_select", label: "Per Semester" },
        { value: "ta_select", label: "Per Tahun Ajaran" },
        { value: "custom", label: "Kustom Rentang Tanggal" }
      ];

      this.createDropdown(rangeDropEl, rangeOptions, this.defaultRange, async (val) => {
        this.q(".rw-sub-semester").style.display = "none";
        this.q(".rw-sub-ta").style.display = "none";
        this.q(".rw-sub-custom").style.display = "none";

        if (val === "semester_select") {
          this.q(".rw-sub-semester").style.display = "flex";
        } else if (val === "ta_select") {
          this.q(".rw-sub-ta").style.display = "flex";
        } else if (val === "custom") {
          this.q(".rw-sub-custom").style.display = "flex";
        } else if (val === "1m") {
          if (await this.ensureFullArchive()) this.applyFilterRange("1m");
        } else {
          this.applyFilterRange(val);
        }
      });
    },

    searchByNis() {
      const nis = this.q(".rw-input-nis")?.value.trim() || "";
      if (!nis) {
        this.notify("Masukkan NIS atau scan barcode kartu siswa terlebih dahulu.", "info");
        this.q(".rw-input-nis")?.focus();
        return;
      }
      this.loadStudentHistory(nis);
    },

    setSearchDisabled(isDisabled) {
      const grid = this.q(".rw-search-grid");
      if (!grid) return;
      grid.classList.toggle("is-loading", isDisabled);
      const inp = this.q(".rw-input-nis");
      const clr = this.q(".rw-clear-nis");
      const btn = this.q(".rw-btn-cek");
      if (inp) inp.disabled = isDisabled;
      if (clr) clr.disabled = isDisabled;
      if (btn) btn.disabled = isDisabled;
    },

    async loadStudentHistory(idSiswa) {
      const cleanId = String(idSiswa || "").trim();
      if (!cleanId) return;

      const placeholderBox = this.q(".rw-empty-box");
      const loadingBox = this.q(".rw-loading-box");
      const loadingText = this.q(".rw-loading-text");
      const resultWrap = this.q(".rw-result-wrap");
      const dividerEl = this.q(".rw-result-divider");
      const studentBoxEl = this.q(".rw-student-box");

      placeholderBox.style.display = "none";
      resultWrap.style.display = "none";
      if (this.toolbarEl && !this.container.contains(this.toolbarEl)) {
        this.toolbarEl.style.display = "none";
      }
      if (loadingText) loadingText.textContent = "Memuat riwayat presensi terkini...";
      loadingBox.style.display = "flex";
      if (dividerEl) dividerEl.style.display = "none";
      if (studentBoxEl) studentBoxEl.style.display = "none";

      this.setSearchDisabled(true);

      try {
        const needArchiveImmediately = this.defaultRange !== "1w";
        const fetchMode = needArchiveImmediately ? "archive" : "recent";
        const isFull = Boolean(this.store.fullCache[cleanId]) || needArchiveImmediately;
        let data = this.store.fullCache[cleanId] || (!needArchiveImmediately ? this.store.recentCache[cleanId] : null);

        if (!data) {
          const response = await fetch(this.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "getHistoryPresensiSiswa",
              idSiswa: cleanId,
              mode: fetchMode
            })
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          data = await response.json();
          if (!data || data.success === false) {
            throw new Error(data?.message || "Data siswa tidak ditemukan.");
          }
          if (fetchMode === "archive") this.store.fullCache[cleanId] = data;
          else this.store.recentCache[cleanId] = data;
        }

        this.store.hasFullArchive = isFull;
        this.store.currentSiswa = data.siswa || { id_siswa: cleanId, nama: "Siswa", kelas: "-" };
        this.store.rawPresensi = Array.isArray(data.rawPresensi) ? data.rawPresensi : [];
        this.store.filterOptions = data.filterOptions || { taList: [], semesterMap: {} };
        this.store.selectedDotIndex = null;

        if (this.mode === "piket") {
          const namaEl = this.q(".rw-res-nama");
          const kelasEl = this.q(".rw-res-kelas");
          if (namaEl) namaEl.textContent = this.store.currentSiswa.nama || "-";
          if (kelasEl) kelasEl.textContent = this.store.currentSiswa.kelas || "-";
          if (dividerEl) dividerEl.style.display = "block";
          if (studentBoxEl) studentBoxEl.style.display = "flex";
        }

        this.populateSubFilters();

        const rangeDropEl = this.q(".rw-range-dropdown");
        if (rangeDropEl) {
          const txt = rangeDropEl.querySelector(".rw-dropdown-text");
          if (txt) txt.innerText = this.defaultRange === "1m" ? "1 Bulan Terakhir" : "1 Minggu Terakhir";
          rangeDropEl.setAttribute("data-value", this.defaultRange);
        }
        this.q(".rw-sub-semester").style.display = "none";
        this.q(".rw-sub-ta").style.display = "none";
        this.q(".rw-sub-custom").style.display = "none";

        loadingBox.style.display = "none";
        resultWrap.style.display = "block";
        if (this.toolbarEl && !this.container.contains(this.toolbarEl)) {
          this.toolbarEl.style.display = "flex";
        }

        this.applyFilterRange(this.defaultRange);
      } catch (err) {
        console.error("[RiwayatWidget] Gagal load history:", err);
        if (dividerEl) dividerEl.style.display = "none";
        if (studentBoxEl) studentBoxEl.style.display = "none";
        loadingBox.style.display = "none";
        placeholderBox.innerHTML = `<span style="color:#b91c1c; font-weight:600;">⚠️ ${err.message}</span>`;
        placeholderBox.style.display = "block";
      } finally {
        this.setSearchDisabled(false);
      }
    },

    populateSubFilters() {
      const taList = this.store.filterOptions.taList || [];
      const selTaSem = this.q(".rw-sel-ta-sem");
      const selTaFull = this.q(".rw-sel-ta-full");
      const selSem = this.q(".rw-sel-sem-type");

      if (taList.length === 0) {
        const emptyOpt = [{ value: "", label: "Tidak ada data TA" }];
        this.createDropdown(selTaSem, emptyOpt, "", null);
        this.createDropdown(selTaFull, emptyOpt, "", null);
        this.createDropdown(selSem, [{ value: "", label: "-" }], "", null);
        return;
      }

      const taOptions = taList.map(ta => ({ value: ta, label: `TA ${ta}` }));
      this.createDropdown(selTaSem, taOptions, taList[0], () => this.updateSemesterOptions());
      this.createDropdown(selTaFull, taOptions, taList[0], null);
      this.updateSemesterOptions();
    },

    updateSemesterOptions() {
      const selectedTa = this.q(".rw-sel-ta-sem")?.getAttribute("data-value") || "";
      const selSem = this.q(".rw-sel-sem-type");
      const sems = this.store.filterOptions.semesterMap[selectedTa] || [];
      const semOptions = sems.length > 0
        ? sems.map(sem => ({
            value: sem,
            label: sem === "Ganjil" ? "Ganjil (Semester 1)" : (sem === "Genap" ? "Genap (Semester 2)" : sem)
          }))
        : [{ value: "", label: "Tidak ada semester" }];

      this.createDropdown(selSem, semOptions, semOptions[0].value, null);
    },

    async ensureFullArchive() {
      const cleanId = String(this.store.currentSiswa?.id_siswa || "").trim();
      if (!cleanId) return false;
      if (this.store.hasFullArchive) return true;

      if (this.store.fullCache[cleanId]) {
        const cached = this.store.fullCache[cleanId];
        this.store.rawPresensi = Array.isArray(cached.rawPresensi) ? cached.rawPresensi : [];
        this.store.filterOptions = cached.filterOptions || this.store.filterOptions;
        this.store.hasFullArchive = true;
        return true;
      }

      const loadingBox = this.q(".rw-loading-box");
      const loadingText = this.q(".rw-loading-text");
      const resultWrap = this.q(".rw-result-wrap");

      resultWrap.style.display = "none";
      if (loadingText) loadingText.textContent = "Memuat arsip presensi lintas semester...";
      loadingBox.style.display = "flex";
      this.setSearchDisabled(true);

      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "getHistoryPresensiSiswa",
            idSiswa: cleanId,
            mode: "archive"
          })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data || data.success === false) {
          throw new Error(data?.message || "Gagal memuat arsip presensi.");
        }

        this.store.fullCache[cleanId] = data;
        this.store.rawPresensi = Array.isArray(data.rawPresensi) ? data.rawPresensi : [];
        this.store.filterOptions = data.filterOptions || this.store.filterOptions;
        this.store.hasFullArchive = true;
        this.populateSubFilters();

        loadingBox.style.display = "none";
        resultWrap.style.display = "block";
        return true;
      } catch (err) {
        console.error("[RiwayatWidget] Gagal load arsip penuh:", err);
        loadingBox.style.display = "none";
        resultWrap.style.display = "block";
        this.notify(err.message || "Gagal memuat arsip lintas semester.", "error");
        return false;
      } finally {
        this.setSearchDisabled(false);
      }
    },

    async applySemesterFilter() {
      const ta = this.q(".rw-sel-ta-sem")?.getAttribute("data-value") || "";
      const sem = this.q(".rw-sel-sem-type")?.getAttribute("data-value") || "";
      if (!ta || !sem) return;
      if (await this.ensureFullArchive()) {
        this.applyFilterRange("semester", ta, sem);
      }
    },

    async applyTaFilter() {
      const ta = this.q(".rw-sel-ta-full")?.getAttribute("data-value") || "";
      if (!ta) return;
      if (await this.ensureFullArchive()) {
        this.applyFilterRange("tahun_ajaran", ta);
      }
    },

    async applyCustomDateFilter() {
      const start = this.q(".rw-date-start")?.value || "";
      const end = this.q(".rw-date-end")?.value || "";
      if (!start || !end) {
        this.notify("Pilih tanggal mulai dan tanggal akhir terlebih dahulu.", "info");
        return;
      }
      if (start > end) {
        this.notify("Tanggal mulai tidak boleh melebihi tanggal akhir.", "error");
        return;
      }
      if (await this.ensureFullArchive()) {
        this.applyFilterRange("custom", start, end);
      }
    },

    normalizeDateKey(value) {
      if (!value) return "";
      const raw = String(value).trim();
      let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
      m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
      return raw;
    },

    applyFilterRange(rangeType, param1 = null, param2 = null) {
      this.store.activeRange = rangeType;
      this.store.selectedDotIndex = null;

      const all = this.store.rawPresensi;
      let filtered = all;

      if (rangeType === "1w") {
        filtered = all.slice(-7);
      } else if (rangeType === "1m") {
        filtered = all.slice(-30);
      } else if (rangeType === "semester") {
        const targetDigit = param2 === "Ganjil" ? "1" : (param2 === "Genap" ? "2" : "");
        filtered = all.filter(p => {
          const matchTa = p.tahunAjaran === param1;
          if (p.idSemester) return matchTa && p.idSemester.endsWith(targetDigit);
          return matchTa && p.semester === param2;
        });
      } else if (rangeType === "tahun_ajaran") {
        filtered = all.filter(p => p.tahunAjaran === param1);
      } else if (rangeType === "custom") {
        filtered = all.filter(p => {
          const key = this.normalizeDateKey(p.isoDate || p.tanggal);
          return key >= param1 && key <= param2;
        });
      }

      this.store.currentFiltered = filtered;
      this.updateSummaryCards(filtered);
      if (this.layoutVariant === "siswa-split") {
        this.renderLogTable(filtered);
      }
      this.renderTrendChart(filtered, rangeType);

      if (this.onDataFiltered) {
        this.onDataFiltered(filtered, rangeType);
      }
    },

    updateSummaryCards(data) {
      if (this.layoutVariant === "siswa-split") {
        const counts = {
          tepat: 0,
          terlambat: 0,
          sangat_terlambat: 0,
          sangat_terlambat_sekali: 0,
          htp: 0,
          daring: 0,
          prakerin: 0,
          dispensasi: 0,
          sakit: 0,
          izin: 0,
          alpa: 0
        };

        data.forEach(item => {
          const st = String(item.statusMasuk || "").trim().toLowerCase();
          if (st.includes("sangat terlambat sekali")) counts.sangat_terlambat_sekali++;
          else if (st.includes("sangat terlambat")) counts.sangat_terlambat++;
          else if (st.includes("terlambat")) counts.terlambat++;
          else if (st.includes("tidak presensi") || st === "htp") counts.htp++;
          else if (st.includes("prakerin") || st.includes("pkl")) counts.prakerin++;
          else if (st.includes("dispensasi")) counts.dispensasi++;
          else if (st.includes("daring")) counts.daring++;
          else if (st.includes("sakit")) counts.sakit++;
          else if (st.includes("izin")) counts.izin++;
          else if (st.includes("alpa")) counts.alpa++;
          else if (st.includes("tepat") || st.includes("hadir")) counts.tepat++;
        });

        const totalKehadiran = counts.tepat + counts.terlambat + counts.sangat_terlambat +
          counts.sangat_terlambat_sekali + counts.htp;
        const totalLainnya = counts.daring + counts.prakerin + counts.dispensasi;
        const totalTidakHadir = counts.sakit + counts.izin + counts.alpa;
        const totalAll = totalKehadiran + totalLainnya + totalTidakHadir;

        // Update masing-masing kotak status (sembunyikan jika 0)
        Object.entries(counts).forEach(([key, val]) => {
          const box = this.q(`.num-box[data-stat="${key}"]`);
          if (!box) return;
          const valEl = box.querySelector(".num-box-val");
          if (valEl) valEl.textContent = val;
          box.style.display = val > 0 ? "" : "none";
        });

        // Update total badge & visibilitas per card kelompok
        const cardHadir = this.q(".rw-card-hadir");
        const cardLainnya = this.q(".rw-card-lainnya");
        const cardAbsen = this.q(".rw-card-absen");
        const badgeHadir = this.q(".rw-badge-total-hadir");
        const badgeLainnya = this.q(".rw-badge-total-lainnya");
        const badgeAbsen = this.q(".rw-badge-total-absen");
        const emptyNote = this.q(".rw-empty-rekap-note");

        if (badgeHadir) badgeHadir.textContent = `${totalKehadiran} Hari`;
        if (badgeLainnya) badgeLainnya.textContent = `${totalLainnya} Hari`;
        if (badgeAbsen) badgeAbsen.textContent = `${totalTidakHadir} Hari`;

        if (cardHadir) cardHadir.style.display = totalKehadiran > 0 ? "block" : "none";
        if (cardLainnya) cardLainnya.style.display = totalLainnya > 0 ? "block" : "none";
        if (cardAbsen) cardAbsen.style.display = totalTidakHadir > 0 ? "block" : "none";
        if (emptyNote) emptyNote.style.display = totalAll === 0 ? "block" : "none";
        return;
      }

      // Mode default: Piket (baris pill horizontal)
      const counts = {
        tepat: 0, terlambat: 0, htp: 0, prakerin: 0,
        dispensasi: 0, daring: 0, sakit: 0, izin: 0, alpa: 0
      };

      data.forEach(item => {
        const st = String(item.statusMasuk || "").trim().toLowerCase();
        if (st.includes("tepat")) counts.tepat++;
        else if (st.includes("terlambat")) counts.terlambat++;
        else if (st.includes("tidak presensi") || st === "htp") counts.htp++;
        else if (st.includes("prakerin") || st.includes("pkl")) counts.prakerin++;
        else if (st.includes("dispensasi")) counts.dispensasi++;
        else if (st.includes("daring")) counts.daring++;
        else if (st.includes("sakit")) counts.sakit++;
        else if (st.includes("izin")) counts.izin++;
        else if (st.includes("alpa")) counts.alpa++;
      });

      let visibleCards = 0;
      Object.entries(counts).forEach(([key, count]) => {
        const boxEl = this.q(`.rw-stat-pill[data-stat="${key}"]`);
        if (!boxEl) return;
        const valEl = boxEl.querySelector("span");
        if (valEl) valEl.textContent = count;
        boxEl.style.display = count > 0 ? "" : "none";
        if (count > 0) visibleCards++;
      });

      const rowEl = this.q(".rw-stats-row");
      if (rowEl) rowEl.style.display = visibleCards > 0 ? "flex" : "none";
    },

    renderLogTable(data) {
      const tbody = this.q(".rw-log-tbody");
      if (!tbody) return;

      const activeStatuses = this.store.selectedStatuses || [];
      const rows = activeStatuses.length > 0
        ? (data || []).filter(item => activeStatuses.includes(String(item.statusMasuk || "").trim()))
        : (data || []);

      if (rows.length === 0) {
        const msg = activeStatuses.length > 0
          ? `Tidak ada log presensi dengan status terpilih pada periode ini.`
          : `Belum ada data presensi pada periode ini.`;
        tbody.innerHTML = `<tr><td colspan="5" style="padding:24px; color:#64748b;">${msg}</td></tr>`;
        return;
      }

      const sorted = [...rows].reverse();
      tbody.innerHTML = sorted.map(item => {
        const tgl = item.tanggal || item.isoDate || "-";
        const jamMasuk = item.jamMasuk || "-";
        const status = item.statusMasuk || "-";
        const jamPulang = item.jamPulang || "-";
        const ket = item.keterangan || item.catatan || "-";
        return `
          <tr>
            <td data-label="Tanggal"><strong>${tgl}</strong></td>
            <td data-label="Masuk">${jamMasuk}</td>
            <td data-label="Status">${status}</td>
            <td data-label="Pulang">${jamPulang}</td>
            <td data-label="Keterangan">${ket}</td>
          </tr>
        `;
      }).join("");
    },

    renderStatusChips() {
      const chipsWrap = this.q(".rw-active-chips");
      const triggerBtn = this.q(".rw-filter-trigger-btn");
      if (!chipsWrap) return;

      const selected = this.store.selectedStatuses || [];
      if (triggerBtn) {
        triggerBtn.classList.toggle("has-filter", selected.length > 0);
      }

      chipsWrap.innerHTML = selected.map(st => `
        <span class="rw-filter-chip">
          <span>${st}</span>
          <button type="button" class="rw-chip-remove" data-remove-status="${st}" title="Hapus filter ${st}">✕</button>
        </span>
      `).join("");

      chipsWrap.querySelectorAll("[data-remove-status]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const target = btn.getAttribute("data-remove-status");
          this.store.selectedStatuses = this.store.selectedStatuses.filter(s => s !== target);
          this.renderStatusChips();
          this.renderLogTable(this.store.currentFiltered);
        });
      });
    },

    openStatusFilterModal() {
      const modalId = "rwStatusFilterModal";
      let backdrop = document.getElementById(modalId);

      const defaultStatuses = [
        "Tepat Waktu", "Terlambat", "Sangat Terlambat", "Sangat Terlambat Sekali",
        "Hadir Tidak Presensi", "Prakerin", "Daring", "Dispensasi",
        "Sakit", "Izin", "Alpa"
      ];
      const dataStatuses = (this.store.currentFiltered || [])
        .map(r => String(r.statusMasuk || "").trim())
        .filter(s => s && s !== "-");
      const allOptions = Array.from(new Set([...defaultStatuses, ...dataStatuses]));

      if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.id = modalId;
        backdrop.className = "rw-status-modal-backdrop";
        document.body.appendChild(backdrop);

        backdrop.addEventListener("click", (e) => {
          if (e.target === backdrop) backdrop.classList.remove("is-open");
        });
      }

      const tempSelected = new Set(this.store.selectedStatuses || []);

      backdrop.innerHTML = `
        <div class="rw-status-modal-card">
          <div class="rw-status-modal-head">
            <h4>Filter Status Kehadiran</h4>
            <button type="button" class="modal-x-btn" id="${modalId}_close">✕</button>
          </div>
          <div class="rw-status-options-grid">
            ${allOptions.map(st => {
              const checked = tempSelected.has(st);
              return `
                <label class="rw-status-option-item ${checked ? "is-checked" : ""}">
                  <input type="checkbox" value="${st}" ${checked ? "checked" : ""}>
                  <span>${st}</span>
                </label>
              `;
            }).join("")}
          </div>
          <div class="rw-status-modal-foot">
            <button type="button" class="btn-secondary-modal" id="${modalId}_reset" style="height:34px; font-size:12px;">Reset</button>
            <button type="button" class="btn-primary-modal" id="${modalId}_apply" style="height:34px; font-size:12px;">Terapkan</button>
          </div>
        </div>
      `;

      backdrop.querySelectorAll(".rw-status-option-item input").forEach(cb => {
        cb.addEventListener("change", () => {
          cb.closest(".rw-status-option-item").classList.toggle("is-checked", cb.checked);
        });
      });

      document.getElementById(`${modalId}_close`).onclick = () => backdrop.classList.remove("is-open");

      document.getElementById(`${modalId}_reset`).onclick = () => {
        backdrop.querySelectorAll(".rw-status-option-item input").forEach(cb => {
          cb.checked = false;
          cb.closest(".rw-status-option-item").classList.remove("is-checked");
        });
      };

      document.getElementById(`${modalId}_apply`).onclick = () => {
        this.store.selectedStatuses = Array.from(
          backdrop.querySelectorAll(".rw-status-option-item input:checked")
        ).map(cb => cb.value);
        backdrop.classList.remove("is-open");
        this.renderStatusChips();
        this.renderLogTable(this.store.currentFiltered);
      };

      backdrop.classList.add("is-open");
    },

    formatChartAxisDate(item) {
      const iso = String(item.isoDate || item.date || "").trim();
      const ymd = iso.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (ymd) return `${ymd[3].padStart(2, "0")}/${ymd[2].padStart(2, "0")}/${ymd[1].slice(-2)}`;

      const str = String(item.tanggal || "").trim();
      const dmy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (dmy) return `${dmy[1].padStart(2, "0")}/${dmy[2].padStart(2, "0")}/${dmy[3].slice(-2)}`;

      const dmOnly = str.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (dmOnly && item.tahunAjaran) {
        const taParts = String(item.tahunAjaran).match(/(\d{4})\D+(\d{4})/);
        if (taParts) {
          const monthNum = parseInt(dmOnly[2], 10);
          const fullYear = monthNum >= 7 ? taParts[1] : taParts[2];
          return `${dmOnly[1].padStart(2, "0")}/${dmOnly[2].padStart(2, "0")}/${fullYear.slice(-2)}`;
        }
      }
      return str.slice(0, 8);
    },

    renderTrendChart(data, filterRange = "1w") {
      const canvas = this.q(".rw-trend-canvas");
      const wrapper = this.q(".rw-chart-inner");
      const scrollContainer = this.q(".rw-chart-scroll");
      if (!canvas || !wrapper || !scrollContainer) return;

      const ctx = canvas.getContext("2d");
      const renderScale = Math.max(window.devicePixelRatio || 1, 2);
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#824653";

      const levelColors = {
        8: "#15803d", 7: "#d97706", 6: "#c2410c", 5: "#b91c1c",
        4: "#7c3aed", 3: "#0284c7", 2: "#0891b2", 1: "#111827"
      };

      const getStatusInfo = (statusStr) => {
        const s = String(statusStr || "").toLowerCase();
        if (s.includes("prakerin") || s.includes("dispensasi") || s.includes("daring") || s.includes("tepat")) {
          return { level: 8, color: levelColors[8], fullName: statusStr || "Tepat Waktu" };
        }
        if (s.includes("sangat terlambat sekali")) return { level: 5, color: levelColors[5], fullName: "Sangat Terlambat Sekali" };
        if (s.includes("sangat terlambat")) return { level: 6, color: levelColors[6], fullName: "Sangat Terlambat" };
        if (s.includes("terlambat")) return { level: 7, color: levelColors[7], fullName: "Terlambat" };
        if (s.includes("tidak presensi")) return { level: 4, color: levelColors[4], fullName: "Hadir Tidak Presensi" };
        if (s.includes("izin")) return { level: 3, color: levelColors[3], fullName: "Izin" };
        if (s.includes("sakit")) return { level: 2, color: levelColors[2], fullName: "Sakit" };
        if (s.includes("alpa")) return { level: 1, color: levelColors[1], fullName: "Alpa" };
        return { level: 8, color: levelColors[8], fullName: statusStr || "Tepat Waktu" };
      };

      this.store.chartData = (data || []).map(item => {
        const st = getStatusInfo(item.statusMasuk);
        const jamClean = String(item.jamMasuk || "").trim();
        const pulangClean = String(item.jamPulang || "").trim();
        return {
          label: this.formatChartAxisDate(item),
          fullDate: item.tanggal || item.isoDate || "-",
          jamMasuk: (jamClean && jamClean !== "-") ? jamClean : "",
          jamPulang: (pulangClean && pulangClean !== "-") ? pulangClean : "-",
          val: st.level,
          color: st.color,
          fullName: st.fullName
        };
      });

      const points = this.store.chartData;
      const parentWidth = scrollContainer.clientWidth || 680;
      let computedWidth = parentWidth;

      if (filterRange !== "1w" && points.length * 82 > parentWidth) {
        computedWidth = points.length * 82 + 24;
      }

      wrapper.style.width = computedWidth + "px";
      canvas.width = computedWidth * dpr;
      canvas.height = wrapper.clientHeight * dpr;
      ctx.scale(dpr, dpr);

      const width = computedWidth;
      const height = wrapper.clientHeight;

      wrapper.style.width = width + "px";
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      canvas.width = Math.round(width * renderScale);
      canvas.height = Math.round(height * renderScale);
      ctx.scale(renderScale, renderScale);

      ctx.clearRect(0, 0, width, height);

      if (points.length === 0) {
        ctx.font = "500 12px Roboto";
        ctx.fillStyle = "#64748b";
        ctx.textAlign = "center";
        ctx.fillText("Belum ada data presensi pada periode ini", width / 2, height / 2);
        return;
      }

      const axisXPos = 6;
      const paddingLeft = 52;
      const paddingRight = 46;
      const paddingTop = 24;
      const paddingBottom = 56;
      const graphWidth = width - paddingLeft - paddingRight;
      const graphHeight = height - paddingTop - paddingBottom;
      const bottomAxisY = height - 20;

      points.forEach((item, i) => {
        item.x = points.length === 1 ? paddingLeft + graphWidth / 2 : paddingLeft + (i / (points.length - 1)) * graphWidth;
        item.y = paddingTop + graphHeight - ((item.val - 1) / 7) * graphHeight;
      });

      // Sumbu Y & X
      ctx.beginPath();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.moveTo(axisXPos, paddingTop);
      ctx.lineTo(axisXPos, bottomAxisY);
      ctx.lineTo(width - 20, bottomAxisY);
      ctx.stroke();

      for (let level = 1; level <= 8; level++) {
        const yPos = paddingTop + graphHeight - ((level - 1) / 7) * graphHeight;
        ctx.strokeStyle = "#e2e8f0";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(axisXPos + 5, yPos);
        ctx.lineTo(width - 20, yPos);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(axisXPos, yPos, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = levelColors[level];
        ctx.fill();
      }

      // Garis Kurva Bezier
      if (points.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2.5;
        for (let i = 0; i < points.length; i++) {
          const { x, y } = points[i];
          if (i === 0) ctx.moveTo(x, y);
          else {
            const prev = points[i - 1];
            const cpX = prev.x + (x - prev.x) / 2;
            ctx.bezierCurveTo(cpX, prev.y, cpX, y, x, y);
          }
        }
        ctx.stroke();
      }

      // Crosshair jika dot diklik
      if (this.store.selectedDotIndex !== null && points[this.store.selectedDotIndex]) {
        const sel = points[this.store.selectedDotIndex];
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(sel.x, paddingTop);
        ctx.lineTo(sel.x, bottomAxisY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Titik & Label Status + Jam
      points.forEach((item, idx) => {
        const isSelected = this.store.selectedDotIndex === idx;
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

        ctx.font = isSelected ? "700 9.5px Roboto" : "500 9px Roboto";
        ctx.textAlign = "center";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.strokeText(item.fullName, item.x, item.y + 14);
        ctx.fillStyle = item.color;
        ctx.fillText(item.fullName, item.x, item.y + 14);

        if (item.jamMasuk) {
          ctx.font = "700 9px Roboto";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3;
          ctx.strokeText(item.jamMasuk, item.x, item.y + 24);
          ctx.fillStyle = "#334155";
          ctx.fillText(item.jamMasuk, item.x, item.y + 24);
        }

        ctx.fillStyle = isSelected ? "#0f172a" : "#64748b";
        ctx.font = isSelected ? "700 10.5px Roboto" : "500 10px Roboto";
        ctx.fillText(item.label, item.x, height - 6);
      });

      // Drag-to-Scroll (Desktop) & Klik Titik
      if (!scrollContainer.dataset.hasDragScroll) {
        scrollContainer.dataset.hasDragScroll = "true";
        canvas.ondragstart = () => false;

        let isPointerDown = false;
        let hasDragged = false;
        let startClientX = 0;
        let scrollLeftStart = 0;

        scrollContainer.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          isPointerDown = true;
          hasDragged = false;
          startClientX = e.clientX;
          scrollLeftStart = scrollContainer.scrollLeft;
          scrollContainer.classList.add("is-dragging");
        });

        window.addEventListener("mousemove", (e) => {
          if (!isPointerDown) return;
          const dx = e.clientX - startClientX;
          if (Math.abs(dx) > 4) hasDragged = true;
          if (hasDragged) {
            e.preventDefault();
            scrollContainer.scrollLeft = scrollLeftStart - dx;
          }
        });

        window.addEventListener("mouseup", (e) => {
          if (!isPointerDown) return;
          isPointerDown = false;
          scrollContainer.classList.remove("is-dragging");

          if (!hasDragged && e.target === canvas) {
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            let nearest = null;
            let minDist = Infinity;

            (this.store.chartData || []).forEach((pt, idx) => {
              const d = Math.abs(pt.x - clickX);
              if (d < minDist && d <= 32) {
                minDist = d;
                nearest = idx;
              }
            });

            const prevScroll = scrollContainer.scrollLeft;
            this.store.selectedDotIndex = (this.store.selectedDotIndex === nearest) ? null : nearest;

            this.renderTrendChart(this.store.currentFiltered, this.store.activeRange);
            scrollContainer.scrollLeft = prevScroll;
          }
        });
      }
    }
  };

  global.RiwayatWidget = RiwayatWidget;
})(window);
