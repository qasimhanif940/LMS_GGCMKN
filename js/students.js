/* =====================================================================
   students.js — list, add, edit, delete, view history
   ===================================================================== */

let ALL_STUDENTS = [];
let CURRENT_STUDENT_SEARCH = "";
let selectedIssueStudent = null; // also used by circulation

document.addEventListener("auth:ready", loadStudents);

async function loadStudents() {
  try {
    const { data, error } = await sb
      .from("students")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    ALL_STUDENTS = data || [];
    renderStudents();
  } catch (err) {
    UI.toast("Failed to load students: " + err.message, "error");
  }
}

function renderStudents() {
  const tbody = document.querySelector("#table-students tbody");
  let list = ALL_STUDENTS.slice();
  if (CURRENT_STUDENT_SEARCH) {
    const q = CURRENT_STUDENT_SEARCH.toLowerCase();
    list = list.filter(s =>
      (s.name || "").toLowerCase().includes(q) ||
      String(s.roll_no || "").includes(q) ||
      (s.user_id || "").toLowerCase().includes(q)
    );
  }
  // Default sort: by name
  list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-muted text-center" style="padding:24px;">No students found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
    const status = String(s.status || "Active").toLowerCase();
    const statusBadge = status === "inactive"
      ? `<span class="badge danger">Inactive</span>`
      : `<span class="badge success">Active</span>`;
    return `
      <tr>
        <td class="font-mono">${UI.escapeHtml(s.user_id)}</td>
        <td class="num-cell">${UI.escapeHtml(String(s.roll_no || ""))}</td>
        <td><span class="clickable" data-history="${UI.escapeHtml(s.user_id)}">${UI.escapeHtml(s.name || "—")}</span></td>
        <td>${UI.escapeHtml(s.program || "—")}</td>
        <td>${UI.escapeHtml(s.level || "—")}</td>
        <td>${UI.escapeHtml(s.gender || "—")}</td>
        <td class="muted-cell">${UI.escapeHtml(s.phone || "—")}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn secondary sm" data-edit="${UI.escapeHtml(s.user_id)}">Edit</button>
          <button class="btn danger sm" data-del="${UI.escapeHtml(s.user_id)}">Del</button>
        </td>
      </tr>
    `;
  }).join("");

  // Click: view history
  tbody.querySelectorAll("[data-history]").forEach(el => {
    el.onclick = () => viewStudentHistory(el.dataset.history);
  });

  // Edit
  tbody.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => openStudentModal(btn.dataset.edit);
  });
  // Delete
  tbody.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = () => deleteStudent(btn.dataset.del);
  });
}

