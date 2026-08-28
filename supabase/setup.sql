-- Run this once in Supabase SQL Editor.
-- Replace the two email placeholders only in the SQL Editor; do not commit real emails.

begin;

create table if not exists public.board_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.project_boards (
  id text primary key,
  state jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.board_editors enable row level security;
alter table public.project_boards enable row level security;

revoke all on public.board_editors from anon, authenticated;
revoke all on public.project_boards from anon;
grant select, insert, update on public.project_boards to authenticated;

create or replace function public.is_board_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.board_editors where user_id = auth.uid()
  );
$$;

revoke all on function public.is_board_editor() from public;
grant execute on function public.is_board_editor() to authenticated;

drop policy if exists "two editors can read board" on public.project_boards;
create policy "two editors can read board"
on public.project_boards for select to authenticated
using (id = 'main' and public.is_board_editor());

drop policy if exists "two editors can create board" on public.project_boards;
create policy "two editors can create board"
on public.project_boards for insert to authenticated
with check (id = 'main' and public.is_board_editor() and updated_by = auth.uid());

drop policy if exists "two editors can update board" on public.project_boards;
create policy "two editors can update board"
on public.project_boards for update to authenticated
using (id = 'main' and public.is_board_editor())
with check (id = 'main' and public.is_board_editor() and updated_by = auth.uid());

delete from public.board_editors;
insert into public.board_editors (user_id)
select id from auth.users
where lower(email) in (lower('YOUR_EMAIL'), lower('SISTER_EMAIL'))
on conflict (user_id) do nothing;

do $$
begin
  if (select count(*) from public.board_editors) <> 2 then
    raise exception 'Exactly two matching Auth users are required. Check both email addresses.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_boards'
  ) then
    alter publication supabase_realtime add table public.project_boards;
  end if;
end $$;

commit;
