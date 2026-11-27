/* ==========================================================================
   SHARED UI MODULE — TOAST, MODAL NOTIF/CONFIRM/ERROR & LOADING OVERLAY
   ========================================================================== */
(function (window, document) {
  "use strict";

  let toastTimeout = null;
  let confirmCallback = null;

  function ensureMounted() {
    if (!document.body) return;

    if (!document.getElementById("appToast")) {
      const toastEl = document.createElement("div");
      toastEl.id = "appToast";
      toastEl.setAttribute("role", "alert");
      toastEl.setAttribute("aria-live", "assertive");
      toastEl.innerHTML = `
        <div class="toast-icon-bg" id="toastIconBg">✓</div>
        <div class="toast-content">
          <div class="toast-title" id="toastTitle">Notifikasi</div>
          <div class="toast-message" id="toastMessage">Pesan notifikasi...</div>
        </div>
        <button type="button" class="toast-close-btn" onclick="hideAppToast()" aria-label="Tutup">✕</button>
      `;
      document.body.appendChild(toastEl);
    }

    if (!document.getElementById("loadingOverlay")) {
      const loadingEl = document.createElement("div");
      loadingEl.id = "loadingOverlay";
      loadingEl.innerHTML = `
        <div>
          <div class="dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div id="loadingText">Memuat data...</div>
        </div>
      `;
      document.body.appendChild(loadingEl);
    }

    if (!document.getElementById("sharedErrorModal")) {
      const errModal = document.createElement("div");
      errModal.id = "sharedErrorModal";
      errModal.className = "shared-modal-overlay";
      errModal.innerHTML = `
        <div class="shared-modal-box" onclick="event.stopPropagation()">
          <div class="shared-modal-header">
            <div class="shared-icon-badge is-error">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div class="shared-header-text">
              <h3 id="sharedErrorTitle" class="shared-modal-title">Terjadi Kesalahan</h3>
              <p id="sharedErrorSubtitle" class="shared-modal-subtitle">Terdapat kendala yang perlu diperhatikan.</p>
            </div>
          </div>
          <div class="shared-error-alert">
            <p id="sharedErrorMessage"></p>
          </div>
          <div class="shared-modal-footer">
            <button type="button" class="shared-btn-danger" onclick="closeSharedErrorModal()">Mengerti</button>
          </div>
        </div>
      `;
      errModal.addEventListener("click", (e) => {
        if (e.target === errModal) closeSharedErrorModal();
      });
      document.body.appendChild(errModal);
    }

    if (!document.getElementById("sharedNotifModal")) {
      const notifModal = document.createElement("div");
      notifModal.id = "sharedNotifModal";
      notifModal.className = "shared-modal-overlay";
      notifModal.innerHTML = `
        <div class="shared-modal-box" onclick="event.stopPropagation()">
          <div class="shared-modal-header">
            <div id="sharedNotifBadge" class="shared-icon-badge is-success">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div class="shared-header-text">
              <h3 id="sharedNotifTitle" class="shared-modal-title">Informasi</h3>
              <p id="sharedNotifSubtitle" class="shared-modal-subtitle"></p>
            </div>
          </div>
          <p id="sharedNotifMessage" class="shared-plain-message"></p>
          <div class="shared-modal-footer">
            <button type="button" class="shared-btn-confirm" onclick="closeSharedNotifModal()">Tutup</button>
          </div>
        </div>
      `;
      notifModal.addEventListener("click", (e) => {
        if (e.target === notifModal) closeSharedNotifModal();
      });
      document.body.appendChild(notifModal);
    }

    if (!document.getElementById("sharedConfirmModal")) {
      const confirmModal = document.createElement("div");
      confirmModal.id = "sharedConfirmModal";
      confirmModal.className = "shared-modal-overlay";
      confirmModal.innerHTML = `
        <div class="shared-modal-box" onclick="event.stopPropagation()">
          <h3 id="sharedConfirmTitle" class="shared-modal-title" style="text-align:left; margin-bottom:8px !important;">Konfirmasi</h3>
          <p id="sharedConfirmText" class="shared-plain-message">Yakin ingin melanjutkan?</p>
          <div class="shared-modal-actions">
            <button type="button" class="shared-btn-cancel" onclick="closeSharedConfirmModal()">Batal</button>
            <button type="button" id="sharedConfirmYesBtn" class="shared-btn-confirm" onclick="handleSharedConfirmYes()">Lanjut</button>
          </div>
        </div>
      `;
      confirmModal.addEventListener("click", (e) => {
        if (e.target === confirmModal) closeSharedConfirmModal();
      });
      document.body.appendChild(confirmModal);
    }
  }

  /* --- Loading --- */
  function showLoading(arg1 = "Memproses...", arg2 = "Memproses...") {
    ensureMounted();
    const el = document.getElementById("loadingOverlay");
    const label = document.getElementById("loadingText");

    if (typeof arg1 === "boolean") {
      if (arg1) {
        if (label) label.textContent = arg2;
        if (el) el.classList.add("active");
      } else {
        hideLoading();
      }
      return;
    }

    if (label) label.textContent = arg1 || "Memproses...";
    if (el) el.classList.add("active");
  }

  function hideLoading() {
    const el = document.getElementById("loadingOverlay");
    if (el) el.classList.remove("active");
  }

  /* --- Toast --- */
  function showToast(message, type = "info", duration = 3000) {
    ensureMounted();
    const toast = document.getElementById("appToast");
    const titleEl = document.getElementById("toastTitle");
    const msgEl = document.getElementById("toastMessage");
    const iconBg = document.getElementById("toastIconBg");
    if (!toast) return;

    const normalizedType = ["success", "error", "info"].includes(type) ? type : "info";
    toast.setAttribute("data-type", normalizedType);

    if (normalizedType === "success") {
      if (titleEl) titleEl.textContent = "Sukses";
      if (iconBg) iconBg.textContent = "✓";
    } else if (normalizedType === "error") {
      if (titleEl) titleEl.textContent = "Gagal";
      if (iconBg) iconBg.textContent = "✕";
    } else {
      if (titleEl) titleEl.textContent = "Informasi";
      if (iconBg) iconBg.textContent = "ℹ";
    }

    if (msgEl) msgEl.textContent = message || "";
    toast.classList.add("is-visible");

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      hideAppToast();
    }, duration);
  }

  function hideAppToast() {
    const toast = document.getElementById("appToast");
    if (toast) toast.classList.remove("is-visible");
  }

  /* --- Error Modal --- */
  function openSharedErrorModal(message, title = "Terjadi Kesalahan", subtitle = "Terdapat kendala yang perlu diperhatikan.") {
    ensureMounted();
    const modal = document.getElementById("sharedErrorModal");
    const titleEl = document.getElementById("sharedErrorTitle");
    const subEl = document.getElementById("sharedErrorSubtitle");
    const msgEl = document.getElementById("sharedErrorMessage");

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
    if (msgEl) msgEl.textContent = message || "Terjadi kesalahan saat memproses data.";

    if (modal) {
      document.body.classList.add("modal-open");
      modal.classList.add("active");
    } else {
      showToast(message, "error");
    }
  }

  function closeSharedErrorModal() {
    const modal = document.getElementById("sharedErrorModal");
    if (modal) modal.classList.remove("active");
    document.body.classList.remove("modal-open");
  }

  /* --- Notif Modal --- */
  function openSharedNotifModal({ title = "Informasi", subtitle = "", message = "", type = "success" } = {}) {
    ensureMounted();
    const modal = document.getElementById("sharedNotifModal");
    const titleEl = document.getElementById("sharedNotifTitle");
    const subEl = document.getElementById("sharedNotifSubtitle");
    const msgEl = document.getElementById("sharedNotifMessage");
    const badgeEl = document.getElementById("sharedNotifBadge");

    if (titleEl) titleEl.textContent = title;
    if (subEl) {
      subEl.textContent = subtitle;
      subEl.style.display = subtitle ? "" : "none";
    }
    if (msgEl) msgEl.textContent = message;
    if (badgeEl) {
      badgeEl.className = `shared-icon-badge ${type === "error" ? "is-error" : type === "info" ? "is-info" : "is-success"}`;
    }

    if (modal) {
      document.body.classList.add("modal-open");
      modal.classList.add("active");
    }
  }

  function closeSharedNotifModal() {
    const modal = document.getElementById("sharedNotifModal");
    if (modal) modal.classList.remove("active");
    document.body.classList.remove("modal-open");
  }

  /* --- Confirm Modal --- */
  function openSharedConfirmModal(text, onYes, title = "Konfirmasi", yesLabel = "Lanjut") {
    ensureMounted();
    const modal = document.getElementById("sharedConfirmModal");
    const titleEl = document.getElementById("sharedConfirmTitle");
    const textEl = document.getElementById("sharedConfirmText");
    const yesBtn = document.getElementById("sharedConfirmYesBtn");

    confirmCallback = typeof onYes === "function" ? onYes : null;
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text || "Yakin ingin melanjutkan?";
    if (yesBtn) yesBtn.textContent = yesLabel;

    if (modal) {
      document.body.classList.add("modal-open");
      modal.classList.add("active");
    }
  }

  function closeSharedConfirmModal() {
    const modal = document.getElementById("sharedConfirmModal");
    if (modal) modal.classList.remove("active");
    document.body.classList.remove("modal-open");
    confirmCallback = null;
  }

  function handleSharedConfirmYes() {
    const cb = confirmCallback;
    closeSharedConfirmModal();
    if (typeof cb === "function") cb();
  }

  document.addEventListener("DOMContentLoaded", ensureMounted);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.getElementById("sharedConfirmModal")?.classList.contains("active")) {
      closeSharedConfirmModal();
    } else if (document.getElementById("sharedErrorModal")?.classList.contains("active")) {
      closeSharedErrorModal();
    } else if (document.getElementById("sharedNotifModal")?.classList.contains("active")) {
      closeSharedNotifModal();
    }
  });

  // Expose global helpers agar langsung bisa dipanggil di halaman manapun
  window.SharedUI = {
    ensureMounted,
    showLoading,
    hideLoading,
    showToast,
    hideAppToast,
    openErrorModal: openSharedErrorModal,
    closeErrorModal: closeSharedErrorModal,
    openNotifModal: openSharedNotifModal,
    closeNotifModal: closeSharedNotifModal,
    openConfirmModal: openSharedConfirmModal,
    closeConfirmModal: closeSharedConfirmModal
  };

  window.showLoading = showLoading;
  window.hideLoading = hideLoading;
  window.showToast = showToast;
  window.hideAppToast = hideAppToast;
  window.openErrorModal = openSharedErrorModal;
  window.closeError = closeSharedErrorModal;
  window.closeNotif = closeSharedNotifModal;
  window.closeConfirm = closeSharedConfirmModal;
  window.handleConfirmYes = handleSharedConfirmYes;
})(window, document);