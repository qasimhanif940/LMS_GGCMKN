-- =====================================================================
-- LMS — Schema Additions (audit-enabled CRUD functions)
-- Govt. Graduate College Mamukanjan
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- PURPOSE:
--   Wrap student add/edit/delete and book delete/edit in Postgres
--   SECURITY DEFINER functions so every state-changing operation
--   writes a row to audit_log automatically.
--
--   This file is ADDITIVE — it does not change existing tables or
--   functions. Safe to re-run (uses `create or replace function`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ADD STUDENT  (creates row + audit entry, returns new user_id)
-- ---------------------------------------------------------------------
create or replace function public.add_student(
  p_roll_no text,
  p_name    text,
  p_program text,
  p_level   text,
  p_gender  text,
  p_phone   text,
  p_email   text,
  p_status  text
)
returns text language plpgsql security definer as $$
declare
  v_user_id text;
begin
  if p_roll_no is null or trim(p_roll_no) = '' then
    raise exception 'Roll No is required.';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'Name is required.';
  end if;
  if exists (select 1 from public.students where roll_no = p_roll_no) then
    raise exception 'Roll No % already exists.', p_roll_no;
  end if;

  v_user_id := public.next_student_id();
  insert into public.students (
    user_id, roll_no, name, program, level, gender,
    phone, email, status, registered_date
  ) values (
    v_user_id, p_roll_no, p_name, p_program, p_level, p_gender,
    p_phone, p_email, coalesce(p_status, 'Active'), now()
  );

  perform public.audit(
    'Add Student',
    v_user_id || ' / ' || p_name || ' (Roll ' || p_roll_no || ')'
  );
  return v_user_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. UPDATE STUDENT  (updates row + audit entry)
-- ---------------------------------------------------------------------
create or replace function public.update_student(
  p_user_id text,
  p_roll_no text,
  p_name    text,
  p_program text,
  p_level   text,
  p_gender  text,
  p_phone   text,
  p_email   text,
  p_status  text
)
returns boolean language plpgsql security definer as $$
begin
  if p_roll_no is null or trim(p_roll_no) = '' then
    raise exception 'Roll No is required.';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'Name is required.';
  end if;
  if exists (
    select 1 from public.students
     where roll_no = p_roll_no and user_id <> p_user_id
  ) then
    raise exception 'Roll No % already exists on another student.', p_roll_no;
  end if;

  update public.students set
    roll_no = p_roll_no,
    name    = p_name,
    program = p_program,
    level   = p_level,
    gender  = p_gender,
    phone   = p_phone,
    email   = p_email,
    status  = coalesce(p_status, 'Active')
   where user_id = p_user_id;

  if not found then
    raise exception 'Student not found (%).', p_user_id;
  end if;

  perform public.audit('Update Student', p_user_id || ' / ' || p_name);
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. DELETE STUDENT  (validates no active borrows / unpaid fines,
--                    deletes, then audits)
-- ---------------------------------------------------------------------
create or replace function public.delete_student(p_user_id text)
returns boolean language plpgsql security definer as $$
declare
  v_name          text;
  v_active_count  int;
  v_unpaid_count  int;
begin
  select name into v_name from public.students where user_id = p_user_id;
  if not found then
    raise exception 'Student not found (%).', p_user_id;
  end if;

  -- Active borrows check
  select count(*) into v_active_count from public.copies
   where status = 'Borrowed' and current_borrower = p_user_id;
  if v_active_count > 0 then
    raise exception
      'Cannot delete: student has % unreturned book(s). Return them first.',
      v_active_count;
  end if;

  -- Unpaid fines check
  select count(*) into v_unpaid_count from public.fines
   where user_id = p_user_id and status = 'Unpaid';
  if v_unpaid_count > 0 then
    raise exception
      'Cannot delete: student has % unpaid fine(s). Clear them first.',
      v_unpaid_count;
  end if;

  delete from public.students where user_id = p_user_id;
  perform public.audit('Remove Student', p_user_id || ' / ' || v_name);
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. UPDATE BOOK  (basic fields only; does not touch copies)
-- ---------------------------------------------------------------------
create or replace function public.update_book(
  p_book_id         text,
  p_library_book_no text,
  p_title           text,
  p_author          text,
  p_category        text,
  p_almirah         text,
  p_shelf           text
)
returns boolean language plpgsql security definer as $$
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
  if exists (
    select 1 from public.books
     where library_book_no = p_library_book_no and book_id <> p_book_id
  ) then
    raise exception 'Library Book No % already exists on another book.',
      p_library_book_no;
  end if;

  update public.books set
    library_book_no = p_library_book_no,
    title           = p_title,
    author          = p_author,
    category        = coalesce(p_category, 'Other'),
    almirah         = p_almirah,
    shelf           = p_shelf
   where book_id = p_book_id;

  if not found then
    raise exception 'Book not found (%).', p_book_id;
  end if;

  perform public.audit('Update Book', p_book_id || ' / ' || p_title);
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. ADD EXTRA COPIES  (used by "Edit Book → add N copies")
-- ---------------------------------------------------------------------
create or replace function public.add_book_copies(
  p_book_id text,
  p_count   int
)
returns int language plpgsql security definer as $$
declare
  v_book       public.books%rowtype;
  v_start_idx  int;
  v_i          int;
  v_copy_id    text;
  v_added      int := 0;
begin
  if p_count is null or p_count <= 0 then
    raise exception 'Count must be at least 1.';
  end if;

  select * into v_book from public.books where book_id = p_book_id;
  if not found then
    raise exception 'Book not found (%).', p_book_id;
  end if;

  v_start_idx := coalesce(v_book.total_copies, 0) + 1;
  for v_i in 0..(p_count - 1) loop
    v_copy_id := p_book_id || '-C' || (v_start_idx + v_i)::text;
    insert into public.copies (copy_id, book_id, status, current_borrower, borrow_date, due_date)
    values (v_copy_id, p_book_id, 'Available', null, null, null);
    v_added := v_added + 1;
  end loop;

  update public.books set
    total_copies     = total_copies + p_count,
    available_copies = available_copies + p_count
   where book_id = p_book_id;

  perform public.audit(
    'Update Book',
    p_book_id || ' / added ' || p_count || ' copies'
  );
  return v_added;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. DELETE BOOK  (validates no borrowed copies, cascades to copies,
--                  then audits)
-- ---------------------------------------------------------------------
create or replace function public.delete_book(p_book_id text)
returns boolean language plpgsql security definer as $$
declare
  v_title          text;
  v_borrowed_count int;
begin
  select title into v_title from public.books where book_id = p_book_id;
  if not found then
    raise exception 'Book not found (%).', p_book_id;
  end if;

  select count(*) into v_borrowed_count from public.copies
   where book_id = p_book_id and status = 'Borrowed';
  if v_borrowed_count > 0 then
    raise exception
      'Cannot delete: % copy/copies are currently borrowed. Return them first.',
      v_borrowed_count;
  end if;

  -- Cascades to copies (FK ON DELETE CASCADE)
  delete from public.books where book_id = p_book_id;

  perform public.audit('Remove Book', p_book_id || ' / ' || v_title);
  return true;
end;
$$;

-- DONE. After running this file, every Add / Edit / Delete on students
-- and books will write an entry to audit_log automatically.
