/* =====================================================================
   auth.js — session guard for admin pages
   Catalog page is public (does not include this file).
   ===================================================================== */

(async () => {
  // Wait for supabase to init
  if (!window.sb) {
    await new Promise(resolve => {
      document.addEventListener("supabase:ready", resolve, { once: true });
      document.addEventListener("supabase:failed", resolve, { once: true });
    });
  }
  if (!window.sb) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    // Redirect to login, remember where they came from
    const here = encodeURIComponent(window.location.pathname.split("/").pop() || "index.html");
    window.location.replace(`login.html?next=${here}`);
    return;
  }

  // Expose current user
  window.currentUser = session.user;
  document.dispatchEvent(new CustomEvent("auth:ready", { detail: session.user }));

  // Wire logout buttons
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-logout]")) {
      e.preventDefault();
      await sb.auth.signOut();
      window.location.replace("login.html");
    }
  });
})();
