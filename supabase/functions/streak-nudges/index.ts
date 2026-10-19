/**
 * Streak-at-risk nudges. Invoked hourly by pg_cron (see migration
 * 20261019120000_push_notifications.sql) with the `x-cron-secret` header.
 *
 * For every user with a registered device whose local time is within the hour
 * after their nudge time (default 20:00), and who hasn't been nudged today:
 *  1. claim (user, local date) in push_nudges — guarantees at most one nudge/day,
 *  2. evaluate their synced habits with the app's own domain rules,
 *  3. if any streak is at risk, send an Expo push to each of their devices,
 *  4. remove tokens Expo reports as no longer registered.
 *
 * Only users whose plan includes cloud sync are evaluated: without sync the
 * server's copy of their data could be stale and the nudge would be wrong.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

import {
  buildRecordsByHabit,
  findStreaksAtRisk,
  nudgeMessage,
  nudgeWindow,
  type Completion,
  type FirstDayOfWeek,
  type HabitContext,
  type ScheduleVersion,
} from '../_shared/domain.js';
import { adminClient, json, requireEnv } from '../_shared/http.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const DEFAULT_NUDGE_TIME = '20:00';

type Row = Record<string, unknown>;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null);
const toDate = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : null);

async function loadContexts(admin: SupabaseClient, userId: string): Promise<{ contexts: HabitContext[]; completions: Completion[] }> {
  const [lists, habits, schedules, completions] = await Promise.all([
    admin.from('habit_lists').select('*').eq('user_id', userId),
    admin.from('habits').select('*').eq('user_id', userId).is('deleted_at', null),
    admin.from('habit_schedules').select('*').eq('user_id', userId).is('deleted_at', null).order('effective_from'),
    admin.from('habit_completions').select('habit_id,date,status,value,note,created_at,updated_at,deleted_at').eq('user_id', userId).is('deleted_at', null),
  ]);
  for (const r of [lists, habits, schedules, completions]) if (r.error) throw new Error(r.error.message);

  const listById = new Map((lists.data as Row[]).map((l) => [str(l.id), l]));
  const versions = new Map<string, ScheduleVersion[]>();
  for (const s of schedules.data as Row[]) {
    const v: ScheduleVersion = {
      id: str(s.id),
      habitId: str(s.habit_id),
      effectiveFrom: toDate(s.effective_from)!,
      rule: s.rule as ScheduleVersion['rule'],
      createdAt: str(s.created_at),
      updatedAt: str(s.updated_at),
    };
    versions.set(v.habitId, [...(versions.get(v.habitId) ?? []), v]);
  }

  const contexts: HabitContext[] = [];
  for (const h of habits.data as Row[]) {
    const id = str(h.id);
    const habitVersions = versions.get(id);
    if (!habitVersions?.length) continue;
    const list = listById.get(str(h.list_id));
    contexts.push({
      habit: {
        id,
        listId: str(h.list_id),
        name: str(h.name),
        description: str(h.description),
        icon: str(h.icon),
        color: str(h.color),
        category: str(h.category) as HabitContext['habit']['category'],
        timeOfDay: str(h.time_of_day) as HabitContext['habit']['timeOfDay'],
        kind: str(h.kind) as HabitContext['habit']['kind'],
        target: h.target == null ? null : Number(h.target),
        unit: str(h.unit),
        targetDirection: str(h.target_direction) as HabitContext['habit']['targetDirection'],
        startDate: toDate(h.start_date)!,
        endDate: toDate(h.end_date),
        sortOrder: Number(h.sort_order ?? 0),
        archivedOn: toDate(h.archived_on),
        inactiveRanges: Array.isArray(h.inactive_ranges) ? (h.inactive_ranges as HabitContext['habit']['inactiveRanges']) : [],
        createdAt: str(h.created_at),
        updatedAt: str(h.updated_at),
        deletedAt: null,
      },
      versions: habitVersions,
      list: list
        ? {
            archivedOn: toDate(list.archived_on),
            inactiveRanges: Array.isArray(list.inactive_ranges) ? (list.inactive_ranges as HabitContext['habit']['inactiveRanges']) : [],
            deletedAt: strOrNull(list.deleted_at),
          }
        : null,
    });
  }

  const comps: Completion[] = (completions.data as Row[]).map((c) => ({
    habitId: str(c.habit_id),
    date: toDate(c.date)!,
    status: str(c.status) as Completion['status'],
    value: c.value == null ? null : Number(c.value),
    note: str(c.note),
    createdAt: str(c.created_at),
    updatedAt: str(c.updated_at),
    deletedAt: null,
  }));
  return { contexts, completions: comps };
}

async function sendExpoPush(messages: Row[]): Promise<{ to: string; error?: string }[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN'); // only if "enhanced push security" is enabled
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
  if (!res.ok) throw new Error(`Expo push failed: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
  return (body.data ?? []).map((t, i) => ({
    to: String(messages[i].to),
    error: t.status === 'error' ? (t.details?.error ?? 'unknown') : undefined,
  }));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!timingSafeEqual(req.headers.get('x-cron-secret') ?? '', requireEnv('CRON_SECRET'))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = adminClient();
  const now = new Date();
  const stats = { users: 0, inWindow: 0, sent: 0, none: 0, errors: 0, tokensRemoved: 0 };

  const { data: tokenRows, error: tokenError } = await admin.from('push_tokens').select('token,user_id');
  if (tokenError) return json({ error: 'server_error' }, 500);
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows ?? []) tokensByUser.set(t.user_id, [...(tokensByUser.get(t.user_id) ?? []), t.token]);
  const userIds = [...tokensByUser.keys()];
  stats.users = userIds.length;
  if (userIds.length === 0) return json(stats);

  const [{ data: settingsRows }, { data: cfg }, { data: ents }] = await Promise.all([
    admin.from('user_settings').select('user_id,settings,time_zone').in('user_id', userIds),
    admin.from('app_config').select('value').eq('key', 'plan_limits').maybeSingle(),
    admin.from('subscription_entitlements').select('user_id,is_active,expires_at').in('user_id', userIds).eq('is_active', true),
  ]);
  const freeSync = (cfg?.value as { free?: { cloudSync?: boolean } } | undefined)?.free?.cloudSync ?? false;
  const premium = new Set(
    (ents ?? []).filter((e) => !e.expires_at || new Date(e.expires_at) > now).map((e) => e.user_id as string),
  );

  for (const row of settingsRows ?? []) {
    const userId = row.user_id as string;
    const settings = (row.settings ?? {}) as { streakNudges?: boolean; streakNudgeTime?: string; firstDayOfWeek?: FirstDayOfWeek };
    if (settings.streakNudges === false) continue;
    if (!freeSync && !premium.has(userId)) continue;

    const nudgeTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.streakNudgeTime ?? '') ? settings.streakNudgeTime! : DEFAULT_NUDGE_TIME;
    const { inWindow, localDate } = nudgeWindow(now, (row.time_zone as string) || 'UTC', nudgeTime);
    if (!inWindow) continue;
    stats.inWindow++;

    // Claim today's slot first; a concurrent or repeated run gets a conflict and skips.
    const { error: claimError } = await admin.from('push_nudges').insert({ user_id: userId, local_date: localDate });
    if (claimError) continue;

    try {
      const { contexts, completions } = await loadContexts(admin, userId);
      const atRisk = findStreaksAtRisk(contexts, buildRecordsByHabit(completions), localDate, settings.firstDayOfWeek ?? 1);
      if (atRisk.length === 0) {
        await admin.from('push_nudges').update({ status: 'none' }).match({ user_id: userId, local_date: localDate });
        stats.none++;
        continue;
      }
      const { title, body } = nudgeMessage(atRisk);
      const tickets = await sendExpoPush(
        tokensByUser.get(userId)!.map((to) => ({
          to,
          title,
          body,
          sound: 'default',
          channelId: 'habit-reminders',
          data: { type: 'streak', date: localDate },
        })),
      );
      for (const t of tickets) {
        if (t.error === 'DeviceNotRegistered') {
          await admin.from('push_tokens').delete().eq('token', t.to);
          stats.tokensRemoved++;
        }
      }
      await admin
        .from('push_nudges')
        .update({ status: 'sent', habit_count: atRisk.length })
        .match({ user_id: userId, local_date: localDate });
      stats.sent++;
    } catch (error) {
      console.error('streak-nudges: user failed', userId, error instanceof Error ? error.message : error);
      await admin.from('push_nudges').update({ status: 'error' }).match({ user_id: userId, local_date: localDate });
      stats.errors++;
    }
  }

  return json(stats);
});
