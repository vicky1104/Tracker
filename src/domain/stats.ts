/**
 * Progress and statistics.
 *
 * Calculation rules (also documented in README → "Statistics rules"):
 *
 * Day-rule habits (daily / weekdays / monthDays / interval)
 *  - Only *eligible* days count. Unscheduled and inactive (archived, before start,
 *    after end) days are excluded from every rate and never affect streaks.
 *  - `done` → success. `skipped` → excluded (neither success nor failure).
 *  - `missed`, `partial`, or no record on a past eligible day → failure.
 *  - Today without a record (or `partial`) is *pending*: excluded until resolved.
 *  - Streak: consecutive successes; skips are neutral; a failure resets to 0.
 *
 * Quota habits (N× per week / month)
 *  - Judged per period. Target = min(N, eligible days in period − skipped days).
 *  - A past period with done ≥ target is a success, otherwise a failure. The
 *    current period counts as soon as it is met; until then it is pending.
 *  - Streak unit is weeks or months.
 *
 * Daily completion % (dashboard, calendar, heatmap)
 *  - Due = eligible day-rule habits + quota habits whose period target is not yet
 *    met by other days (or that were done on this day). Skipped items are not due.
 *  - % = done / due. For today, pending items count towards "due" on the dashboard
 *    (so the user sees what is left) but are excluded from historical rates.
 *
 * Deleted habits are excluded entirely. Archived habits keep their history up to
 * the archive date.
 */
import { addDays, maxDate, minDate, weekdayOf } from './dates';
import { isActiveOn, isEligibleOn, isQuotaRule, periodOf, ruleOn } from './schedule';
import type {
  Completion,
  CompletionStatus,
  FirstDayOfWeek,
  Habit,
  HabitContext,
  LocalDate,
  QuotaRule,
  Weekday,
} from './types';

export type RecordMap = Map<LocalDate, Completion>;
export type RecordsByHabit = Map<string, RecordMap>;

export function buildRecordsByHabit(records: Completion[]): RecordsByHabit {
  const out: RecordsByHabit = new Map();
  for (const r of records) {
    if (r.deletedAt) continue;
    let m = out.get(r.habitId);
    if (!m) {
      m = new Map();
      out.set(r.habitId, m);
    }
    m.set(r.date, r);
  }
  return out;
}

const EMPTY: RecordMap = new Map();

/** Status a numeric value implies for a habit. `null` means "no record" (clear it). */
export function statusForValue(
  habit: Pick<Habit, 'kind' | 'target' | 'targetDirection'>,
  value: number,
): CompletionStatus | null {
  if (!Number.isFinite(value) || value < 0) return null;
  if (habit.target == null) return value > 0 ? 'done' : null;
  if (habit.targetDirection === 'atMost') return value <= habit.target ? 'done' : 'missed';
  if (value >= habit.target) return 'done';
  return value > 0 ? 'partial' : null;
}

// ---------------------------------------------------------------------------
// Per-day state
// ---------------------------------------------------------------------------

export type DayState =
  | 'inactive'
  | 'unscheduled'
  | 'done'
  | 'partial'
  | 'skipped'
  | 'missed'
  | 'pending'
  | 'future';

export function habitDayState(
  ctx: HabitContext,
  date: LocalDate,
  record: Completion | undefined,
  today: LocalDate,
): DayState {
  if (!isActiveOn(ctx, date)) return 'inactive';
  const eligible = isEligibleOn(ctx, date);
  if (record && !record.deletedAt) return record.status;
  if (!eligible) return 'unscheduled';
  if (date > today) return 'future';
  if (date === today) return 'pending';
  // Quota habits: a past day without a record is not a failure by itself.
  return isQuotaRule(ruleOn(ctx, date)) ? 'unscheduled' : 'missed';
}

// ---------------------------------------------------------------------------
// Quota helpers
// ---------------------------------------------------------------------------

interface QuotaProgress {
  rule: QuotaRule;
  start: LocalDate;
  end: LocalDate;
  done: number;
  target: number;
  met: boolean;
}

function quotaProgress(
  ctx: HabitContext,
  records: RecordMap,
  date: LocalDate,
  firstDayOfWeek: FirstDayOfWeek,
  opts: { excludeDate?: LocalDate; rangeFrom?: LocalDate; countUntil?: LocalDate } = {},
): QuotaProgress | null {
  const rule = ruleOn(ctx, date);
  if (!isQuotaRule(rule)) return null;
  const { start, end } = periodOf(rule, date, firstDayOfWeek);
  const from = opts.rangeFrom ? maxDate(start, opts.rangeFrom) : start;
  let eligible = 0;
  let skipped = 0;
  let done = 0;
  for (let d = from; d <= end; d = addDays(d, 1)) {
    if (!isActiveOn(ctx, d) || !isQuotaRule(ruleOn(ctx, d))) continue;
    eligible++;
    if (d === opts.excludeDate) continue;
    const r = records.get(d);
    if (!r) continue;
    if (r.status === 'skipped') skipped++;
    else if (r.status === 'done' && (!opts.countUntil || d <= opts.countUntil)) done++;
  }
  const target = Math.max(0, Math.min(rule.count, eligible - skipped));
  return { rule, start, end, done, target, met: target > 0 && done >= target };
}

