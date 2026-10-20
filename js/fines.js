/* =====================================================================
   fines.js — list, mark paid
   ===================================================================== */

let ALL_FINES = [];
let SHOW_UNPAID_ONLY = false;

document.addEventListener("auth:ready", loadFines);

async function loadFines() {
  const tbody = document.querySelector("#table-fines tbody");
  tbody.innerHTML = `<tr><td colspan="9" class="text-muted text-center" style="padding:24px;">Loading…</td></tr>`;
  try {
    const { data, error } = await sb
      .from("fines")
      .select("*")
      .order("date_levied", { ascending: false });
    if (error) throw error;
    ALL_FINES = data || [];
    renderFines();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-danger text-center" style="padding:24px;">Error: ${UI.escapeHtml(err.message)}</td></tr>`;
  }
}

function renderFines() {
  const tbody = document.querySelector("#table-fines tbody");
  let list = ALL_FINES.slice();
  if (SHOW_UNPAID_ONLY) list = list.filter(f => f.status === "Unpaid");

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-muted text-center" style="padding:24px;">${SHOW_UNPAID_ONLY ? "🎉 No unpaid fines." : "No fines recorded."}</td></tr>`;
    return;
  }

  const totalUnpaid = list.filter(f => f.status === "Unpaid").reduce((s, f) => s + Number(f.amount), 0);

  tbody.innerHTML = `
    <tr style="background:var(--warning-50);">
      <td colspan="9" style="font-weight:700;color:var(--accent-dark);">
        Showing ${list.length} fine(s) · Unpaid total: Rs. ${totalUnpaid.toLocaleString()}
      </td>
    </tr>
  ` + list.map(f => `
    <tr>
      <td class="font-mono">${UI.escapeHtml(f.fine_id)}</td>
      <td>${UI.escapeHtml(f.student_name || "—")}</td>
      <td class="font-mono">${UI.escapeHtml(f.user_id || "—")}</td>
      <td>${UI.escapeHtml(f.book_title || "—")}<br><span class="text-muted" style="font-size:11px;">${UI.escapeHtml(f.copy_id || "—")}</span></td>
      <td class="num-cell"><strong>Rs. ${Number(f.amount).toLocaleString()}</strong></td>
      <td class="num-cell">${f.days_late || "—"}</td>
      <td class="muted-cell">${UI.fmtDate(f.date_levied)}</td>
      <td><span class="badge ${f.status === "Paid" ? "success" : "danger"}">${UI.escapeHtml(f.status)}</span></td>
      <td>
        ${f.status === "Unpaid"
          ? `<button class="btn success sm" data-pay="${UI.escapeHtml(f.fine_id)}">Mark Paid</button>`
          : `<span class="text-muted" style="font-size:11px;">Cleared ${UI.fmtDate(f.date_cleared)}</span>`}
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-pay]").forEach(btn => {
    btn.onclick = async () => {
      const fineId = btn.dataset.pay;
      const f = ALL_FINES.find(x => x.fine_id === fineId);
      const ok = await UI.confirm(`Mark fine <strong>${fineId}</strong> as paid? (Rs. ${f.amount})`);
      if (!ok) return;
      try {
        UI.showLoading("Updating…");
        await API.markFinePaid(fineId);
        UI.hideLoading();
        UI.toast("Fine marked as paid", "success");
        loadFines();
        if (window.loadDashboard) loadDashboard();
      } catch (err) {
        UI.hideLoading();
        UI.toast(err.message || "Failed to mark paid", "error");
      }
    };
  });
}

document.addEventListener("click", e => {
  if (e.target.closest("#btn-filter-fines-unpaid")) { SHOW_UNPAID_ONLY = true; renderFines(); }
  if (e.target.closest("#btn-filter-fines-all"))    { SHOW_UNPAID_ONLY = false; renderFines(); }
});
