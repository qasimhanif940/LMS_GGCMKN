/* =====================================================================
   circulation.js — Issue / Return / Renew via Postgres functions
   ===================================================================== */

let selectedIssueStudent = null;
let selectedIssueBook = null;

document.addEventListener("auth:ready", () => {
  // Wire suggestion inputs once DOM ready + data loaded
  const tryWire = () => {
    const studentInput = document.getElementById("issue-student");
    const studentSuggest = document.getElementById("suggest-student");
    const bookInput = document.getElementById("issue-book");
    const bookSuggest = document.getElementById("suggest-book");

    if (studentInput && window.setupStudentSuggest && ALL_STUDENTS.length >= 0) {
      window.setupStudentSuggest(studentInput, studentSuggest, (s) => {
        selectedIssueStudent = s.user_id;
      });
    }
    if (bookInput && window.setupBookSuggest) {
      window.setupBookSuggest(bookInput, bookSuggest, (b) => {
        selectedIssueBook = b.book_id;
      });
    }
  };
  // Wait a tick so students.js and books.js have populated ALL_STUDENTS / ALL_BOOKS
  setTimeout(tryWire, 100);

  // Issue button
  document.getElementById("btn-issue").addEventListener("click", issueBook);

  // Manual return / renew (paste Copy ID)
  document.getElementById("btn-return-manual").addEventListener("click", () => {
    const copyId = document.getElementById("return-copy-id").value.trim();
    if (!copyId) return UI.toast("Enter a Copy ID first", "warning");
    doReturn(copyId);
  });
  document.getElementById("btn-renew-manual").addEventListener("click", () => {
    const copyId = document.getElementById("return-copy-id").value.trim();
    if (!copyId) return UI.toast("Enter a Copy ID first", "warning");
    doRenew(copyId);
  });
});

async function issueBook() {
  // Resolve student
  const studentInputVal = document.getElementById("issue-student").value.trim();
  if (!selectedIssueStudent && studentInputVal) {
    // Try to extract STU-XXX from text
    const m = studentInputVal.match(/(STU-\d+)/i);
    if (m) selectedIssueStudent = m[1].toUpperCase();
  }
  if (!selectedIssueStudent) {
    return UI.toast("Please pick a student from the suggestions", "warning");
  }

  const bookInputVal = document.getElementById("issue-book").value.trim();
  if (!selectedIssueBook && bookInputVal) {
    const m = bookInputVal.match(/(BOOK-\d+)/i);
    if (m) selectedIssueBook = m[1].toUpperCase();
  }
  if (!selectedIssueBook) {
    return UI.toast("Please pick a book from the suggestions", "warning");
  }

  const ok = await UI.confirm(`Issue <strong>${UI.escapeHtml(bookInputVal)}</strong> to <strong>${UI.escapeHtml(studentInputVal)}</strong>?`);
  if (!ok) return;

  try {
    UI.showLoading("Issuing book…");
    const res = await API.borrowBook(selectedIssueStudent, selectedIssueBook);
    UI.hideLoading();
    UI.toast(`Book issued ✓ Copy ${res.copy_id}, due ${UI.fmtDate(res.due_date)}`, "success", 5000);
    // Clear inputs
    document.getElementById("issue-student").value = "";
    document.getElementById("issue-book").value = "";
    selectedIssueStudent = null;
    selectedIssueBook = null;
    // Reload dashboard
    if (window.loadDashboard) loadDashboard();
    if (window.loadBooks) loadBooks();
  } catch (err) {
    UI.hideLoading();
    UI.toast(err.message || "Issue failed", "error");
  }
}

async function doReturn(copyId) {
  const ok = await UI.confirm(`Return copy <strong>${UI.escapeHtml(copyId)}</strong>?`);
  if (!ok) return;
  try {
    UI.showLoading("Returning…");
    const res = await API.returnBook(copyId);
    UI.hideLoading();
    UI.toast(`Returned ${res.copy_id}. ${res.days_late > 0 ? `Fine: Rs. ${res.fine}` : "No fine."}`, res.days_late > 0 ? "warning" : "success", 5000);
    document.getElementById("return-copy-id").value = "";
    if (window.loadDashboard) loadDashboard();
    if (window.loadBooks) loadBooks();
  } catch (err) {
    UI.hideLoading();
    UI.toast(err.message || "Return failed", "error");
  }
}

async function doRenew(copyId) {
  const ok = await UI.confirm(`Renew copy <strong>${UI.escapeHtml(copyId)}</strong>? (resets due date)`);
  if (!ok) return;
  try {
    UI.showLoading("Renewing…");
    const res = await API.renewBook(copyId);
    UI.hideLoading();
    UI.toast(`Renewed ✓ New due date: ${UI.fmtDate(res.new_due_date)}`, "success");
    document.getElementById("return-copy-id").value = "";
    if (window.loadDashboard) loadDashboard();
  } catch (err) {
    UI.hideLoading();
    UI.toast(err.message || "Renew failed", "error");
  }
}
