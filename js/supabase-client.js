/* =====================================================================
   supabase-client.js
   Central Supabase init + tiny shared helpers.
   Loaded by every page (catalog, login, admin app).
   Exposes: window.sb  (Supabase client)
            window.API (thin wrappers around supabase queries)
            window.UI  (toast / modal / spinner helpers)
   ===================================================================== */

// --- CONFIG — these are SAFE to expose (anon key is public; RLS protects data) ---
const SUPABASE_URL = "https://nzulpbvsofksfktqvole.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56dWxwYnZzb2Zrc2ZrdHF2b2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODk2NjAsImV4cCI6MjEwODA2NTY2MH0.FrKeoITPtfAQtcxX5460mAJ5JiVCQF0LwACueEHUjFg";

// --- Init ---
let sb = null;
(async () => {
  try {
    // Load Supabase JS SDK from CDN (UMD build exposes window.supabase)
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.min.js";
        s.onload = resolve;
        s.onerror = () => reject(new Error("Failed to load Supabase SDK"));
        document.head.appendChild(s);
      });
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    window.sb = sb;
    document.dispatchEvent(new CustomEvent("supabase:ready"));
  } catch (err) {
    console.error("Supabase init failed:", err);
    document.dispatchEvent(new CustomEvent("supabase:failed", { detail: err }));
  }
})();

/* =====================================================================
   UI HELPERS (toast, modal, spinner, format)
   ===================================================================== */
window.UI = {
  toast(msg, type = "info", duration = 3500) {
    let container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    const icons = { success: "✓", error: "✕", warning: "!", info: "i" };
    t.innerHTML = `<span class="font-bold">${icons[type] || ""}</span> <span>${msg}</span>`;
    container.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(-10px)";
      t.style.transition = "all 0.3s ease";
      setTimeout(() => t.remove(), 300);
    }, duration);
  },

  modal(title, bodyHtml, footerHtml = "") {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop show";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ""}
      </div>`;
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.querySelector(".close").onclick = close;
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });
    return { backdrop, close };
  },

  confirm(message, title = "Please confirm") {
    return new Promise(resolve => {
      const { backdrop, close } = this.modal(
        title,
        `<p style="font-size:14px;line-height:1.6;">${message}</p>`,
        `<button class="btn secondary" id="confirm-no" type="button">Cancel</button>
         <button class="btn danger" id="confirm-yes" type="button">Confirm</button>`
      );
      backdrop.querySelector("#confirm-yes").onclick = () => { close(); resolve(true); };
      backdrop.querySelector("#confirm-no").onclick  = () => { close(); resolve(false); };
    });
  },

  showLoading(text = "Loading…") {
    let ov = document.querySelector(".loading-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "loading-overlay";
      document.body.appendChild(ov);
    }
    ov.innerHTML = `<div style="text-align:center;color:var(--primary-dark);">
      <div class="spinner dark" style="width:34px;height:34px;border-width:3px;margin:0 auto 10px;"></div>
      <div style="font-size:13px;font-weight:600;">${text}</div>
    </div>`;
    ov.classList.add("show");
  },

  hideLoading() {
    const ov = document.querySelector(".loading-overlay");
    if (ov) ov.classList.remove("show");
  },

  fmtDate(d) {
    if (!d) return "—";
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  },

  fmtDateTime(d) {
    if (!d) return "—";
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  },

  daysUntil(d) {
    if (!d) return null;
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return null;
    const now = new Date();
    const ms = date.getTime() - now.getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  },

  escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
};

/* =====================================================================
   API HELPERS — thin wrappers around supabase queries
   ===================================================================== */
window.API = {
  // Generic table select
  async select(table, { columns = "*", filter = {}, order = null, limit = null } = {}) {
    let q = sb.from(table).select(columns);
    for (const [col, val] of Object.entries(filter)) {
      if (val !== undefined && val !== null && val !== "") {
        q = q.eq(col, val);
      }
    }
    if (order) q = q.order(order.column, { ascending: order.ascending !== false });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  // RPC call
  async rpc(fn, params = {}) {
    const { data, error } = await sb.rpc(fn, params);
    if (error) throw error;
    return data;
  },

  // CRUD
  async insert(table, row) {
    const { data, error } = await sb.from(table).insert(row).select();
    if (error) throw error;
    return data;
  },
  async update(table, filter, patch) {
    let q = sb.from(table).update(patch);
    for (const [col, val] of Object.entries(filter)) q = q.eq(col, val);
    const { data, error } = await q.select();
    if (error) throw error;
    return data;
  },
  async delete(table, filter) {
    let q = sb.from(table).delete();
    for (const [col, val] of Object.entries(filter)) q = q.eq(col, val);
    const { error } = await q;
    if (error) throw error;
  },

  // Student ID generation (calls Postgres function)
  async nextStudentId() { return this.rpc("next_student_id"); },

  // Student add / update / delete — all wrap Postgres functions so that
  // every operation writes to audit_log atomically (see schema-additions.sql)
  async addStudent(payload)        { return this.rpc("add_student", payload); },
  async updateStudent(userId, payload) {
    return this.rpc("update_student", { p_user_id: userId, ...payload });
  },
  async deleteStudent(userId)      { return this.rpc("delete_student", { p_user_id: userId }); },

  // Book add / update / delete / add-copies — all wrap Postgres functions
  async addBook(payload)           { return this.rpc("add_book", payload); },
  async updateBook(bookId, payload) {
    return this.rpc("update_book", { p_book_id: bookId, ...payload });
  },
  async deleteBook(bookId)         { return this.rpc("delete_book", { p_book_id: bookId }); },
  async addBookCopies(bookId, count) {
    return this.rpc("add_book_copies", { p_book_id: bookId, p_count: count });
  },

  // Circulation (Postgres functions for atomicity)
  async borrowBook(userId, bookId) { return this.rpc("borrow_book", { p_user_id: userId, p_book_id: bookId }); },
  async returnBook(copyId)         { return this.rpc("return_book", { p_copy_id: copyId }); },
  async renewBook(copyId)           { return this.rpc("renew_book",  { p_copy_id: copyId }); },
  async markFinePaid(fineId)        { return this.rpc("mark_fine_paid", { p_fine_id: fineId }); }
};

/* =====================================================================
   Constants — match Code.gs
   ===================================================================== */
window.CONST = {
  LEVELS: ["Intermediate", "ADP", "BS"],
  PROGRAMS: {
    "BS":           ["Islamiyat", "Math"],
    "ADP":          ["English", "Computer"],
    "Intermediate": ["Pre-Med", "Non-Med", "ICS", "I.Com", "FA", "FA(IT)"]
  },
  GENDERS: ["Male", "Female"],
  BOOK_CATEGORIES: ["Islamic", "Mathematics", "English", "Urdu", "Computer Science", "Physics", "Chemistry", "Biology", "History", "Literature", "Other"],
  STATUS_ACTIVE: "Active",
  STATUS_INACTIVE: "Inactive"
};
