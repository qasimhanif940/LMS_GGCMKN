/* =====================================================================
   audit.js — read-only audit log
   ===================================================================== */

document.addEventListener("auth:ready", loadAudit);

async function loadAudit() {
  const tbody = document.querySelector("#table-audit tbody");
  tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center" style="padding:24px;">Loading…</td></tr>`;
  try {
    const { data, error } = await sb
      .from("audit_log")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = data || [];
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center" style="padding:24px;">No audit entries yet.</td></tr>`;
      return;
    }
    const actionBadges = {
      "Add Student": "info",
      "Update Student": "info",
      "Remove Student": "danger",
      "Add Book": "info",
      "Update Book": "info",
      "Remove Book": "danger",
      "Borrow": "warning",
      "Return": "success",
      "Renew": "warning",
      "Mark Fine Paid": "success",
      "Recalculate AvailableCopies": "muted"
    };
    tbody.innerHTML = rows.map(a => `
      <tr>
        <td class="muted-cell">${UI.fmtDateTime(a.timestamp)}</td>
        <td class="font-mono" style="font-size:11px;">${UI.escapeHtml(a.user_email || "—")}</td>
        <td><span class="badge ${actionBadges[a.action] || "muted"}">${UI.escapeHtml(a.action || "—")}</span></td>
        <td>${UI.escapeHtml(a.detail || "—")}</td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center" style="padding:24px;">Error: ${UI.escapeHtml(err.message)}</td></tr>`;
  }
}

document.addEventListener("click", e => {
  if (e.target.closest("#btn-refresh-audit")) loadAudit();
});
