/**
 * Reminder planning (pure).
 *
 * Strategy: instead of OS-level repeating triggers (which cannot be suppressed
 * for a single day and cannot express monthly/interval/quota schedules), we
 * schedule *one-shot* notifications for the next `horizonDays`, capped to a
 * budget (iOS keeps at most 64 pending local notifications per app).
 *
 * Every planned notification has a deterministic identifier derived from the
 * reminder, date, time and content. Syncing is therefore a diff: cancel
 * identifiers that are no longer planned, schedule the missing ones. Running it
 * twice is a no-op, which makes it safe to call on launch, on resume and after
 * every data change.
 */
import { addDays, toLocalDateTime, weekdayOf } from './dates';
import { isActiveOn, isEligibleOn, isQuotaRule, ruleOn } from './schedule';
import { daySummary, type RecordsByHabit } from './stats';
import type { FirstDayOfWeek, HabitContext, LocalDate, Reminder } from './types';

export const NOTIFICATION_PREFIX = 'hf_';
export const DEFAULT_HORIZON_DAYS = 14;
/** Leave headroom below iOS's 64 pending-notification limit for test/other notifications. */
export const DEFAULT_BUDGET = 60;

export interface PlannedNotification {
  identifier: string;
  habitId: string;
  reminderId: string;
  date: LocalDate;
  fireAt: Date;
  title: string;
  body: string;
}

/** Small, stable string hash (djb2) used to version identifiers by content. */
export function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function notificationId(
  reminderId: string,
  date: LocalDate,
  time: string,
  title: string,
  body: string,
): string {
  return `${NOTIFICATION_PREFIX}${reminderId}_${date.replaceAll('-', '')}_${time.replace(':', '')}_${hashString(title + '|' + body)}`;
}

export interface PlanInput {
  contexts: HabitContext[];
  reminders: Reminder[];
  records: RecordsByHabit;
  now: Date;
  today: LocalDate;
  firstDayOfWeek: FirstDayOfWeek;
  horizonDays?: number;
  budget?: number;
}

export function planNotifications(input: PlanInput): PlannedNotification[] {
  const {
    contexts,
    reminders,
    records,
    now,
    today,
    firstDayOfWeek,
    horizonDays = DEFAULT_HORIZON_DAYS,
    budget = DEFAULT_BUDGET,
  } = input;
  const byId = new Map(contexts.map((c) => [c.habit.id, c]));
  const out: PlannedNotification[] = [];

  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(today, i);
    const weekday = weekdayOf(date);

    for (const reminder of reminders) {
      if (!reminder.enabled || reminder.deletedAt) continue;
      const ctx = byId.get(reminder.habitId);
      if (!ctx) continue;
      if (!isActiveOn(ctx, date) || !isEligibleOn(ctx, date)) continue;
      if (reminder.weekdays && !reminder.weekdays.includes(weekday)) continue;

      const record = records.get(ctx.habit.id)?.get(date);
      // Never remind about something already completed or intentionally skipped.
      if (record && (record.status === 'done' || record.status === 'skipped')) continue;

      // Quota habits: don't remind once this period's target has been met.
      if (isQuotaRule(ruleOn(ctx, date))) {
        const item = daySummary([ctx], records, date, today, firstDayOfWeek).items[0];
        if (item?.quota?.met) continue;
      }

      const fireAt = toLocalDateTime(date, reminder.time);
      if (fireAt.getTime() <= now.getTime()) continue;

      const { habit } = ctx;
      const title = habit.name.trim();
      const body = habit.description?.trim()
        ? habit.description.trim()
        : habit.kind === 'numeric' && habit.target != null
          ? `Goal: ${habit.targetDirection === 'atMost' ? '≤ ' : ''}${habit.target} ${habit.unit}`.trim()
          : 'A small step today keeps the streak going.';

      out.push({
        identifier: notificationId(reminder.id, date, reminder.time, title, body),
        habitId: habit.id,
        reminderId: reminder.id,
        date,
        fireAt,
        title,
        body,
      });
    }
  }

  out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.identifier.localeCompare(b.identifier));
  return out.slice(0, budget);
}

export interface NotificationDiff {
  toCancel: string[];
  toSchedule: PlannedNotification[];
}

/** Diffs the desired plan against identifiers currently scheduled with the OS. */
export function diffNotifications(
  planned: PlannedNotification[],
  scheduledIds: string[],
): NotificationDiff {
  const ours = scheduledIds.filter((id) => id.startsWith(NOTIFICATION_PREFIX));
  const desired = new Set(planned.map((p) => p.identifier));
  const existing = new Set(ours);
  return {
    toCancel: ours.filter((id) => !desired.has(id)),
    toSchedule: planned.filter((p) => !existing.has(p.identifier)),
  };
}
