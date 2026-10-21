/* =====================================================================
   books.js — list, add, edit, delete
   ===================================================================== */

let ALL_BOOKS = [];
let CURRENT_BOOK_SEARCH = "";

document.addEventListener("auth:ready", loadBooks);

async function loadBooks() {
  try {
    const { data, error } = await sb
      .from("books")
      .select("*")
      .order("title", { ascending: true });
    if (error) throw error;
    ALL_BOOKS = data || [];
    renderBooks();
  } catch (err) {
    UI.toast("Failed to load books: " + err.message, "error");
  }
}

function renderBooks() {
  const tbody = document.querySelector("#table-books tbody");
  let list = ALL_BOOKS.slice();
  if (CURRENT_BOOK_SEARCH) {
    const q = CURRENT_BOOK_SEARCH.toLowerCase();
    list = list.filter(b =>
      (b.title || "").toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q) ||
      (b.library_book_no || "").toLowerCase().includes(q) ||
      (b.category || "").toLowerCase().includes(q)
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-muted text-center" style="padding:24px;">No books found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(b => {
    const avail = Number(b.available_copies) || 0;
    const total = Number(b.total_copies) || 0;
    const availBadge = avail === 0
      ? `<span class="badge danger">0 / ${total}</span>`
      : avail === total
        ? `<span class="badge success">${avail} / ${total}</span>`
        : `<span class="badge warning">${avail} / ${total}</span>`;
    return `
      <tr>
        <td class="font-mono">${UI.escapeHtml(b.book_id)}</td>
        <td class="font-mono">${UI.escapeHtml(b.library_book_no)}</td>
        <td><strong>${UI.escapeHtml(b.title)}</strong></td>
        <td>${UI.escapeHtml(b.author || "—")}</td>
        <td>${b.category ? `<span class="badge info">${UI.escapeHtml(b.category)}</span>` : "—"}</td>
        <td>${availBadge}</td>
        <td>${UI.escapeHtml(b.almirah || "—")}</td>
        <td>${UI.escapeHtml(b.shelf || "—")}</td>
        <td>
          <button class="btn secondary sm" data-edit="${UI.escapeHtml(b.book_id)}">Edit</button>
          <button class="btn danger sm" data-del="${UI.escapeHtml(b.book_id)}">Del</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => openBookModal(btn.dataset.edit);
  });
  tbody.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = () => deleteBook(btn.dataset.del);
  });
}

function openBookModal(existingBookId) {
  const isEdit = !!existingBookId;
  const b = isEdit ? ALL_BOOKS.find(x => x.book_id === existingBookId) : {};

  const html = `
    <form id="book-form">
      <div class="form-grid">
        <div class="form-group">
          <label>Library Book No <span class="req">*</span></label>
          <input type="text" id="f-libno" class="form-control" value="${UI.escapeHtml(b.library_book_no || "")}" required>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="f-category" class="form-control">
            <option value="Other">— Select —</option>
            ${CONST.BOOK_CATEGORIES.map(c => `<option value="${c}" ${b.category === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </div>
        <div class="form-group full">
          <label>Title <span class="req">*</span></label>
          <input type="text" id="f-title" class="form-control" value="${UI.escapeHtml(b.title || "")}" required>
        </div>
        <div class="form-group">
          <label>Author</label>
          <input type="text" id="f-author" class="form-control" value="${UI.escapeHtml(b.author || "")}">
        </div>
        <div class="form-group">
          <label>Total Copies ${isEdit ? "(add new copies)" : "<span class='req'>*</span>"}</label>
          <input type="number" min="${isEdit ? (Number(b.total_copies) || 0) : 1}" id="f-total" class="form-control" value="${isEdit ? (Number(b.total_copies) || 0) : 1}" ${isEdit ? "readonly" : "required"}>
        </div>
        <div class="form-group">
          <label>Almirah No <span class="req">*</span></label>
          <input type="text" id="f-almirah" class="form-control" value="${UI.escapeHtml(b.almirah || "")}" required>
        </div>
        <div class="form-group">
          <label>Shelf No <span class="req">*</span></label>
          <input type="text" id="f-shelf" class="form-control" value="${UI.escapeHtml(b.shelf || "")}" required>
        </div>
      </div>
      ${isEdit
        ? `<p class="text-muted mt-2" style="font-size:11px;">Book ID: <span class="font-mono">${UI.escapeHtml(b.book_id)}</span> · Added: ${UI.fmtDate(b.added_date)}</p>
           <p class="text-muted" style="font-size:11px;">Total Copies field is read-only. To add more copies, use the field below.</p>
           <div class="form-group mt-2">
             <label>Add extra copies (optional)</label>
             <input type="number" min="0" id="f-add-copies" class="form-control" value="0" placeholder="0">
           </div>`
        : `<p class="text-muted mt-2" style="font-size:11px;">Total copies will be created automatically with IDs like <span class="font-mono">BOOK-XXX-C1</span>, <span class="font-mono">BOOK-XXX-C2</span>…</p>`}
    </form>
  `;

  const { backdrop, close } = UI.modal(
    isEdit ? "Edit Book" : "Add New Book",
    html,
    `<button class="btn secondary" type="button" id="modal-cancel">Cancel</button>
     <button class="btn accent" type="button" id="modal-save">${isEdit ? "Save Changes" : "Add Book"}</button>`
  );

  backdrop.querySelector("#modal-cancel").onclick = close;
  backdrop.querySelector("#modal-save").onclick = async () => {
    const payload = {
      p_library_book_no: backdrop.querySelector("#f-libno").value.trim(),
      p_title:           backdrop.querySelector("#f-title").value.trim(),
      p_author:          backdrop.querySelector("#f-author").value.trim(),
      p_category:        backdrop.querySelector("#f-category").value,
      p_almirah:         backdrop.querySelector("#f-almirah").value.trim(),
      p_shelf:           backdrop.querySelector("#f-shelf").value.trim(),
      p_total_copies:    parseInt(backdrop.querySelector("#f-total").value, 10) || 1
    };

    if (!payload.p_library_book_no) return UI.toast("Library Book No is required", "warning");
    if (!payload.p_title)           return UI.toast("Title is required", "warning");
    if (!payload.p_almirah)         return UI.toast("Almirah is required", "warning");
    if (!payload.p_shelf)           return UI.toast("Shelf is required", "warning");

    const addExtra = isEdit ? (parseInt(backdrop.querySelector("#f-add-copies").value, 10) || 0) : 0;

    try {
      UI.showLoading(isEdit ? "Saving…" : "Adding…");
      if (isEdit) {
        // update_book() Postgres function audits the change automatically
        await API.updateBook(existingBookId, {
          p_library_book_no: payload.p_library_book_no,
          p_title:           payload.p_title,
          p_author:          payload.p_author,
          p_category:        payload.p_category,
          p_almirah:         payload.p_almirah,
          p_shelf:           payload.p_shelf
        });
        // Add extra copies if requested — also audited inside the function
        if (addExtra > 0) {
          await API.addBookCopies(existingBookId, addExtra);
        }
      } else {
        // add_book() Postgres function creates book + N copies + audits atomically
        await API.addBook(payload);
      }
      UI.hideLoading();
      UI.toast(isEdit ? "Book updated" : "Book added", "success");
      close();
      loadBooks();
      if (window.loadDashboard) loadDashboard();
      if (window.loadAudit) loadAudit();
    } catch (err) {
      UI.hideLoading();
      UI.toast(err.message || "Save failed", "error");
    }
  };
}

async function deleteBook(bookId) {
  const b = ALL_BOOKS.find(x => x.book_id === bookId);
  if (!b) return;
  // Pre-check borrowed copies (UX nicety; Postgres function re-checks server-side)
  if (Number(b.available_copies) < Number(b.total_copies)) {
    return UI.toast("Cannot delete: some copies are currently borrowed. Return them first.", "warning", 5000);
  }
  const ok = await UI.confirm(`Delete book <strong>${UI.escapeHtml(b.title)}</strong> (${bookId})? All ${b.total_copies} copies will be removed. This cannot be undone.`);
  if (!ok) return;
  try {
    UI.showLoading("Deleting…");
    // delete_book() Postgres function re-validates, cascades to copies, audits
    await API.deleteBook(bookId);
    UI.hideLoading();
    UI.toast("Book deleted", "success");
    loadBooks();
    if (window.loadDashboard) loadDashboard();
    if (window.loadAudit) loadAudit();
  } catch (err) {
    UI.hideLoading();
    UI.toast(err.message || "Delete failed", "error");
  }
}

// Wire events
document.addEventListener("click", e => {
  if (e.target.closest("#btn-add-book")) openBookModal(null);
});
document.addEventListener("input", e => {
  if (e.target.id === "search-books") {
    CURRENT_BOOK_SEARCH = e.target.value.trim();
    renderBooks();
  }
});

// Search suggestions for circulation
function setupBookSuggest(inputEl, suggestEl, onSelect) {
  let highlightIdx = -1;
  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim().toLowerCase();
    if (!q) { suggestEl.classList.remove("show"); return; }
    const matches = ALL_BOOKS
      .filter(b =>
        (b.book_id || "").toLowerCase().includes(q) ||
        (b.library_book_no || "").toLowerCase().includes(q) ||
        (b.title || "").toLowerCase().includes(q)
      )
      .slice(0, 10);
    if (matches.length === 0) { suggestEl.classList.remove("show"); return; }
    highlightIdx = -1;
    suggestEl.innerHTML = matches.map((b, i) => `
      <div class="suggest-item" data-bid="${UI.escapeHtml(b.book_id)}" data-idx="${i}">
        <div><strong>${UI.escapeHtml(b.book_id)}</strong> — ${UI.escapeHtml(b.title)} <span class="text-muted">(Lib# ${UI.escapeHtml(b.library_book_no)})</span></div>
        <div class="small">${UI.escapeHtml(b.author || "—")} · ${UI.escapeHtml(b.category || "—")} · <span class="badge ${Number(b.available_copies) > 0 ? "success" : "danger"}" style="font-size:9px;">${b.available_copies} avail</span></div>
      </div>
    `).join("");
    suggestEl.classList.add("show");

    suggestEl.querySelectorAll(".suggest-item").forEach(item => {
      item.onclick = () => {
        const bid = item.dataset.bid;
        const b = ALL_BOOKS.find(x => x.book_id === bid);
        inputEl.value = `${b.book_id} — ${b.title} (Lib# ${b.library_book_no}, ${b.available_copies} avail)`;
        suggestEl.classList.remove("show");
        onSelect && onSelect(b);
      };
    });
  });

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

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".suggest-wrap") || !e.target.closest(".suggest-wrap").contains(inputEl)) {
      suggestEl.classList.remove("show");
    }
  });
}

window.setupBookSuggest = setupBookSuggest;
