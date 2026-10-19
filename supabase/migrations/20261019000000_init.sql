-- HabitFlow — initial schema
--
-- Conventions (mirrors the on-device SQLite schema):
--   * ids are client-generated UUIDs (stable across devices, idempotent upserts)
--   * created_at / updated_at / deleted_at are client UTC timestamps; deletes are tombstones
--   * occurrence dates (date, start_date, effective_from, archived_on) are local calendar dates
--   * server_updated_at is set by the server on every write and is the pull cursor
--   * every user-owned row carries user_id and is protected by row-level security
--   * last-writer-wins: an update with an older updated_at than the stored row is ignored

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

create or replace function public.tg_sync_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id cannot be changed';
    end if;
    -- Last-writer-wins: silently ignore stale writes from devices that were offline.
    if new.updated_at < old.updated_at then
      return null;
    end if;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.tg_touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Habit lists
-- ---------------------------------------------------------------------------

create table public.habit_lists (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null check (char_length(icon) between 1 and 16),
  sort_order integer not null default 0,
  archived_on date,
  inactive_ranges jsonb not null default '[]'::jsonb check (jsonb_typeof(inactive_ranges) = 'array'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index habit_lists_user_sync on public.habit_lists (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Habits (configuration only — completion history lives in habit_completions)
-- ---------------------------------------------------------------------------

create table public.habits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id uuid not null references public.habit_lists (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 280),
  icon text not null check (char_length(icon) between 1 and 16),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  category text not null default 'other'
    check (category in ('health', 'fitness', 'learning', 'productivity', 'mindfulness', 'sleep', 'personal', 'other')),
  time_of_day text not null default 'anytime' check (time_of_day in ('morning', 'afternoon', 'evening', 'anytime')),
  kind text not null default 'check' check (kind in ('check', 'numeric')),
  target numeric check (target is null or target > 0),
  unit text not null default '' check (char_length(unit) <= 20),
  target_direction text not null default 'atLeast' check (target_direction in ('atLeast', 'atMost')),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  sort_order integer not null default 0,
  archived_on date,
  inactive_ranges jsonb not null default '[]'::jsonb check (jsonb_typeof(inactive_ranges) = 'array'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index habits_user_sync on public.habits (user_id, server_updated_at);
create index habits_list on public.habits (list_id);

-- ---------------------------------------------------------------------------
-- Versioned schedules: a date is evaluated against the version in effect then
-- ---------------------------------------------------------------------------

create table public.habit_schedules (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  effective_from date not null,
  rule jsonb not null check (
    jsonb_typeof(rule) = 'object'
    and rule ->> 'type' in ('daily', 'weekdays', 'monthDays', 'interval', 'timesPerWeek', 'timesPerMonth')
  ),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create unique index habit_schedules_habit_from on public.habit_schedules (habit_id, effective_from)
  where deleted_at is null;
create index habit_schedules_user_sync on public.habit_schedules (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

create table public.habit_reminders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  time text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  weekdays jsonb check (weekdays is null or jsonb_typeof(weekdays) = 'array'),
  enabled boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index habit_reminders_user_sync on public.habit_reminders (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Completions: one record per habit per local date (no duplicates possible)
-- ---------------------------------------------------------------------------

create table public.habit_completions (
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null check (status in ('done', 'partial', 'skipped', 'missed')),
  value numeric check (value is null or value >= 0),
  note text not null default '' check (char_length(note) <= 280),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (habit_id, date)
);
create index habit_completions_user_sync on public.habit_completions (user_id, server_updated_at);
create index habit_completions_user_date on public.habit_completions (user_id, date);

-- ---------------------------------------------------------------------------
-- User settings (one row per user; whole-object last-writer-wins)
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  -- IANA time zone (e.g. "Asia/Kolkata"), used for server-side date logic and support.
  time_zone text not null default 'UTC' check (char_length(time_zone) <= 64),
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- ---------------------------------------------------------------------------
-- Subscriptions (written only by the RevenueCat webhook via service role)
-- ---------------------------------------------------------------------------

create table public.subscription_entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement text not null,
  is_active boolean not null default false,
  product_id text,
  store text,
  expires_at timestamptz,
  will_renew boolean,
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement)
);

-- ---------------------------------------------------------------------------
-- AI planner usage (rate limiting + cost tracking; written by the Edge Function)
-- ---------------------------------------------------------------------------

create table public.ai_generation_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ok', 'error', 'refused')),
  goal_length integer not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  error text,
  created_at timestamptz not null default now()
);
create index ai_generation_requests_user_time on public.ai_generation_requests (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Remote configuration (premium limits etc.), readable by everyone
-- ---------------------------------------------------------------------------

create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value) values
  ('plan_limits', '{
    "free":    {"aiGenerationsPerDay": 3,  "advancedTemplates": false, "advancedAnalytics": false, "extraThemes": false, "cloudSync": false, "maxStatsRangeDays": 30},
    "premium": {"aiGenerationsPerDay": 30, "advancedTemplates": true,  "advancedAnalytics": true,  "extraThemes": true,  "cloudSync": true,  "maxStatsRangeDays": 100000}
  }'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Sync triggers
-- ---------------------------------------------------------------------------

create trigger habit_lists_sync before insert or update on public.habit_lists
  for each row execute function public.tg_sync_row();
create trigger habits_sync before insert or update on public.habits
  for each row execute function public.tg_sync_row();
create trigger habit_schedules_sync before insert or update on public.habit_schedules
  for each row execute function public.tg_sync_row();
create trigger habit_reminders_sync before insert or update on public.habit_reminders
  for each row execute function public.tg_sync_row();
create trigger habit_completions_sync before insert or update on public.habit_completions
  for each row execute function public.tg_sync_row();
create trigger user_settings_sync before insert or update on public.user_settings
  for each row execute function public.tg_sync_row();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.habit_lists enable row level security;
alter table public.habits enable row level security;
alter table public.habit_schedules enable row level security;
alter table public.habit_reminders enable row level security;
alter table public.habit_completions enable row level security;
alter table public.user_settings enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.ai_generation_requests enable row level security;
alter table public.app_config enable row level security;

-- Profiles: own row only
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Lists: own rows only
create policy habit_lists_select on public.habit_lists for select to authenticated
  using (user_id = (select auth.uid()));
create policy habit_lists_insert on public.habit_lists for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy habit_lists_update on public.habit_lists for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy habit_lists_delete on public.habit_lists for delete to authenticated
  using (user_id = (select auth.uid()));

-- Habits: own rows, and the parent list must also be owned by the caller
create policy habits_select on public.habits for select to authenticated
  using (user_id = (select auth.uid()));
create policy habits_insert on public.habits for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habit_lists l where l.id = list_id and l.user_id = (select auth.uid()))
  );
create policy habits_update on public.habits for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habit_lists l where l.id = list_id and l.user_id = (select auth.uid()))
  );
