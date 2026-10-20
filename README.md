# Library Management System (LMS) — Govt. Graduate College Mamukanjan

A static website for library management, built with **vanilla HTML/CSS/JS** and **Supabase** as the backend. Deployed on **GitHub Pages** (free).

> Migration from Google Apps Script v12 → Static site + Supabase. All original features preserved: catalog management, member management, checkout/return workflow, due dates, fines, student history, audit log, settings.

---

## 📋 Features

### Public (no login)
- Browse library catalog (search, filter by category, sort by title / library no)
- View book details: title, author, library book no, category, almirah, shelf, availability
- View live stats (total titles, total copies, available)

### Librarian only (login required)
- Dashboard with live stats: total books, total copies, available, active borrows, overdue, students, unpaid fines
- Students: add / edit / delete, activate/deactivate, view full history (active borrows + transaction log + fines)
- Books: add / edit / delete (auto-creates copies), filter by category
- Circulation: issue / return / renew with smart autocomplete suggestions
- Fines: list, mark as paid, filter unpaid only
- Audit log: every action timestamped and recorded
- Settings: fine per day, borrow limit, due days, reminder days, librarian email

### Business rules enforced
- Roll No must be unique integer
- Library Book No must be unique
- Add Book requires: Library Book No, Title, Almirah, Shelf, Total Copies
- Borrow blocked if: student inactive / has overdue / has unpaid fines / at borrow limit (default 3)
- Fine = daysLate × Rs. 10 (configurable)
- ID formats: `STU-001`, `BOOK-001`, `BOOK-001-C1`, `TXN-0001`, `FINE-0001`

---

## 🚀 Setup — 4 steps

### Step 1: Run the SQL schema in Supabase

1. Open https://supabase.com/dashboard/project/nzulpbvsofksfktqvole/sql/new
2. Open the file `sql/schema.sql` from this repo (or copy from below)
3. Paste the entire contents into the SQL editor
4. Click **Run** (takes ~3 seconds)
5. You should see "Success. No rows returned."

This creates: 7 tables, seed settings, RLS policies, and Postgres functions for atomic operations.

### Step 2: Create the librarian account

1. Open https://supabase.com/dashboard/project/nzulpbvsofksfktqvole/auth/users
2. Click **"Add user"** → **"Create new user"**
3. Email: `librarian@ggcmkn.com`
4. Password: `123456` (you can change this later)
5. ✅ Check **"Auto Confirm User"** (IMPORTANT — otherwise login will fail)
6. Click **"Create user"**

> ⚠️ The user MUST be auto-confirmed. If you don't see a green checkmark next to their email in the user list, click the three dots → "Confirm user".

### Step 3: Push this code to GitHub

```bash
cd /path/to/lms-web

git init
git add .
git commit -m "Initial LMS web app"

git branch -M main
git remote add origin https://github.com/qasimhanif940/LMS_GGCMKN.git
git push -u origin main
```

If `git push` asks for credentials:
- Use a Personal Access Token (GitHub Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → scope: `repo`)
- Use your GitHub username as username, and the token as password

### Step 4: Enable GitHub Pages

1. Go to https://github.com/qasimhanif940/LMS_GGCMKN/settings/pages
2. Under **Source**, choose:
   - Branch: `main`
   - Folder: `/ (root)`
3. Click **Save**
4. Wait 1–2 minutes. Refresh the page. You'll see a green banner with the URL:
   `https://qasimhanif940.github.io/LMS_GGCMKN/`

🎉 Your library system is live!

---

## 🔗 URLs

| Page | URL |
|---|---|
| Public catalog (no login) | `https://qasimhanif940.github.io/LMS_GGCMKN/catalog.html` |
| Librarian login | `https://qasimhanif940.github.io/LMS_GGCMKN/login.html` |
| Admin dashboard (redirects to login if not authed) | `https://qasimhanif940.github.io/LMS_GGCMKN/` |

---

## ⏰ Optional: Keep Supabase alive (free cron)

Supabase pauses free-tier projects after 7 days of inactivity. The included GitHub Action pings your project daily at 9 AM Karachi time to prevent this.

**To activate:**