// ---------------------------------------------------------------------------
// Daily summary (dashboard / calendar)
// ---------------------------------------------------------------------------

export interface DayItem {
  ctx: HabitContext;
  record: Completion | null;
  state: DayState;
  /** Counts towards the day's denominator. */
  due: boolean;
  /** Counts towards the day's numerator. */
  done: boolean;
  /** Present for quota habits. */
  quota?: { done: number; target: number; met: boolean; period: 'week' | 'month' };
}

export interface DaySummary {
  date: LocalDate;
  items: DayItem[];
  due: number;
  done: number;
  skipped: number;
  /** Due items that are still pending (only possible for today). */
  pending: number;
  /** 0–1, or `null` when nothing is due. */
  percent: number | null;
}

export function daySummary(
  ctxs: HabitContext[],
  records: RecordsByHabit,
  date: LocalDate,
  today: LocalDate,
  firstDayOfWeek: FirstDayOfWeek,
): DaySummary {
  const items: DayItem[] = [];
  let due = 0;
  let done = 0;
  let skipped = 0;
  let pending = 0;

  for (const ctx of ctxs) {
    if (!isActiveOn(ctx, date)) continue;
    const habitRecords = records.get(ctx.habit.id) ?? EMPTY;
    const record = habitRecords.get(date) ?? null;
    const state = habitDayState(ctx, date, record ?? undefined, today);
    const rule = ruleOn(ctx, date);

    if (isQuotaRule(rule)) {
      const others = quotaProgress(ctx, habitRecords, date, firstDayOfWeek, { excludeDate: date });
      const target = others?.target ?? 0;
      const doneHere = record?.status === 'done';
      const isSkipped = record?.status === 'skipped';
      const itemDue = doneHere || (!isSkipped && (others?.done ?? 0) < target);
      const totalDone = (others?.done ?? 0) + (doneHere ? 1 : 0);
      items.push({
        ctx,
        record,
        state,
        due: itemDue,
        done: doneHere,
        quota: {
          done: totalDone,
          target,
          met: target > 0 && totalDone >= target,
          period: rule.type === 'timesPerWeek' ? 'week' : 'month',
        },
      });
      if (itemDue) due++;
      if (doneHere) done++;
      if (isSkipped) skipped++;
      if (itemDue && !doneHere && date === today && record?.status !== 'missed') pending++;
      continue;
    }

    const eligible = isEligibleOn(ctx, date);
    if (!eligible && !record) continue; // not scheduled and nothing logged: hide
    const isDone = record?.status === 'done';
    const isSkipped = record?.status === 'skipped';
    const itemDue = eligible && !isSkipped;
    items.push({ ctx, record, state, due: itemDue, done: eligible && isDone });
    if (itemDue) due++;
    if (eligible && isDone) done++;
    if (eligible && isSkipped) skipped++;
    if (itemDue && !isDone && date === today && record?.status !== 'missed') pending++;
  }

  return { date, items, due, done, skipped, pending, percent: due > 0 ? done / due : null };
}

export interface DailyPoint {
  date: LocalDate;
  due: number;
  done: number;
  percent: number | null;
}

/**
 * Daily completion for each date in [from, to]. For today, pending items are
 * excluded so an in-progress day does not drag historical rates down; future
 * dates yield `percent: null`.
 */
export function dailySeries(
  ctxs: HabitContext[],
  records: RecordsByHabit,
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
  firstDayOfWeek: FirstDayOfWeek,
): DailyPoint[] {
  const out: DailyPoint[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d > today) {
      out.push({ date: d, due: 0, done: 0, percent: null });
      continue;
    }
    const s = daySummary(ctxs, records, d, today, firstDayOfWeek);
    const due = s.due - (d === today ? s.pending : 0);
    out.push({ date: d, due, done: s.done, percent: due > 0 ? s.done / due : null });
  }
  return out;
}

export function aggregateRate(points: DailyPoint[]): {
  rate: number | null;
  done: number;
  due: number;
} {
  let due = 0;
  let done = 0;
  for (const p of points) {
    due += p.due;
    done += p.done;
  }
  return { rate: due > 0 ? done / due : null, done, due };
}

// ---------------------------------------------------------------------------
// Per-habit statistics
// ---------------------------------------------------------------------------

export type StreakUnit = 'day' | 'week' | 'month';

export interface HabitStats {
  currentStreak: number;
  bestStreak: number;
  streakUnit: StreakUnit;
  /** 0–1 over the requested range, or `null` if there was nothing to evaluate. */
  rate: number | null;
  successes: number;
  opportunities: number;
  skipped: number;
  totalDone: number;
  /** Sum of logged values within the range (numeric habits). */
  totalValue: number;
}