create policy habits_delete on public.habits for delete to authenticated
  using (user_id = (select auth.uid()));

-- Children of habits: own rows, and the parent habit must be owned by the caller
create policy habit_schedules_select on public.habit_schedules for select to authenticated
  using (user_id = (select auth.uid()));
create policy habit_schedules_insert on public.habit_schedules for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))
  );
create policy habit_schedules_update on public.habit_schedules for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))
  );

create policy habit_reminders_select on public.habit_reminders for select to authenticated
  using (user_id = (select auth.uid()));
create policy habit_reminders_insert on public.habit_reminders for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))
  );
create policy habit_reminders_update on public.habit_reminders for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))
  );

create policy habit_completions_select on public.habit_completions for select to authenticated
  using (user_id = (select auth.uid()));
create policy habit_completions_insert on public.habit_completions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))
  );
create policy habit_completions_update on public.habit_completions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))
  );

-- Settings: own row only
create policy user_settings_select on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_settings_insert on public.user_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Entitlements and AI usage: read-only for the owner; writes only via service role
create policy subscription_entitlements_select on public.subscription_entitlements for select to authenticated
  using (user_id = (select auth.uid()));
create policy ai_generation_requests_select on public.ai_generation_requests for select to authenticated
  using (user_id = (select auth.uid()));

-- Remote config: public read, no client writes
create policy app_config_select on public.app_config for select to anon, authenticated
  using (true);
