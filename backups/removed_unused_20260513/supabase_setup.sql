create table if not exists public.quiz_access_codes (
  code text primary key,
  is_used boolean not null default false,
  used_at timestamptz,
  used_by_client_id text,
  created_at timestamptz not null default now()
);

alter table public.quiz_access_codes enable row level security;

-- Frontend users must not read or write this table directly.
drop policy if exists "deny_all_anon" on public.quiz_access_codes;
create policy "deny_all_anon"
on public.quiz_access_codes
for all
to anon
using (false)
with check (false);

-- Replace existing rows when importing a new JSON pool.
-- Example import strategy:
-- 1) truncate table public.quiz_access_codes;
-- 2) insert into public.quiz_access_codes(code)
--    values ('123456'), ('654321');