type Outcome = 'success' | 'failure' | 'neutral';

/**
 * Walks [from, to] and yields one outcome per day-rule day or per quota period
 * (emitted at the period's last day in range, or when it is first met).
 */
function outcomes(
  ctx: HabitContext,
  records: RecordMap,
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
  firstDayOfWeek: FirstDayOfWeek,
): { kind: 'day' | 'period'; outcome: Outcome; weight: number; credit: number }[] {
  const out: { kind: 'day' | 'period'; outcome: Outcome; weight: number; credit: number }[] = [];
  const seenPeriods = new Set<string>();
  const last = minDate(to, today);

  for (let d = from; d <= last; d = addDays(d, 1)) {
    if (!isActiveOn(ctx, d)) continue;
    const rule = ruleOn(ctx, d);

    if (isQuotaRule(rule)) {
      const { start } = periodOf(rule, d, firstDayOfWeek);
      const key = `${rule.type}:${start}`;
      if (seenPeriods.has(key)) continue;
      seenPeriods.add(key);
      const p = quotaProgress(ctx, records, d, firstDayOfWeek, { rangeFrom: from, countUntil: last });
      if (!p || p.target === 0) {
        out.push({ kind: 'period', outcome: 'neutral', weight: 0, credit: 0 });
      } else if (p.met) {
        out.push({ kind: 'period', outcome: 'success', weight: p.target, credit: p.target });
      } else if (p.end < today && p.end <= to) {
        out.push({ kind: 'period', outcome: 'failure', weight: p.target, credit: p.done });
      } else {
        out.push({ kind: 'period', outcome: 'neutral', weight: 0, credit: 0 }); // pending
      }
      continue;
    }

    if (!isEligibleOn(ctx, d)) continue;
    const status = records.get(d)?.status;
    if (status === 'done') out.push({ kind: 'day', outcome: 'success', weight: 1, credit: 1 });
    else if (status === 'skipped') out.push({ kind: 'day', outcome: 'neutral', weight: 0, credit: 0 });
    else if (d === today && status !== 'missed')
      out.push({ kind: 'day', outcome: 'neutral', weight: 0, credit: 0 }); // pending
    else out.push({ kind: 'day', outcome: 'failure', weight: 1, credit: 0 });
  }
  return out;
}

export function evaluateHabit(
  ctx: HabitContext,
  records: RecordMap,
  opts: { from: LocalDate; to: LocalDate; today: LocalDate; firstDayOfWeek: FirstDayOfWeek },
): HabitStats {
  const { today, firstDayOfWeek } = opts;
  const habitStart = ctx.habit.startDate;

  // Streaks always consider the full history up to today.
  let current = 0;
  let best = 0;
  for (const o of outcomes(ctx, records, habitStart, today, today, firstDayOfWeek)) {
    if (o.outcome === 'success') {
      current++;
      best = Math.max(best, current);
    } else if (o.outcome === 'failure') {
      current = 0;
    }
  }

  // Rate over the requested range.
  const from = maxDate(opts.from, habitStart);
  let successes = 0;
  let opportunities = 0;
  for (const o of outcomes(ctx, records, from, opts.to, today, firstDayOfWeek)) {
    successes += o.credit;
    opportunities += o.weight;
  }

  let skipped = 0;
  let totalDone = 0;
  let totalValue = 0;
  for (const r of records.values()) {
    if (r.deletedAt || r.date < from || r.date > opts.to || !isActiveOn(ctx, r.date)) continue;
    if (r.status === 'skipped') skipped++;
    if (r.status === 'done') totalDone++;
    if (r.value != null) totalValue += r.value;
  }

  const rule = ruleOn(ctx, minDate(today, ctx.habit.endDate ?? today));
  const streakUnit: StreakUnit =
    rule.type === 'timesPerWeek' ? 'week' : rule.type === 'timesPerMonth' ? 'month' : 'day';

  return {
    currentStreak: current,
    bestStreak: best,
    streakUnit,
    rate: opportunities > 0 ? successes / opportunities : null,
    successes,
    opportunities,
    skipped,
    totalDone,
    totalValue,
  };
}

/** Completion rate per weekday over a series (premium "best days" insight). */
export function weekdayBreakdown(points: DailyPoint[]): { weekday: Weekday; rate: number | null }[] {
  const acc = Array.from({ length: 7 }, () => ({ due: 0, done: 0 }));
  for (const p of points) {
    const w = weekdayOf(p.date);
    acc[w].due += p.due;
    acc[w].done += p.done;
  }
  return acc.map((a, i) => ({ weekday: i as Weekday, rate: a.due > 0 ? a.done / a.due : null }));
}

/** Groups a daily series into buckets of `size` days (e.g. weekly trend). */
export function bucketSeries(points: DailyPoint[], size: number): DailyPoint[] {
  const out: DailyPoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    const { rate, done, due } = aggregateRate(slice);
    out.push({ date: slice[0].date, done, due, percent: rate });
  }
  return out;
}
