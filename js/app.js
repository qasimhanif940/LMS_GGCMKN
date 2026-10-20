/* =====================================================================
   app.js — section navigation + bootstrap (after auth)
   ===================================================================== */

document.addEventListener("auth:ready", (e) => {
  // Show user email
  const user = e.detail;
  const emailEl = document.getElementById("user-email");
  if (emailEl && user && user.email) {
    // Strip to short form for the badge
    const at = user.email.indexOf("@");
    emailEl.textContent = at > 0 ? user.email.slice(0, at) : user.email;
    emailEl.title = user.email;
  }

  // Wire navigation buttons (both desktop nav + bottom nav)
  document.querySelectorAll("[data-section]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.section;
      // Update active state on all nav elements with same data-section
      document.querySelectorAll("[data-section]").forEach(b => {
        if (b.dataset.section === target) b.classList.add("active");
        else if (b.dataset.section) b.classList.remove("active");
      });
      // Show only target section
      document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
      const sec = document.getElementById(`section-${target}`);
      if (sec) sec.classList.add("active");

      // Lazy-load section data
      if (target === "dashboard"  && typeof loadDashboard === "function") loadDashboard();
      if (target === "students"   && typeof loadStudents === "function") loadStudents();
      if (target === "books"      && typeof loadBooks === "function") loadBooks();
      if (target === "circulation") { /* data already loaded by students/books */ }
      if (target === "fines"      && typeof loadFines === "function") loadFines();
      if (target === "audit"      && typeof loadAudit === "function") loadAudit();
      if (target === "settings"   && typeof loadSettings === "function") loadSettings();

      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
});
