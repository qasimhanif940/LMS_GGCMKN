/* =====================================================================
   catalog.js — public book catalog logic
   ===================================================================== */

let ALL_BOOKS = [];
let CURRENT_CATEGORY = "";
let CURRENT_SEARCH   = "";
let CURRENT_SORT     = "title";

document.addEventListener("supabase:ready", loadBooks);
document.addEventListener("supabase:failed", () => {
  document.getElementById("book-grid").innerHTML =
    '<div class="empty-state"><div class="icon">⚠️</div><h3>Connection failed</h3><p>Could not connect to library database. Please try again later.</p></div>';
});

async function loadBooks() {
  try {
    document.getElementById("book-grid").innerHTML =
      '<div class="empty-state"><div class="spinner dark" style="width:28px;height:28px;margin:0 auto 8px;"></div><p>Loading books…</p></div>';

    const { data, error } = await sb
      .from("books")
      .select("book_id, library_book_no, title, author, category, total_copies, available_copies, almirah, shelf")
      .order("title", { ascending: true });
    if (error) throw error;
    ALL_BOOKS = data || [];

    // Stats
    const totalCopies = ALL_BOOKS.reduce((s, b) => s + (Number(b.total_copies) || 0), 0);
    const availCopies = ALL_BOOKS.reduce((s, b) => s + (Number(b.available_copies) || 0), 0);
    document.getElementById("stat-titles").textContent = ALL_BOOKS.length;
    document.getElementById("stat-copies").textContent = totalCopies;
    document.getElementById("stat-avail").textContent  = availCopies;

    // Populate category filter
    const cats = [...new Set(ALL_BOOKS.map(b => b.category).filter(Boolean))].sort();
    const sel = document.getElementById("filter-category");
    cats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      sel.appendChild(opt);
    });

    render();
  } catch (err) {
    console.error(err);
    document.getElementById("book-grid").innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><h3>Error loading books</h3><p>${UI.escapeHtml(err.message)}</p></div>`;
  }
}

function render() {
  let list = ALL_BOOKS.slice();

  // Filter: category
  if (CURRENT_CATEGORY) list = list.filter(b => b.category === CURRENT_CATEGORY);

  // Filter: search
  if (CURRENT_SEARCH) {
    const q = CURRENT_SEARCH.toLowerCase();
    list = list.filter(b =>
      (b.title || "").toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q) ||
      (b.library_book_no || "").toLowerCase().includes(q)
    );
  }

  // Sort
  const sorters = {
    "title":      (a, b) => (a.title || "").localeCompare(b.title || ""),
    "title-desc": (a, b) => (b.title || "").localeCompare(a.title || ""),
    "libno":      (a, b) => (a.library_book_no || "").localeCompare(b.library_book_no || "", undefined, { numeric: true }),
    "libno-desc": (a, b) => (b.library_book_no || "").localeCompare(a.library_book_no || "", undefined, { numeric: true }),
    "avail":      (a, b) => (Number(b.available_copies) || 0) - (Number(a.available_copies) || 0)
  };
  list.sort(sorters[CURRENT_SORT] || sorters.title);

  // Render
  const grid = document.getElementById("book-grid");
  const empty = document.getElementById("empty-state");
  if (list.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  grid.innerHTML = list.map(b => {
    const avail = Number(b.available_copies) || 0;
    const total = Number(b.total_copies) || 0;
    const status = avail === 0 ? "danger" : avail < total ? "warning" : "success";
    return `
      <div class="book-card" data-book-id="${UI.escapeHtml(b.book_id)}">
        <div class="book-title">${UI.escapeHtml(b.title)}</div>
        <div class="book-author">${b.author ? "by " + UI.escapeHtml(b.author) : "<em class='text-muted'>Unknown author</em>"}</div>
        <div class="book-meta">
          <span class="meta-item"><span class="meta-label">Lib#</span> ${UI.escapeHtml(b.library_book_no)}</span>
          ${b.category ? `<span class="badge info">${UI.escapeHtml(b.category)}</span>` : ""}
        </div>
        <div class="book-meta" style="margin-top:6px;">
          ${b.almirah ? `<span class="meta-item"><span class="meta-label">Almirah:</span> ${UI.escapeHtml(b.almirah)}</span>` : ""}
          ${b.shelf ? `<span class="meta-item"><span class="meta-label">Shelf:</span> ${UI.escapeHtml(b.shelf)}</span>` : ""}
        </div>
        <div class="availability">
          <span>Status</span>
          <span class="badge ${status}">${avail === 0 ? "All out" : avail + " of " + total + " avail"}</span>
        </div>
      </div>
    `;
  }).join("");

  // Click → show detail modal
  grid.querySelectorAll(".book-card").forEach(card => {
    card.onclick = () => showBookDetail(card.dataset.bookId);
  });
}

function showBookDetail(bookId) {
  const b = ALL_BOOKS.find(x => x.book_id === bookId);
  if (!b) return;
  const avail = Number(b.available_copies) || 0;
  const total = Number(b.total_copies) || 0;
  const statusBadge = avail === 0
    ? `<span class="badge danger">All copies out</span>`
    : `<span class="badge success">${avail} available</span>`;

  const html = `
    <div class="book-detail-modal">
      <h2 style="font-size:18px;color:var(--primary-dark);margin-bottom:4px;">${UI.escapeHtml(b.title)}</h2>
      <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">
        ${b.author ? "by " + UI.escapeHtml(b.author) : "<em>Unknown author</em>"}
      </p>
      <div class="meta-grid">
        <div><div class="text-muted" style="font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">Library Book No</div><div class="font-mono">${UI.escapeHtml(b.library_book_no)}</div></div>
        <div><div class="text-muted" style="font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">Category</div><div>${UI.escapeHtml(b.category || "—")}</div></div>
        <div><div class="text-muted" style="font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">Almirah</div><div>${UI.escapeHtml(b.almirah || "—")}</div></div>
        <div><div class="text-muted" style="font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">Shelf</div><div>${UI.escapeHtml(b.shelf || "—")}</div></div>
        <div><div class="text-muted" style="font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">Total Copies</div><div>${total}</div></div>
        <div><div class="text-muted" style="font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">Availability</div><div>${statusBadge}</div></div>
      </div>
      <div style="margin-top:14px;padding:10px;background:var(--primary-50);border-radius:8px;font-size:12px;color:var(--primary-dark);">
        💡 To borrow this book, visit the library desk with the Library Book No.
      </div>
    </div>
  `;
  UI.modal(`Book Details`, html,
    `<button class="btn secondary" type="button" onclick="this.closest('.modal-backdrop').remove()">Close</button>`
  );
}

// Wire events
document.getElementById("search").addEventListener("input", e => {
  CURRENT_SEARCH = e.target.value.trim();
  render();
});
document.getElementById("filter-category").addEventListener("change", e => {
  CURRENT_CATEGORY = e.target.value;
  render();
});
document.getElementById("sort-by").addEventListener("change", e => {
  CURRENT_SORT = e.target.value;
  render();
});
