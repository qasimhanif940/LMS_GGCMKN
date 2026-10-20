/* =====================================================================
   settings.js — library rules
   ===================================================================== */

document.addEventListener("auth:ready", loadSettings);

async function loadSettings() {
  try {
    const { data, error } = await sb.from("settings").select("*");
    if (error) throw error;
    const map = Object.fromEntries((data || []).map(r => [r.key, r.value]));
    document.getElementById("set-fine-per-day").value    = map.finePerDay || 10;
    document.getElementById("set-borrow-limit").value     = map.borrowLimit || 3;
    document.getElementById("set-due-days").value           = map.dueDays || 14;
    document.getElementById("set-reminder-days").value     = map.reminderDaysBefore || 2;
    document.getElementById("set-librarian-email").value    = map.librarianEmail || "";
  } catch (err) {
    UI.toast("Failed to load settings: " + err.message, "error");
  }
}

document.addEventListener("click", async e => {
  if (e.target.closest("#btn-save-settings")) {
    const payload = {
      finePerDay:         document.getElementById("set-fine-per-day").value,
      borrowLimit:        document.getElementById("set-borrow-limit").value,
      dueDays:             document.getElementById("set-due-days").value,
      reminderDaysBefore: document.getElementById("set-reminder-days").value,
      librarianEmail:    document.getElementById("set-librarian-email").value.trim()
    };
    try {
      UI.showLoading("Saving…");
      const updates = Object.entries(payload).map(([key, value]) =>
        sb.from("settings").upsert({ key, value })
      );
      await Promise.all(updates);
      UI.hideLoading();
      UI.toast("Settings saved", "success");
    } catch (err) {
      UI.hideLoading();
      UI.toast(err.message || "Save failed", "error");
    }
  }
  if (e.target.closest("#btn-reload-settings")) loadSettings();
});