1. Go to https://github.com/qasimhanif940/LMS_GGCMKN/settings/secrets/actions
2. Click **"New repository secret"**
3. Add secret name: `SUPABASE_URL` → value: `https://nzulpbvsofksfktqvole.supabase.co`
4. Click **"New repository secret"** again
5. Add secret name: `SUPABASE_ANON_KEY` → value: (your anon key — see `js/supabase-client.js`)
6. Go to https://github.com/qasimhanif940/LMS_GGCMKN/actions and enable workflows if prompted

The action runs daily and you can also trigger it manually via **"Run workflow"**.

---

## 📂 File Structure

```
lms-web/
├── index.html              ← Admin dashboard (librarian only)
├── login.html              ← Librarian login
├── catalog.html            ← PUBLIC catalog (no login)
├── css/
│   └── style.css           ← Shared styles (warm emerald + gold theme)
├── js/
│   ├── supabase-client.js  ← Supabase init + helpers + constants
│   ├── auth.js             ← Session guard for admin pages
│   ├── catalog.js          ← Public catalog logic
│   ├── dashboard.js        ← Stats + active borrows
│   ├── students.js         ← Students CRUD + history view
│   ├── books.js            ← Books CRUD
│   ├── circulation.js      ← Issue / return / renew
│   ├── fines.js            ← Fines list + mark paid
│   ├── audit.js            ← Audit log viewer
│   ├── settings.js         ← Library rules form
│   └── app.js              ← Section navigation
├── assets/
│   └── logo.svg            ← Placeholder logo (replace with your own)
├── sql/
│   └── schema.sql          ← Run this once in Supabase SQL Editor
└── .github/workflows/
    └── keep-alive.yml      ← Daily cron to ping Supabase
```

---

## 🎨 Replacing the logo

The included `assets/logo.svg` is a placeholder. To use your own:

1. Save your logo as `logo.svg` (or `logo.png`) in `assets/`
2. If using `.png`, edit `index.html`, `login.html`, and `catalog.html` to change `logo.svg` → `logo.png`
3. Recommended size: 64×64 px for the header
4. Commit and push

---

## 🔐 Security Notes

- **anon key** is embedded in `js/supabase-client.js`. This is SAFE — it's designed to be public.
- **Database password** is NOT in the code — never was, never will be.
- **Row Level Security (RLS)** is enabled on every table:
  - `books`, `students`, `settings` → public SELECT (catalog browsing)
  - All write operations → require authentication (librarian only)
  - `copies`, `transactions`, `fines`, `audit_log` → librarian only
- Atomic operations (borrow, return, renew, add_book) run as **Postgres SECURITY DEFINER functions** — they bypass RLS for multi-step writes but enforce all business rules server-side.

---

## 🛠️ Tech Stack

- **Frontend**: vanilla HTML5, CSS3, modern JS (ES2017+). No build step. No framework.
- **Backend**: Supabase (PostgreSQL + Auth + RLS + Postgres functions)
- **Hosting**: GitHub Pages (free, static)
- **Cron**: GitHub Actions (free, 2000 min/month)
- **SDK**: `@supabase/supabase-js` loaded via CDN

---

## 🆘 Troubleshooting

**Login fails with "Email not confirmed"**
→ Go to Supabase Dashboard → Authentication → Users → find librarian@ggcmkn.com → click ⋯ → "Confirm user"

**Public catalog shows "Connection failed"**
→ You haven't run `sql/schema.sql` yet. See Step 1 above.

**Pages show 404**
→ Wait 1–2 min after enabling GitHub Pages. Make sure source is `main` branch + `/ (root)` folder.

**Supabase project paused (after 7 days idle)**
→ Go to Supabase dashboard → click "Restore project" (takes ~30 seconds). Then set up the GitHub Actions cron (see above) so it doesn't happen again.

**"Student not found" / "Book not found" when issuing**
→ Always pick from the suggestion dropdown (arrow keys + Enter, or click). The system needs the internal ID (STU-001 / BOOK-001), which is extracted automatically when you select from suggestions.

---

Built for **Govt. Graduate College Mamukanjan** (Code: 331604).
