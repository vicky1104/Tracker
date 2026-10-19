-- HabitFlow — server push notifications (streak-at-risk nudges)

-- ---------------------------------------------------------------------------
-- Device push tokens (Expo push tokens), one row per device
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  token text primary key check (char_length(token) between 10 and 255),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  device_name text check (char_length(device_name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy push_tokens_select on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_tokens_delete on public.push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));
-- No direct insert/update: registration goes through register_push_token(), which
-- also handles a device that moves from one account to another.

create or replace function public.register_push_token(p_token text, p_platform text, p_device_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.push_tokens (token, user_id, platform, device_name)
  values (p_token, uid, p_platform, left(p_device_name, 100))
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        device_name = excluded.device_name,
        updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Nudge log: at most one streak nudge per user per local day (idempotency)
-- ---------------------------------------------------------------------------

create table public.push_nudges (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'none', 'error')),
  habit_count integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

alter table public.push_nudges enable row level security;
-- Owner may read their own history; writes are server-only (service role).
create policy push_nudges_select on public.push_nudges for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Hourly schedule (pg_cron + pg_net). The function URL and shared secret are read
-- from Vault at run time — create them once per project (see README):
--   select vault.create_secret('https://<ref>.supabase.co', 'habitflow_project_url');
--   select vault.create_secret('<random secret>', 'habitflow_cron_secret');
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'habitflow-streak-nudges',
  '0 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'habitflow_project_url')
           || '/functions/v1/streak-nudges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'habitflow_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'habitflow_cron_secret');
  $cron$
);