// ---- Add / Edit modal ----
function openStudentModal(existingUserId) {
  const isEdit = !!existingUserId;
  const s = isEdit ? ALL_STUDENTS.find(x => x.user_id === existingUserId) : {};

  // Build program options based on level
  const programOptions = (level) => {
    const progs = CONST.PROGRAMS[level] || [];
    return `<option value="">— Select —</option>` +
      progs.map(p => `<option value="${p}" ${s.program === p ? "selected" : ""}>${p}</option>`).join("");
  };

  const html = `
    <form id="student-form">
      <div class="form-grid">
        <div class="form-group">
          <label>Roll No <span class="req">*</span></label>
          <input type="number" min="1" id="f-roll" class="form-control" value="${UI.escapeHtml(String(s.roll_no || ""))}" required>
        </div>
        <div class="form-group">
          <label>Level</label>
          <select id="f-level" class="form-control">
            <option value="">— Select —</option>
            ${CONST.LEVELS.map(l => `<option value="${l}" ${s.level === l ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </div>
        <div class="form-group full">
          <label>Name <span class="req">*</span></label>
          <input type="text" id="f-name" class="form-control" value="${UI.escapeHtml(s.name || "")}" required>
        </div>
        <div class="form-group">
          <label>Program / Discipline</label>
          <select id="f-program" class="form-control">${programOptions(s.level)}</select>
        </div>
        <div class="form-group">
          <label>Gender</label>
          <select id="f-gender" class="form-control">
            <option value="">— Select —</option>
            ${CONST.GENDERS.map(g => `<option value="${g}" ${s.gender === g ? "selected" : ""}>${g}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="text" id="f-phone" class="form-control" value="${UI.escapeHtml(s.phone || "")}" placeholder="03XX-XXXXXXX">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="f-email" class="form-control" value="${UI.escapeHtml(s.email || "")}">
        </div>
        <div class="form-group full">
          <label>Status</label>
          <select id="f-status" class="form-control">
            <option value="Active" ${s.status === "Active" ? "selected" : ""}>Active</option>
            <option value="Inactive" ${s.status === "Inactive" ? "selected" : ""}>Inactive</option>
          </select>
        </div>
      </div>
      ${isEdit ? `<p class="text-muted mt-2" style="font-size:11px;">User ID: <span class="font-mono">${UI.escapeHtml(s.user_id)}</span> · Registered: ${UI.fmtDate(s.registered_date)}</p>` : ""}
    </form>
  `;

  const { backdrop, close } = UI.modal(
    isEdit ? "Edit Student" : "Add New Student",
    html,
    `<button class="btn secondary" type="button" id="modal-cancel">Cancel</button>
     <button class="btn accent" type="button" id="modal-save">${isEdit ? "Save Changes" : "Add Student"}</button>`
  );

  // Cascade: level → program options
  backdrop.querySelector("#f-level").onchange = (e) => {
    backdrop.querySelector("#f-program").innerHTML = programOptions(e.target.value);
  };

  backdrop.querySelector("#modal-cancel").onclick = close;
  backdrop.querySelector("#modal-save").onclick = async () => {
    const payload = {
      roll_no:  backdrop.querySelector("#f-roll").value.trim(),
      name:     backdrop.querySelector("#f-name").value.trim(),
      level:    backdrop.querySelector("#f-level").value,
      program:  backdrop.querySelector("#f-program").value,
      gender:   backdrop.querySelector("#f-gender").value,
      phone:    backdrop.querySelector("#f-phone").value.trim(),
      email:    backdrop.querySelector("#f-email").value.trim(),
      status:   backdrop.querySelector("#f-status").value
    };

    if (!payload.roll_no) return UI.toast("Roll No is required", "warning");
    if (!/^\d+$/.test(payload.roll_no)) return UI.toast("Roll No must be digits only", "warning");
    if (!payload.name) return UI.toast("Name is required", "warning");

    // Uniqueness check (client-side; server enforces via unique constraint too)
    const conflict = ALL_STUDENTS.find(x => String(x.roll_no) === payload.roll_no && x.user_id !== existingUserId);
    if (conflict) return UI.toast(`Roll No ${payload.roll_no} already exists (${conflict.user_id})`, "warning");

    try {
      UI.showLoading(isEdit ? "Saving…" : "Adding…");
      if (isEdit) {
        await API.update("students", { user_id: existingUserId }, payload);
      } else {
        const newId = await API.nextStudentId();
        await API.insert("students", { ...payload, user_id: newId, registered_date: new Date().toISOString() });
      }
      UI.hideLoading();
      UI.toast(isEdit ? "Student updated" : "Student added", "success");
      close();
      loadStudents();
      // Also reload dashboard counts
      if (window.loadDashboard) loadDashboard();
    } catch (err) {
      UI.hideLoading();
      UI.toast(err.message || "Save failed", "error");
    }
  };
}

async function deleteStudent(userId) {
  const s = ALL_STUDENTS.find(x => x.user_id === userId);
  if (!s) return;
  // Check active borrows
  const { data: active } = await sb.from("copies").select("copy_id").eq("current_borrower", userId).eq("status", "Borrowed");
  if (active && active.length) {
    return UI.toast(`Cannot delete: student has ${active.length} unreturned book(s). Return them first.`, "warning", 5000);
  }
  // Check unpaid fines
  const { data: unpaid } = await sb.from("fines").select("fine_id").eq("user_id", userId).eq("status", "Unpaid");
  if (unpaid && unpaid.length) {
    return UI.toast(`Cannot delete: student has ${unpaid.length} unpaid fine(s). Clear them first.`, "warning", 5000);
  }

  const ok = await UI.confirm(`Delete student <strong>${UI.escapeHtml(s.name)}</strong> (${userId}, Roll ${s.roll_no})? This cannot be undone.`);
  if (!ok) return;
  try {
    UI.showLoading("Deleting…");
    await API.delete("students", { user_id: userId });
    UI.hideLoading();
    UI.toast("Student deleted", "success");
    loadStudents();
    if (window.loadDashboard) loadDashboard();
  } catch (err) {
    UI.hideLoading();
    UI.toast(err.message || "Delete failed", "error");
  }
}

// ---- Student history ----
async function viewStudentHistory(userId) {
  const s = ALL_STUDENTS.find(x => x.user_id === userId);
  if (!s) return;
  try {
    UI.showLoading("Loading history…");

    // Active borrows for this student
    const { data: active } = await sb
      .from("copies")
      .select("copy_id, book_id, borrow_date, due_date, books(title, library_book_no)")
      .eq("current_borrower", userId)
      .eq("status", "Borrowed")
      .order("due_date", { ascending: true });

    // Transaction history
    const { data: txns } = await sb
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    // Fines
    const { data: fines } = await sb
      .from("fines")
      .select("*")
      .eq("user_id", userId)
      .order("date_levied", { ascending: false });

    UI.hideLoading();

    const activeHtml = (active && active.length) ? `
      <h4 style="font-size:13px;color:var(--primary-dark);margin-bottom:8px;">Currently Borrowed (${active.length})</h4>
      <div class="table-wrap mb-3">
        <table class="data">
          <thead><tr><th>Copy</th><th>Book</th><th>Borrowed</th><th>Due</th><th>Days Left</th></tr></thead>
          <tbody>
            ${active.map(b => {
              const due = new Date(b.due_date);
              const daysLeft = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const badge = daysLeft < 0
                ? `<span class="badge danger">${Math.abs(daysLeft)}d overdue</span>`
                : daysLeft === 0 ? `<span class="badge warning">Due today</span>`
                : `<span class="badge success">${daysLeft}d</span>`;
              return `<tr>
                <td class="font-mono">${UI.escapeHtml(b.copy_id)}</td>
                <td>${UI.escapeHtml((b.books && b.books.title) || "—")}</td>
                <td class="muted-cell">${UI.fmtDate(b.borrow_date)}</td>
                <td class="muted-cell">${UI.fmtDate(b.due_date)}</td>
                <td>${badge}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    ` : `<p class="text-muted" style="font-size:13px;padding:8px;background:var(--primary-50);border-radius:8px;">No books currently borrowed.</p>`;

    const txnHtml = (txns && txns.length) ? `
      <h4 style="font-size:13px;color:var(--primary-dark);margin:14px 0 8px;">Borrow History (${txns.length})</h4>
      <div class="table-wrap mb-3" style="max-height:260px;overflow-y:auto;">
        <table class="data">
          <thead><tr><th>Date</th><th>Action</th><th>Book</th><th>Copy</th><th>Due</th><th>Returned</th><th>Late</th><th>Fine</th></tr></thead>
          <tbody>
            ${txns.map(t => {
              const actionBadge = t.action === "Borrow" ? "info" : t.action === "Return" ? "success" : "warning";
              return `<tr>
                <td class="muted-cell">${UI.fmtDate(t.date)}</td>
                <td><span class="badge ${actionBadge}">${UI.escapeHtml(t.action)}</span></td>
                <td>${UI.escapeHtml(t.book_title || "—")}</td>
                <td class="font-mono">${UI.escapeHtml(t.copy_id || "—")}</td>
                <td class="muted-cell">${UI.fmtDate(t.due_date)}</td>
                <td class="muted-cell">${UI.fmtDate(t.return_date)}</td>
                <td>${t.days_late || "—"}</td>
                <td>${Number(t.fine) > 0 ? "Rs." + t.fine : "—"}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    ` : `<p class="text-muted" style="font-size:13px;padding:8px;background:var(--primary-50);border-radius:8px;">No transaction history.</p>`;

    const fineHtml = (fines && fines.length) ? `
      <h4 style="font-size:13px;color:var(--primary-dark);margin:14px 0 8px;">Fines History (${fines.length})</h4>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Fine ID</th><th>Book</th><th>Amount</th><th>Days Late</th><th>Date Levied</th><th>Status</th><th>Cleared</th></tr></thead>
          <tbody>
            ${fines.map(f => `
              <tr>
                <td class="font-mono">${UI.escapeHtml(f.fine_id)}</td>
                <td>${UI.escapeHtml(f.book_title || "—")}</td>
                <td>Rs. ${Number(f.amount).toLocaleString()}</td>
                <td>${f.days_late || "—"}</td>
                <td class="muted-cell">${UI.fmtDate(f.date_levied)}</td>
                <td><span class="badge ${f.status === "Paid" ? "success" : "danger"}">${UI.escapeHtml(f.status)}</span></td>
                <td class="muted-cell">${UI.fmtDate(f.date_cleared)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : `<p class="text-muted" style="font-size:13px;padding:8px;background:var(--success-50);border-radius:8px;">No fines — clean record ✨</p>`;

    const summary = `
      <div class="detail-row"><span class="label">User ID</span><span class="value font-mono">${UI.escapeHtml(s.user_id)}</span></div>
      <div class="detail-row"><span class="label">Roll No</span><span class="value">${UI.escapeHtml(String(s.roll_no))}</span></div>
      <div class="detail-row"><span class="label">Name</span><span class="value">${UI.escapeHtml(s.name)}</span></div>
      <div class="detail-row"><span class="label">Program / Level</span><span class="value">${UI.escapeHtml(s.program || "—")} · ${UI.escapeHtml(s.level || "—")}</span></div>
      <div class="detail-row"><span class="label">Status</span><span class="value"><span class="badge ${s.status === "Active" ? "success" : "danger"}">${UI.escapeHtml(s.status || "Active")}</span></span></div>
      <div class="detail-row"><span class="label">Phone</span><span class="value">${UI.escapeHtml(s.phone || "—")}</span></div>
      <div class="detail-row"><span class="label">Email</span><span class="value">${UI.escapeHtml(s.email || "—")}</span></div>
      <div class="detail-row"><span class="label">Registered</span><span class="value">${UI.fmtDate(s.registered_date)}</span></div>
    `;

    UI.modal(
      `Student History — ${UI.escapeHtml(s.name)}`,
      `${summary}<hr style="margin:12px 0;border:none;border-top:1px solid var(--border);">${activeHtml}${txnHtml}${fineHtml}`,
      `<button class="btn secondary" type="button" id="modal-close">Close</button>
       <button class="btn" type="button" id="modal-edit">Edit Student</button>`
    );
    document.getElementById("modal-close").onclick = () => document.querySelector(".modal-backdrop")?.remove();
    document.getElementById("modal-edit").onclick = () => {
      document.querySelector(".modal-backdrop")?.remove();
      openStudentModal(userId);
    };
  } catch (err) {
    UI.hideLoading();
    UI.toast("Failed to load history: " + err.message, "error");
  }
}

// Wire events
document.addEventListener("click", e => {
  if (e.target.closest("#btn-add-student")) openStudentModal(null);
});
document.addEventListener("input", e => {
  if (e.target.id === "search-students") {
    CURRENT_STUDENT_SEARCH = e.target.value.trim();
    renderStudents();
  }
});

// Search suggestions for circulation (also used by circulation.js)
function setupStudentSuggest(inputEl, suggestEl, onSelect) {
  let highlightIdx = -1;
  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim().toLowerCase();
    if (!q) { suggestEl.classList.remove("show"); return; }
    const matches = ALL_STUDENTS
      .filter(s =>
        (s.user_id || "").toLowerCase().includes(q) ||
        String(s.roll_no || "").includes(q) ||
        (s.name || "").toLowerCase().includes(q)
      )
      .slice(0, 10);
    if (matches.length === 0) { suggestEl.classList.remove("show"); return; }
    highlightIdx = -1;
    suggestEl.innerHTML = matches.map((s, i) => `
      <div class="suggest-item" data-uid="${UI.escapeHtml(s.user_id)}" data-idx="${i}">
        <div><strong>${UI.escapeHtml(s.user_id)}</strong> — ${UI.escapeHtml(s.name)} <span class="text-muted">(Roll ${UI.escapeHtml(String(s.roll_no))})</span></div>
        <div class="small">${UI.escapeHtml(s.program || "")} · ${UI.escapeHtml(s.level || "")} · <span class="badge ${s.status === "Active" ? "success" : "danger"}" style="font-size:9px;">${UI.escapeHtml(s.status || "Active")}</span></div>
      </div>
    `).join("");
    suggestEl.classList.add("show");

    suggestEl.querySelectorAll(".suggest-item").forEach(item => {
      item.onclick = () => {
        const uid = item.dataset.uid;
        const s = ALL_STUDENTS.find(x => x.user_id === uid);
        inputEl.value = `${s.user_id} — ${s.name} (Roll ${s.roll_no})`;
        suggestEl.classList.remove("show");
        onSelect && onSelect(s);
      };
    });
  });

  // Keyboard nav
  inputEl.addEventListener("keydown", (e) => {
    const items = suggestEl.querySelectorAll(".suggest-item");
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, items.length - 1);
      updateHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      updateHighlight();
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      items[highlightIdx].click();
    } else if (e.key === "Escape") {
      suggestEl.classList.remove("show");
    }
    function updateHighlight() {
      items.forEach((it, i) => it.classList.toggle("highlighted", i === highlightIdx));
    }
  });

  // Click outside to close
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".suggest-wrap") || !e.target.closest(".suggest-wrap").contains(inputEl)) {
      suggestEl.classList.remove("show");
    }
  });
}

window.setupStudentSuggest = setupStudentSuggest;
