/* =====================================================================
   dashboard.js — stats + active borrows table (search + sort) +
   circulation helpers. Manual Return / Renew inputs live here now;
   the buttons themselves are wired by circulation.js (shared by ID).
   ===================================================================== */

let ACTIVE_BORROWS = [];
let CURRENT_BORROW_SEARCH = "";
let CURRENT_BORROW_SORT   = "due_asc";

document.addEventListener("auth:ready", () => {
  loadDashboard();

  // Wire search box
  document.addEventListener("input", e => {
    if (e.target.id === "search-active") {
      CURRENT_BORROW_SEARCH = e.target.value.trim();
      renderActiveBorrows();
    }
  });
  // Wire sort dropdown
  document.addEventListener("change", e => {
    if (e.target.id === "sort-active") {
      CURRENT_BORROW_SORT = e.target.value;
      renderActiveBorrows();
    }
  });
});

async function loadDashboard() {
  try {
    // Load stats
    const { data: books } = await sb.from("books").select("total_copies, available_copies");
    const { data: students } = await sb.from("students").select("user_id, status");
    const { data: fines } = await sb.from("fines").select("status");

    const totalBooks   = (books || []).length;
    const totalCopies  = (books || []).reduce((s, b) => s + (Number(b.total_copies) || 0), 0);
    const availCopies  = (books || []).reduce((s, b) => s + (Number(b.available_copies) || 0), 0);
    const unpaidFines  = (fines || []).filter(f => f.status === "Unpaid").length;

    document.getElementById("stat-total-books").textContent  = totalBooks;
    document.getElementById("stat-total-copies").textContent = totalCopies;
    document.getElementById("stat-avail-copies").textContent = availCopies;
    document.getElementById("stat-students").textContent    = (students || []).length;
    document.getElementById("stat-fines").textContent         = unpaidFines;

    await loadActiveBorrows();
  } catch (err) {
    UI.toast("Failed to load dashboard: " + err.message, "error");
  }
}

async function loadActiveBorrows() {
  const tbody = document.querySelector("#table-active tbody");
  tbody.innerHTML = `<tr><td colspan="8" class="text-muted text-center" style="padding:24px;">Loading…</td></tr>`;

  try {
    // Pull copies that are borrowed, join with books and students
    const { data: copies, error } = await sb
      .from("copies")
      .select("copy_id, book_id, current_borrower, borrow_date, due_date, books(book_id, title, library_book_no, almirah, shelf), students!inner(user_id, name, roll_no)")
      .eq("status", "Borrowed")
      .order("due_date", { ascending: true });
    if (error) throw error;

    ACTIVE_BORROWS = copies || [];
    document.getElementById("stat-active").textContent = ACTIVE_BORROWS.length;

    const overdue = ACTIVE_BORROWS.filter(b => new Date(b.due_date) < new Date());
    document.getElementById("stat-overdue").textContent = overdue.length;

    renderActiveBorrows();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center" style="padding:24px;">Error: ${UI.escapeHtml(err.message)}</td></tr>`;
  }
}

function renderActiveBorrows() {
  const tbody = document.querySelector("#table-active tbody");

  // ---- Filter ----
  let list = ACTIVE_BORROWS.slice();
  if (CURRENT_BORROW_SEARCH) {
    const q = CURRENT_BORROW_SEARCH.toLowerCase();
    list = list.filter(b => {
      const book = b.books || {};
      const student = b.students || {};
      return (b.copy_id || "").toLowerCase().includes(q) ||
             (book.title || "").toLowerCase().includes(q) ||
             (book.library_book_no || "").toLowerCase().includes(q) ||
             (student.name || "").toLowerCase().includes(q) ||
             String(student.roll_no || "").includes(q) ||
             (student.user_id || "").toLowerCase().includes(q);
    });
  }

  // ---- Sort ----
  const sorters = {
    due_asc:     (a, b) => new Date(a.due_date)    - new Date(b.due_date),
    due_desc:    (a, b) => new Date(b.due_date)    - new Date(a.due_date),
    borrow_asc:  (a, b) => new Date(a.borrow_date) - new Date(b.borrow_date),
    borrow_desc: (a, b) => new Date(b.borrow_date) - new Date(a.borrow_date),
    student_asc: (a, b) => ((a.students || {}).name || "").localeCompare((b.students || {}).name || ""),
    book_asc:    (a, b) => ((a.books || {}).title  || "").localeCompare((b.books || {}).title  || "")
  };
  list.sort(sorters[CURRENT_BORROW_SORT] || sorters.due_asc);

  // ---- Empty states ----
  if (list.length === 0) {
    const msg = ACTIVE_BORROWS.length === 0
      ? "No active borrows 🎉"
      : "No matches for your search.";
    tbody.innerHTML = `<tr><td colspan="8" class="text-muted text-center" style="padding:24px;">${msg}</td></tr>`;
    return;
  }

  // ---- Render rows ----
  tbody.innerHTML = list.map(b => {
    const due = new Date(b.due_date);
    const now = new Date();
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const overdue = daysLeft < 0;
    const book = b.books || {};
    const student = b.students || {};
    return `
      <tr>
        <td class="font-mono">${UI.escapeHtml(b.copy_id)}</td>
        <td>${UI.escapeHtml(book.title || "—")}<br><span class="text-muted" style="font-size:11px;">Lib# ${UI.escapeHtml(book.library_book_no || "—")}</span></td>
        <td>${UI.escapeHtml(student.name || "—")}</td>
        <td class="num-cell">${UI.escapeHtml(String(student.roll_no || "—"))}</td>
        <td class="muted-cell">${UI.fmtDate(b.borrow_date)}</td>
        <td class="muted-cell">${UI.fmtDate(b.due_date)}</td>
        <td>${overdue
          ? `<span class="badge danger">${Math.abs(daysLeft)}d overdue</span>`
          : daysLeft === 0
            ? `<span class="badge warning">Due today</span>`
            : `<span class="badge success">${daysLeft}d left</span>`}</td>
        <td>
          <div class="row-actions">
            <button class="btn success sm" data-action="return" data-copy="${UI.escapeHtml(b.copy_id)}">Return</button>
            <button class="btn secondary sm" data-action="renew" data-copy="${UI.escapeHtml(b.copy_id)}">Renew</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-action]").forEach(btn => {
    btn.onclick = async () => {
      const copyId = btn.dataset.copy;
      const action = btn.dataset.action;
      const verb = action === "return" ? "return" : "renew";
      const ok = await UI.confirm(`Are you sure you want to ${verb} copy <strong>${UI.escapeHtml(copyId)}</strong>?`, `${verb} book`);
      if (!ok) return;
      try {
        UI.showLoading(`${verb === "return" ? "Returning" : "Renewing"}…`);
        let res;
        if (action === "return") res = await API.returnBook(copyId);
        else res = await API.renewBook(copyId);
        UI.hideLoading();
        if (action === "return") {
          UI.toast(`Returned. ${res.days_late > 0 ? "Fine: Rs." + res.fine : "No fine."}`, res.days_late > 0 ? "warning" : "success", 5000);
        } else {
          UI.toast(`Renewed. New due: ${UI.fmtDate(res.new_due_date)}`, "success");
        }
        loadDashboard();
      } catch (err) {
        UI.hideLoading();
        UI.toast(err.message || `${verb} failed`, "error");
      }
    };
  });
}

// Refresh button
document.addEventListener("click", e => {
  if (e.target.closest("#btn-refresh-active")) loadActiveBorrows();
});
