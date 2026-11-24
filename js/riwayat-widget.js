/* ==========================================================================
   RIWAYAT PRESENSI WIDGET ENGINE (PORTAL SISWA & PORTAL PIKET)
   ========================================================================== */
(function (global) {
  const RiwayatWidget = {
    apiUrl: "",
    mode: "siswa", // "siswa" | "piket"
    layoutVariant: "piket", // "piket" | "siswa-split"
    defaultRange: "1w",
    container: null,
    onNotify: null,
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
      viewMode: "chart" // "chart" | "log"
    },

    init(options = {}) {
      this.apiUrl = options.apiUrl || (typeof API_URL !== "undefined" ? API_URL : "");
      this.mode = options.mode || "siswa";
      this.layoutVariant = options.layoutVariant || (this.mode === "siswa" ? "siswa-split" : "piket");
      this.defaultRange = options.defaultRange || (this.mode === "siswa" ? "1m" : "1w");
      this.onNotify = typeof options.onNotify === "function" ? options.onNotify : null;
      this.onDataFiltered = typeof options.onDataFiltered === "function" ? options.onDataFiltered : null;
      this.store.activeRange = this.defaultRange;

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
      return this.container ? this.container.querySelector(selector) : null;
    },

    notify(msg, type = "info") {
      if (this.onNotify) this.onNotify(msg, type);
      else if (typeof showToast === "function") showToast(msg, type);
      else alert(msg);
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

      const chartBlockHTML = `
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

      const bodyContentHTML = this.layoutVariant === "siswa-split" ? `
        <div class="rw-split-layout">
          <div class="rw-pane-left">
            <div class="rw-pane-header">
              <div class="rw-pane-title-group">
                <span class="rw-pane-title">Riwayat Presensi</span>
                <span class="rw-discipline-pill is-good">-</span>
              </div>
              <div class="rw-mode-switch">
                <button type="button" class="rw-mode-btn active" data-view="chart">Kurva</button>
                <button type="button" class="rw-mode-btn" data-view="log">Log</button>
              </div>
            </div>

            <div class="rw-view-chart">${chartBlockHTML}</div>

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

          <div class="rw-vertical-divider"></div>

          <div class="rw-pane-right">
            <div class="rw-pane-header">
              <span class="rw-pane-title">Rekap Kehadiran</span>
              <span class="rate-pill-badge rw-rate-badge">100%</span>
            </div>

            <div class="rekap-group-label">Rincian Status Hadir</div>
            <div class="rekap-number-grid">
              <div class="num-box tone-hadir span-full"><span class="num-box-lbl">Tepat Waktu</span><span class="num-box-val" data-rekap="tepat">0</span></div>
              <div class="num-box tone-late"><span class="num-box-lbl">Terlambat</span><span class="num-box-val" data-rekap="terlambat">0</span></div>
              <div class="num-box tone-sangat-late"><span class="num-box-lbl">Sangat Terlambat</span><span class="num-box-val" data-rekap="sangatTerlambat">0</span></div>
              <div class="num-box tone-sangat-late-sekali"><span class="num-box-lbl">Sangat Terlambat Sekali</span><span class="num-box-val" data-rekap="sangatTerlambatSekali">0</span></div>
              <div class="num-box tone-htp"><span class="num-box-lbl">Hadir Tidak Presensi</span><span class="num-box-val" data-rekap="htp">0</span></div>
              <div class="rekap-subgrid-3 span-full">
                <div class="num-box tone-prakerin"><span class="num-box-lbl">Prakerin</span><span class="num-box-val" data-rekap="prakerin">0</span></div>
                <div class="num-box tone-daring"><span class="num-box-lbl">Daring</span><span class="num-box-val" data-rekap="daring">0</span></div>
                <div class="num-box tone-dispensasi"><span class="num-box-lbl">Dispensasi</span><span class="num-box-val" data-rekap="dispensasi">0</span></div>
              </div>
              <div class="num-box tone-total-hadir span-full"><span class="num-box-lbl">Total Kehadiran</span><span class="num-box-val" data-rekap="totalHadir">0</span></div>
            </div>

            <div class="rekap-group-label" style="margin-top:12px;">Rincian Status Tidak Hadir</div>
            <div class="rekap-subgrid-3">
              <div class="num-box tone-sakit"><span class="num-box-lbl">Sakit</span><span class="num-box-val" data-rekap="sakit">0</span></div>
              <div class="num-box tone-izin"><span class="num-box-lbl">Izin</span><span class="num-box-val" data-rekap="izin">0</span></div>
              <div class="num-box tone-alpa"><span class="num-box-lbl">Alpa</span><span class="num-box-val" data-rekap="alpa">0</span></div>
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
        ${chartBlockHTML}
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
            ${bodyContentHTML}
          </div>
        </div>
      `;

      if (this.mode === "piket") {
        const inp = this.q(".rw-input-nis");
        const clr = this.q(".rw-clear-nis");
        const btnCek = this.q(".rw-btn-cek");
        inp?.addEventListener("input", () => { if (clr) clr.hidden = !inp.value; });
        inp?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); this.searchByNis(); } });
        clr?.addEventListener("click", () => { if (inp) { inp.value = ""; inp.focus(); } clr.hidden = true; });
        btnCek?.addEventListener("click", () => this.searchByNis());
      }

      this.container.querySelectorAll(".rw-mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const view = btn.dataset.view;
          this.container.querySelectorAll(".rw-mode-btn").forEach(b => b.classList.toggle("active", b === btn));
          const cView = this.q(".rw-view-chart");
          const lView = this.q(".rw-view-log");
          if (cView) cView.style.display = view === "chart" ? "block" : "none";
          if (lView) lView.style.display = view === "log" ? "block" : "none";
          if (view === "chart") this.renderTrendChart(this.store.currentFiltered, this.store.activeRange);
        });
      });

      this.q(".rw-apply-sem")?.addEventListener("click", () => this.applySemesterFilter());
      this.q(".rw-apply-ta")?.addEventListener("click", () => this.applyTaFilter());
      this.q(".rw-apply-custom")?.addEventListener("click", () => this.applyCustomDateFilter());
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
        <div class="rw-dropdown-menu"><div class="rw-dropdown-menu-inner"></div></div>
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
        { value: "1m", label: "Bulan Berjalan (30 Hari)" },
        { value: "semester_select", label: "Per Semester" },
        { value: "ta_select", label: "Per Tahun Ajaran" },
        { value: "custom", label: "Kustom Rentang Tanggal" }
      ];

      this.createDropdown(rangeDropEl, rangeOptions, this.defaultRange, async (val) => {
        this.q(".rw-sub-semester").style.display = "none";
        this.q(".rw-sub-ta").style.display = "none";
        this.q(".rw-sub-custom").style.display = "none";

        if (val === "semester_select") this.q(".rw-sub-semester").style.display = "flex";
        else if (val === "ta_select") this.q(".rw-sub-ta").style.display = "flex";
        else if (val === "custom") this.q(".rw-sub-custom").style.display = "flex";
        else if (val === "1m") {
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
        return;
      }
      this.loadStudentHistory(nis);
    },

    setSearchDisabled(isDisabled) {
      const grid = this.q(".rw-search-grid");
      if (!grid) return;
      grid.classList.toggle("is-loading", isDisabled);
      ["rw-input-nis", "rw-clear-nis", "rw-btn-cek"].forEach(cls => {
        const el = this.q(`.${cls}`);
        if (el) el.disabled = isDisabled;
      });
    },

    async loadStudentHistory(idSiswa) {
      const cleanId = String(idSiswa || "").trim();
      if (!cleanId) return;

      const placeholderBox = this.q(".rw-empty-box");
      const loadingBox = this.q(".rw-loading-box");
      const resultWrap = this.q(".rw-result-wrap");
      const fetchMode = this.defaultRange === "1m" ? "archive" : "recent";

      placeholderBox.style.display = "none";
      resultWrap.style.display = "none";
      loadingBox.style.display = "flex";
      this.setSearchDisabled(true);

      try {
        let data = this.store.fullCache[cleanId] || (fetchMode === "recent" ? this.store.recentCache[cleanId] : null);

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
          if (!data || data.success === false) throw new Error(data?.message || "Data siswa tidak ditemukan.");

          if (fetchMode === "archive") this.store.fullCache[cleanId] = data;
          else this.store.recentCache[cleanId] = data;
        }

        this.store.hasFullArchive = Boolean(this.store.fullCache[cleanId]);
        this.store.currentSiswa = data.siswa || { id_siswa: cleanId, nama: "Siswa", kelas: "-" };
        this.store.rawPresensi = Array.isArray(data.rawPresensi) ? data.rawPresensi : [];
        this.store.filterOptions = data.filterOptions || { taList: [], semesterMap: {} };
        this.store.selectedDotIndex = null;

        if (this.mode === "piket") {
          const namaEl = this.q(".rw-res-nama");
          const kelasEl = this.q(".rw-res-kelas");
          if (namaEl) namaEl.textContent = this.store.currentSiswa.nama || "-";
          if (kelasEl) kelasEl.textContent = this.store.currentSiswa.kelas || "-";
          this.q(".rw-result-divider").style.display = "block";
          this.q(".rw-student-box").style.display = "flex";
        }

        this.populateSubFilters();
        loadingBox.style.display = "none";
        resultWrap.style.display = "block";
        this.applyFilterRange(this.defaultRange);
      } catch (err) {
        console.error("[RiwayatWidget] Gagal load history:", err);
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
        ? sems.map(sem => ({ value: sem, label: sem === "Ganjil" ? "Ganjil (Semester 1)" : (sem === "Genap" ? "Genap (Semester 2)" : sem) }))
        : [{ value: "", label: "Tidak ada semester" }];
      this.createDropdown(selSem, semOptions, semOptions[0].value, null);
    },

    async ensureFullArchive() {
      const cleanId = String(this.store.currentSiswa?.id_siswa || "").trim();
      if (!cleanId) return false;
      if (this.store.hasFullArchive) return true;

      const loadingBox = this.q(".rw-loading-box");
      const resultWrap = this.q(".rw-result-wrap");
      resultWrap.style.display = "none";
      loadingBox.style.display = "flex";
      this.setSearchDisabled(true);

      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "getHistoryPresensiSiswa", idSiswa: cleanId, mode: "archive" })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data || data.success === false) throw new Error(data?.message || "Gagal memuat arsip.");

        this.store.fullCache[cleanId] = data;
        this.store.rawPresensi = Array.isArray(data.rawPresensi) ? data.rawPresensi : [];
        this.store.filterOptions = data.filterOptions || this.store.filterOptions;
        this.store.hasFullArchive = true;
        this.populateSubFilters();
        loadingBox.style.display = "none";
        resultWrap.style.display = "block";
        return true;
      } catch (err) {
        loadingBox.style.display = "none";
        resultWrap.style.display = "block";
        this.notify(err.message || "Gagal memuat arsip.", "error");
        return false;
      } finally {
        this.setSearchDisabled(false);
      }
    },

    async applySemesterFilter() {
      const ta = this.q(".rw-sel-ta-sem")?.getAttribute("data-value") || "";
      const sem = this.q(".rw-sel-sem-type")?.getAttribute("data-value") || "";
      if (ta && sem && await this.ensureFullArchive()) this.applyFilterRange("semester", ta, sem);
    },

    async applyTaFilter() {
      const ta = this.q(".rw-sel-ta-full")?.getAttribute("data-value") || "";
      if (ta && await this.ensureFullArchive()) this.applyFilterRange("tahun_ajaran", ta);
    },

    async applyCustomDateFilter() {
      const start = this.q(".rw-date-start")?.value || "";
      const end = this.q(".rw-date-end")?.value || "";
      if (!start || !end) return this.notify("Pilih tanggal mulai dan akhir.", "info");
      if (start > end) return this.notify("Tanggal mulai melebihi tanggal akhir.", "error");
      if (await this.ensureFullArchive()) this.applyFilterRange("custom", start, end);
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

      if (rangeType === "1w") filtered = all.slice(-7);
      else if (rangeType === "1m") filtered = all.slice(-30);
      else if (rangeType === "semester") {
        const targetDigit = param2 === "Ganjil" ? "1" : (param2 === "Genap" ? "2" : "");
        filtered = all.filter(p => p.tahunAjaran === param1 && (p.idSemester ? p.idSemester.endsWith(targetDigit) : p.semester === param2));
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
      this.renderLogTable(filtered);
      this.renderTrendChart(filtered, rangeType);
      if (this.onDataFiltered) this.onDataFiltered(filtered, rangeType);
    },

    updateSummaryCards(data) {
      const c = {
        tepat: 0, terlambat: 0, sangatTerlambat: 0, sangatTerlambatSekali: 0,
        htp: 0, prakerin: 0, daring: 0, dispensasi: 0, sakit: 0, izin: 0, alpa: 0
      };

      data.forEach(item => {
        const st = String(item.statusMasuk || "").trim().toLowerCase();
        if (st.includes("tepat")) c.tepat++;
        else if (st.includes("sangat terlambat sekali")) c.sangatTerlambatSekali++;
        else if (st.includes("sangat terlambat")) c.sangatTerlambat++;
        else if (st.includes("terlambat")) c.terlambat++;
        else if (st.includes("tidak presensi") || st === "htp") c.htp++;
        else if (st.includes("prakerin") || st.includes("pkl")) c.prakerin++;
        else if (st.includes("daring")) c.daring++;
        else if (st.includes("dispensasi")) c.dispensasi++;
        else if (st.includes("sakit")) c.sakit++;
        else if (st.includes("izin")) c.izin++;
        else if (st.includes("alpa")) c.alpa++;
      });

      if (this.layoutVariant === "siswa-split") {
        const totalHadir = c.tepat + c.terlambat + c.sangatTerlambat + c.sangatTerlambatSekali + c.htp + c.prakerin + c.daring + c.dispensasi;
        const totalAll = totalHadir + c.sakit + c.izin + c.alpa;
        const rate = totalAll > 0 ? Math.round((totalHadir / totalAll) * 100) : 100;

        const map = { ...c, totalHadir };
        Object.entries(map).forEach(([k, v]) => {
          const el = this.q(`[data-rekap="${k}"]`);
          if (el) el.textContent = v;
        });

        const rateEl = this.q(".rw-rate-badge");
        if (rateEl) rateEl.textContent = `${rate}%`;

        const pill = this.q(".rw-discipline-pill");
        if (pill) {
          const totalLate = c.terlambat + c.sangatTerlambat + c.sangatTerlambatSekali;
          pill.classList.remove("is-good", "is-warning", "is-danger");
          if (c.alpa >= 2 || totalLate >= 4) {
            pill.classList.add("is-danger");
            pill.textContent = `Perlu Perhatian (${totalLate} Terlambat, ${c.alpa} Alpa)`;
          } else if (totalLate >= 1 || c.alpa === 1) {
            pill.classList.add("is-warning");
            pill.textContent = `${totalLate}x Terlambat • Tetap Jaga Disiplin`;
          } else {
            pill.classList.add("is-good");
            pill.textContent = "Disiplin Sangat Baik";
          }
        }
        return;
      }

      // Mode Piket (Horizontal Pill)
      const piketCounts = {
        tepat: c.tepat,
        terlambat: c.terlambat + c.sangatTerlambat + c.sangatTerlambatSekali,
        htp: c.htp, prakerin: c.prakerin, dispensasi: c.dispensasi,
        daring: c.daring, sakit: c.sakit, izin: c.izin, alpa: c.alpa
      };
      let visible = 0;
      Object.entries(piketCounts).forEach(([key, count]) => {
        const boxEl = this.q(`.rw-stat-pill[data-stat="${key}"]`);
        if (!boxEl) return;
        boxEl.querySelector("span").textContent = count;
        boxEl.style.display = count > 0 ? "" : "none";
        if (count > 0) visible++;
      });
      const rowEl = this.q(".rw-stats-row");
      if (rowEl) rowEl.style.display = visible > 0 ? "flex" : "none";
    },

    renderLogTable(data) {
      const tbody = this.q(".rw-log-tbody");
      if (!tbody) return;
      const reversed = [...data].reverse();
      tbody.innerHTML = reversed.length === 0
        ? `<tr><td colspan="5" style="padding:20px; color:#64748b;">Belum ada catatan presensi pada periode ini.</td></tr>`
        : reversed.map(r => `
          <tr>
            <td data-label="Tanggal"><strong>${r.tanggal || "-"}</strong></td>
            <td data-label="Masuk">${r.jamMasuk || "-"}</td>
            <td data-label="Status">${r.statusMasuk || "-"}</td>
            <td data-label="Pulang">${r.jamPulang || "-"}</td>
            <td data-label="Keterangan">${r.keterangan || "-"}</td>
          </tr>
        `).join("");
    },

    formatChartAxisDate(item) {
      const iso = String(item.isoDate || item.date || "").trim();
      const ymd = iso.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (ymd) return `${ymd[3].padStart(2, "0")}/${ymd[2].padStart(2, "0")}/${ymd[1].slice(-2)}`;
      const str = String(item.tanggal || "").trim();
      const dmy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (dmy) return `${dmy[1].padStart(2, "0")}/${dmy[2].padStart(2, "0")}/${dmy[3].slice(-2)}`;
      return str.slice(0, 8);
    },

    renderTrendChart(data, filterRange = "1w") {
      const canvas = this.q(".rw-trend-canvas");
      const wrapper = this.q(".rw-chart-inner");
      const scrollContainer = this.q(".rw-chart-scroll");
      if (!canvas || !wrapper || !scrollContainer) return;

      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#824653";
      const levelColors = { 8: "#15803d", 7: "#d97706", 6: "#c2410c", 5: "#b91c1c", 4: "#7c3aed", 3: "#0284c7", 2: "#0891b2", 1: "#111827" };

      const getStatusInfo = (statusStr) => {
        const s = String(statusStr || "").toLowerCase();
        if (s.includes("prakerin") || s.includes("dispensasi") || s.includes("daring") || s.includes("tepat")) return { level: 8, color: levelColors[8], fullName: statusStr || "Tepat Waktu" };
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
        return { label: this.formatChartAxisDate(item), jamMasuk: (jamClean && jamClean !== "-") ? jamClean : "", val: st.level, color: st.color, fullName: st.fullName };
      });

      const points = this.store.chartData;
      const parentWidth = scrollContainer.clientWidth || 680;
      let computedWidth = parentWidth;
      if (filterRange !== "1w" && points.length * 82 > parentWidth) computedWidth = points.length * 82 + 24;

      wrapper.style.width = computedWidth + "px";
      canvas.width = computedWidth * dpr;
      canvas.height = wrapper.clientHeight * dpr;
      ctx.scale(dpr, dpr);

      const width = computedWidth;
      const height = wrapper.clientHeight;
      ctx.clearRect(0, 0, width, height);

      if (points.length === 0) {
        ctx.font = "500 12px Roboto";
        ctx.fillStyle = "#64748b";
        ctx.textAlign = "center";
        ctx.fillText("Belum ada data presensi pada periode ini", width / 2, height / 2);
        return;
      }

      const axisXPos = 6, paddingLeft = 52, paddingRight = 46, paddingTop = 24, paddingBottom = 56;
      const graphWidth = width - paddingLeft - paddingRight;
      const graphHeight = height - paddingTop - paddingBottom;
      const bottomAxisY = height - 20;

      points.forEach((item, i) => {
        item.x = points.length === 1 ? paddingLeft + graphWidth / 2 : paddingLeft + (i / (points.length - 1)) * graphWidth;
        item.y = paddingTop + graphHeight - ((item.val - 1) / 7) * graphHeight;
      });

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

      points.forEach((item, idx) => {
        const isSelected = this.store.selectedDotIndex === idx;
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

      scrollContainer.scrollLeft = scrollContainer.scrollWidth;
    }
  };

  global.RiwayatWidget = RiwayatWidget;
})(window);