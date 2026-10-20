-- =====================================================================
-- LMS — Library Management System
-- Govt. Graduate College Mamukanjan
-- Supabase schema + RLS + Postgres functions
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- Students
create table if not exists public.students (
  id               uuid primary key default gen_random_uuid(),
  user_id          text unique not null,                       -- STU-001
  roll_no          text unique not null,
  name             text not null,
  program          text,
  level            text,
  gender           text,
  phone            text,
  email            text,
  status           text not null default 'Active',             -- Active | Inactive
  registered_date  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- Books (catalog)
create table if not exists public.books (
  id                uuid primary key default gen_random_uuid(),
  book_id           text unique not null,                       -- BOOK-001
  library_book_no   text unique not null,
  title             text not null,
  author            text,
  category          text not null default 'Other',
  total_copies      int  not null default 1,
  available_copies  int  not null default 1,
  almirah           text,
  shelf             text,
  added_date        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- Copies (physical copies of books)
create table if not exists public.copies (
  id               uuid primary key default gen_random_uuid(),
  copy_id          text unique not null,                        -- BOOK-001-C1
  book_id          text not null references public.books(book_id) on delete cascade,
  status           text not null default 'Available',          -- Available | Borrowed
  current_borrower text references public.students(user_id) on delete set null,
  borrow_date      timestamptz,
  due_date         timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists idx_copies_book    on public.copies(book_id);
create index if not exists idx_copies_status   on public.copies(status);
create index if not exists idx_copies_borrower on public.copies(current_borrower);

-- Transactions (borrow / return / renew history)
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  txn_id          text unique not null,                         -- TXN-0001
  copy_id         text,
  book_id         text,
  book_title      text,
  user_id         text,
  student_name    text,
  action          text not null,                               -- Borrow | Return | Renew
  date            timestamptz not null default now(),
  due_date        timestamptz,
  return_date     timestamptz,
  days_late       int  not null default 0,
  fine            numeric(10,2) not null default 0,
  fine_status     text not null default 'None',                -- None | Unpaid | Paid
  created_at      timestamptz not null default now()
);
create index if not exists idx_txn_user on public.transactions(user_id);
create index if not exists idx_txn_book on public.transactions(book_id);
create index if not exists idx_txn_date on public.transactions(date desc);

-- Fines
create table if not exists public.fines (
  id            uuid primary key default gen_random_uuid(),
  fine_id       text unique not null,                           -- FINE-0001
  user_id       text,
  student_name  text,
  copy_id       text,
  book_title    text,
  amount        numeric(10,2) not null default 0,
  days_late     int  not null default 0,
  date_levied   timestamptz not null default now(),
  status        text not null default 'Unpaid',                 -- Unpaid | Paid
  date_cleared  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_fines_user   on public.fines(user_id);
create index if not exists idx_fines_status  on public.fines(status);

-- Audit log
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  timestamp   timestamptz not null default now(),
  user_email  text,
  action      text,
  detail      text
);
create index if not exists idx_audit_ts on public.audit_log(timestamp desc);

-- Settings (key-value)
create table if not exists public.settings (
  key   text primary key,
  value text
);

-- ---------------------------------------------------------------------
-- 2. SEED SETTINGS (only if not present)
-- ---------------------------------------------------------------------
insert into public.settings (key, value) values
  ('finePerDay',         '10'),
  ('borrowLimit',        '3'),
  ('dueDays',             '14'),
  ('reminderDaysBefore', '2'),
  ('librarianEmail',     ''),
  ('lastStudentSeq',     '0'),
  ('lastBookSeq',        '0'),
  ('lastTxnSeq',         '0'),
  ('lastFineSeq',        '0')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.students     enable row level security;
alter table public.books        enable row level security;
alter table public.copies       enable row level security;
alter table public.transactions enable row level security;
alter table public.fines         enable row level security;
alter table public.audit_log     enable row level security;
alter table public.settings     enable row level security;

-- Drop existing policies (idempotent re-run)
drop policy if exists "books_public_read"        on public.books;
drop policy if exists "books_admin_write"        on public.books;
drop policy if exists "students_public_read"     on public.students;
drop policy if exists "students_admin_write"     on public.students;
drop policy if exists "copies_admin_all"         on public.copies;
drop policy if exists "txn_admin_all"            on public.transactions;
drop policy if exists "fines_admin_all"          on public.fines;
drop policy if exists "audit_admin_all"          on public.audit_log;
drop policy if exists "settings_public_read"     on public.settings;
drop policy if exists "settings_admin_write"     on public.settings;

-- PUBLIC read for catalog (books + students names only)
create policy "books_public_read"    on public.books
  for select to anon, authenticated using (true);

create policy "students_public_read" on public.students
  for select to anon, authenticated using (true);

create policy "settings_public_read" on public.settings
  for select to anon, authenticated using (true);

-- ADMIN (authenticated librarian) — full access to write tables
create policy "books_admin_write"    on public.books
  for all to authenticated using (true) with check (true);

create policy "students_admin_write" on public.students
  for all to authenticated using (true) with check (true);

create policy "copies_admin_all"     on public.copies
  for all to authenticated using (true) with check (true);

create policy "txn_admin_all"        on public.transactions
  for all to authenticated using (true) with check (true);

create policy "fines_admin_all"      on public.fines
  for all to authenticated using (true) with check (true);

create policy "audit_admin_all"      on public.audit_log
  for all to authenticated using (true) with check (true);

create policy "settings_admin_write" on public.settings
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 4. POSTGRES FUNCTIONS (atomic operations + ID generation)
-- ---------------------------------------------------------------------

-- Helper: audit
create or replace function public.audit(p_action text, p_detail text)
returns void language plpgsql security definer as $$
begin
  insert into public.audit_log (timestamp, user_email, action, detail)
  values (now(), coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'librarian'), p_action, p_detail);
exception when others then null;
end;
$$;

-- Next student ID (STU-001 ...)
create or replace function public.next_student_id()
returns text language plpgsql security definer as $$
declare
  next_seq int;
  new_id   text;
begin
  update public.settings set value = (cast(value as int) + 1)::text
   where key = 'lastStudentSeq'
   returning cast(value as int) into next_seq;
  new_id := 'STU-' || lpad(coalesce(next_seq,1)::text, 3, '0');
  return new_id;
end;
$$;

-- Next book ID (BOOK-001 ...)
create or replace function public.next_book_id()
returns text language plpgsql security definer as $$
declare
  next_seq int;
  new_id   text;
begin
  update public.settings set value = (cast(value as int) + 1)::text
   where key = 'lastBookSeq'
   returning cast(value as int) into next_seq;
  new_id := 'BOOK-' || lpad(coalesce(next_seq,1)::text, 3, '0');
  return new_id;
end;
$$;

-- Next transaction ID (TXN-0001 ...)
create or replace function public.next_txn_id()
returns text language plpgsql security definer as $$
declare
  next_seq int;
  new_id   text;
begin
  update public.settings set value = (cast(value as int) + 1)::text
   where key = 'lastTxnSeq'
   returning cast(value as int) into next_seq;
  new_id := 'TXN-' || lpad(coalesce(next_seq,1)::text, 4, '0');
  return new_id;
end;
$$;

-- Next fine ID (FINE-0001 ...)
create or replace function public.next_fine_id()
returns text language plpgsql security definer as $$
declare
  next_seq int;
  new_id   text;
begin
  update public.settings set value = (cast(value as int) + 1)::text
   where key = 'lastFineSeq'
   returning cast(value as int) into next_seq;
  new_id := 'FINE-' || lpad(coalesce(next_seq,1)::text, 4, '0');
  return new_id;
end;
$$;

-- ADD BOOK (creates book + N copies atomically)
create or replace function public.add_book(
  p_library_book_no text,
  p_title           text,
  p_author          text,
  p_category        text,
  p_total_copies    int,
  p_almirah         text,
  p_shelf           text
)
returns text language plpgsql security definer as $$
declare
  v_book_id text;
  v_total   int := greatest(coalesce(p_total_copies,1),1);
  v_i       int;
  v_copy_id text;
begin
  if p_library_book_no is null or trim(p_library_book_no) = '' then
    raise exception 'Library Book No is required.';
  end if;
  if p_title is null or trim(p_title) = '' then
    raise exception 'Title is required.';
  end if;
  if p_almirah is null or trim(p_almirah) = '' then
    raise exception 'Almirah is required.';
  end if;
  if p_shelf is null or trim(p_shelf) = '' then
    raise exception 'Shelf is required.';
  end if;
  if exists (select 1 from public.books where library_book_no = p_library_book_no) then
    raise exception 'Library Book No already exists.';
  end if;

  v_book_id := public.next_book_id();
  insert into public.books (book_id, library_book_no, title, author, category, total_copies, available_copies, almirah, shelf, added_date)
  values (v_book_id, p_library_book_no, p_title, p_author, coalesce(p_category,'Other'), v_total, v_total, p_almirah, p_shelf, now());

  for v_i in 1..v_total loop
    v_copy_id := v_book_id || '-C' || v_i::text;
    insert into public.copies (copy_id, book_id, status, current_borrower, borrow_date, due_date)
    values (v_copy_id, v_book_id, 'Available', null, null, null);
  end loop;

  perform public.audit('Add Book', v_book_id || ' / ' || p_title);
  return v_book_id;
end;
$$;

-- BORROW BOOK (atomic): resolve student + book, check rules, update copy, create txn
create or replace function public.borrow_book(
  p_user_id text,
  p_book_id text
)
returns json language plpgsql security definer as $$
declare
  v_student       public.students%rowtype;
  v_book          public.books%rowtype;
  v_copy          public.copies%rowtype;
  v_settings      json;
  v_borrow_limit  int;
  v_due_days      int;
  v_active_count  int;
  v_has_overdue   boolean;
  v_has_unpaid    boolean;
  v_due_date      timestamptz;
  v_txn_id        text;
begin
  -- Resolve student
  select * into v_student from public.students where user_id = p_user_id;
  if not found then
    raise exception 'Student not found.';
  end if;
  if lower(coalesce(v_student.status,'')) = 'inactive' then
    raise exception 'Student is INACTIVE. Cannot issue books.';
  end if;

  -- Resolve book
  select * into v_book from public.books where book_id = p_book_id;
  if not found then
    raise exception 'Book not found.';
  end if;

  -- Settings
  select json_object_agg(key, value) into v_settings from public.settings;
  v_borrow_limit := coalesce(cast(v_settings->>'borrowLimit' as int), 3);
  v_due_days     := coalesce(cast(v_settings->>'dueDays' as int), 14);

  -- Checks
  select count(*) into v_active_count from public.copies
   where status = 'Borrowed' and current_borrower = v_student.user_id;
  if v_active_count >= v_borrow_limit then
    raise exception 'Borrow limit reached (% books). Return one first.', v_borrow_limit;
  end if;

  select exists (
    select 1 from public.copies
     where status = 'Borrowed' and current_borrower = v_student.user_id
       and due_date < now()
  ) into v_has_overdue;
  if v_has_overdue then
    raise exception 'Student has overdue book(s). Return or renew first.';
  end if;

  select exists (
    select 1 from public.fines where user_id = v_student.user_id and status = 'Unpaid'
  ) into v_has_unpaid;
  if v_has_unpaid then
    raise exception 'Student has unpaid fines. Clear them first.';
  end if;

  -- Find an Available copy
  select * into v_copy from public.copies
   where book_id = v_book.book_id and status = 'Available'
   order by copy_id asc limit 1;
  if not found then
    raise exception 'No available copy of this book.';
  end if;

  -- Update copy
  v_due_date := now() + (v_due_days || ' days')::interval;
  update public.copies set
    status = 'Borrowed',
    current_borrower = v_student.user_id,
    borrow_date = now(),
    due_date = v_due_date
   where copy_id = v_copy.copy_id;

  -- Decrement available_copies on book
  update public.books set available_copies = greatest(available_copies - 1, 0)
   where book_id = v_book.book_id;

  -- Append txn
  v_txn_id := public.next_txn_id();
  insert into public.transactions (txn_id, copy_id, book_id, book_title, user_id, student_name, action, date, due_date, return_date, days_late, fine, fine_status)
  values (v_txn_id, v_copy.copy_id, v_book.book_id, v_book.title, v_student.user_id, v_student.name, 'Borrow', now(), v_due_date, null, 0, 0, 'None');

  perform public.audit('Borrow', v_copy.copy_id || ' -> ' || v_student.user_id);

  return json_build_object(
    'ok', true,
    'copy_id', v_copy.copy_id,
    'due_date', v_due_date,
    'txn_id', v_txn_id
  );
end;
$$;

-- RETURN BOOK (atomic): clear copy, compute fine, create txn + fine if late
create or replace function public.return_book(p_copy_id text)
returns json language plpgsql security definer as $$
declare
  v_copy       public.copies%rowtype;
  v_book       public.books%rowtype;
  v_student    public.students%rowtype;
  v_settings   json;
  v_fine_per_day int;
  v_days_late  int := 0;
  v_fine       numeric(10,2) := 0;
  v_fine_id    text;
  v_txn_id    text;
begin
  select * into v_copy from public.copies where copy_id = p_copy_id;
  if not found or v_copy.status <> 'Borrowed' then
    raise exception 'No active borrow matches this copy.';
  end if;

  select * into v_book from public.books where book_id = v_copy.book_id;
  select * into v_student from public.students where user_id = v_copy.current_borrower;

  select json_object_agg(key, value) into v_settings from public.settings;
  v_fine_per_day := coalesce(cast(v_settings->>'finePerDay' as int), 10);

  if v_copy.due_date is not null and now() > v_copy.due_date then
    v_days_late := extract(day from (now() - v_copy.due_date))::int;
    if v_days_late < 0 then v_days_late := 0; end if;
    v_fine := v_days_late * v_fine_per_day;
  end if;

  -- Clear copy row
  update public.copies set
    status = 'Available',
    current_borrower = null,
    borrow_date = null,
    due_date = null
   where copy_id = v_copy.copy_id;

  -- Increment available_copies
  update public.books set available_copies = available_copies + 1
   where book_id = v_copy.book_id;

  -- Append Return txn
  v_txn_id := public.next_txn_id();
  insert into public.transactions (txn_id, copy_id, book_id, book_title, user_id, student_name, action, date, due_date, return_date, days_late, fine, fine_status)
  values (v_txn_id, v_copy.copy_id, v_copy.book_id, v_book.title, v_copy.current_borrower, v_student.name, 'Return', now(), v_copy.due_date, now(), v_days_late, v_fine,
          case when v_fine > 0 then 'Unpaid' else 'None' end);

  -- Fine row if late
  if v_fine > 0 then
    v_fine_id := public.next_fine_id();
    insert into public.fines (fine_id, user_id, student_name, copy_id, book_title, amount, days_late, date_levied, status, date_cleared)
    values (v_fine_id, v_copy.current_borrower, v_student.name, v_copy.copy_id, v_book.title, v_fine, v_days_late, now(), 'Unpaid', null);
  end if;

  perform public.audit('Return', v_copy.copy_id || (case when v_fine > 0 then ' (fine Rs.' || v_fine || ')' else '' end));

  return json_build_object(
    'ok', true,
    'copy_id', v_copy.copy_id,
    'days_late', v_days_late,
    'fine', v_fine,
    'book_title', v_book.title
  );
end;
$$;

-- RENEW BOOK (extends due date)
create or replace function public.renew_book(p_copy_id text)
returns json language plpgsql security definer as $$
declare
  v_copy       public.copies%rowtype;
  v_book       public.books%rowtype;
  v_student    public.students%rowtype;
  v_due_days   int;
  v_new_due    timestamptz;
  v_txn_id    text;
begin
  select * into v_copy from public.copies where copy_id = p_copy_id;
  if not found or v_copy.status <> 'Borrowed' then
    raise exception 'No active borrow matches this copy.';
  end if;
  select * into v_book from public.books where book_id = v_copy.book_id;
  select * into v_student from public.students where user_id = v_copy.current_borrower;

  select cast(value as int) into v_due_days from public.settings where key = 'dueDays';
  v_due_days := coalesce(v_due_days, 14);
  v_new_due := now() + (v_due_days || ' days')::interval;

  update public.copies set due_date = v_new_due where copy_id = v_copy.copy_id;

  v_txn_id := public.next_txn_id();
  insert into public.transactions (txn_id, copy_id, book_id, book_title, user_id, student_name, action, date, due_date)
  values (v_txn_id, v_copy.copy_id, v_copy.book_id, v_book.title, v_copy.current_borrower, v_student.name, 'Renew', now(), v_new_due);

  perform public.audit('Renew', v_copy.copy_id || ' -> due ' || v_new_due);

  return json_build_object(
    'ok', true,
    'copy_id', v_copy.copy_id,
    'new_due_date', v_new_due
  );
end;
$$;

-- MARK FINE PAID
create or replace function public.mark_fine_paid(p_fine_id text)
returns boolean language plpgsql security definer as $$
begin
  update public.fines set status = 'Paid', date_cleared = now()
   where fine_id = p_fine_id and status = 'Unpaid';
  if not found then
    raise exception 'Fine not found or already paid.';
  end if;
  perform public.audit('Mark Fine Paid', p_fine_id);
  return true;
end;
$$;

-- DONE.
