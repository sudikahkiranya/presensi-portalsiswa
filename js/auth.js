const API_URL = "https://script.google.com/macros/s/AKfycbxR0bwVJCXQY5DQKawqOBQO6vNwU8UMFLJ3AuBytSRgQR3TW9rJZ0r58JGkL2u_HxYMhw/exec";

(function initLoginTheme() {
  const savedTheme = localStorage.getItem("sisensi_active_theme") || "burgundy";
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.body.setAttribute("data-theme", savedTheme);
})();

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

  // Cek sesi tunggal idSiswa (sama persis dengan dashboard.html)
  const savedID = localStorage.getItem("idSiswa");
  if (savedID) {
    window.location.replace("dashboard");
  }
});

async function login() {
  const id = document.getElementById("idSiswa").value.trim();
  const kode = document.getElementById("kodeAkses").value.trim();
  const errorMsg = document.getElementById("errorMsg");

  errorMsg.style.display = "none";
  errorMsg.textContent = "";

  if (!id || !kode) {
    errorMsg.textContent = "NIS dan Password isi terlebih dahulu.";
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
      localStorage.setItem("idSiswa", result.siswa.id_siswa);
      localStorage.setItem("namaSiswa", result.siswa.nama);
      localStorage.setItem("kelasSiswa", result.siswa.kelas);
      localStorage.setItem("idRombel", result.siswa.id_rombel);

      showLoading("Memuat Portal...");
      window.location.href = "dashboard";
    } else {
      hideLoading();
      errorMsg.textContent = (result && result.message) ? result.message : "NIS atau Password salah!";
      errorMsg.style.display = "block";
    }
  } catch (err) {
    console.error("Login error:", err);
    hideLoading();
    errorMsg.textContent = "Gagal terhubung ke server.";
    errorMsg.style.display = "block";
  }
}