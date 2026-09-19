-- Employee attendance application, Supabase baseline.
-- Apply through `supabase db push` or the Supabase SQL editor before deploying.
create extension if not exists pgcrypto;

create table if not exists public.shops (
  id text primary key,
  display_name text not null default 'DE TEAM',
  timezone text not null default 'Asia/Bangkok',
  system_start_date date not null default current_date,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_members (
  shop_id text not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

-- Documents retain the existing API document shapes during the cutover.  Each API
-- operation is scoped by shop_id and a deterministic path (for example
-- `employees/{id}/rates/{id}`), so the application can move to typed tables later
-- without exposing old Firestore collections to the browser.
create table if not exists public.app_documents (
  shop_id text not null references public.shops(id) on delete cascade,
  path text not null check (path !~ '(^/|//|/\.$|/\.\./|^$)'),
  data jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, path)
);
create index if not exists app_documents_shop_path_idx on public.app_documents(shop_id, path text_pattern_ops);

create or replace function public.is_shop_member(target_shop_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shop_members
    where shop_id = target_shop_id and user_id = auth.uid()
  );
$$;

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.app_documents enable row level security;

create policy "members read shops" on public.shops for select using (public.is_shop_member(id));
create policy "members read memberships" on public.shop_members for select using (user_id = auth.uid());
create policy "members manage documents" on public.app_documents
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-photos', 'employee-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "members read employee photos" on storage.objects for select
  using (bucket_id = 'employee-photos' and public.is_shop_member(split_part(name, '/', 1)));
create policy "members write employee photos" on storage.objects for insert
  with check (bucket_id = 'employee-photos' and public.is_shop_member(split_part(name, '/', 1)));
create policy "members update employee photos" on storage.objects for update
  using (bucket_id = 'employee-photos' and public.is_shop_member(split_part(name, '/', 1)));
create policy "members delete employee photos" on storage.objects for delete
  using (bucket_id = 'employee-photos' and public.is_shop_member(split_part(name, '/', 1)));

create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger shops_touch_updated_at before update on public.shops for each row execute function public.touch_updated_at();
create trigger app_documents_touch_updated_at before update on public.app_documents for each row execute function public.touch_updated_at();
