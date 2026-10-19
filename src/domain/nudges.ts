/**
 * Streak-at-risk nudges (pure). Used by the `streak-nudges` Edge Function (via
 * the generated bundle in supabase/functions/_shared/domain.js) and covered by
 * unit tests here, so server and app always agree on what "at risk" means.
 *
 * A habit's streak is at risk today when:
 *  - it is due today and not yet done, skipped or marked missed, and
 *  - it has a running streak worth protecting (≥ 2 days, or ≥ 1 week/month), and
 *  - for N×-per-week/month habits: today is the last day of the period and the
 *    target is still unmet (earlier in the period there is still time).
 */
import { parseTime } from './dates';
import { isQuotaRule, periodOf, ruleOn } from './schedule';
import { daySummary, evaluateHabit, type RecordsByHabit, type StreakUnit } from './stats';
import type { FirstDayOfWeek, HabitContext, LocalDate } from './types';

export interface AtRiskHabit {
  habitId: string;
  name: string;
  streak: number;
  unit: StreakUnit;
}

const EMPTY = new Map();

export function findStreaksAtRisk(
  contexts: HabitContext[],
  records: RecordsByHabit,
  today: LocalDate,
  firstDayOfWeek: FirstDayOfWeek,
  minDailyStreak = 2,
): AtRiskHabit[] {
  const summary = daySummary(contexts, records, today, today, firstDayOfWeek);
  const out: AtRiskHabit[] = [];
  for (const item of summary.items) {
    if (!item.due || item.done) continue;
    const status = item.record?.status;
    if (status === 'skipped' || status === 'missed') continue;

    const rule = ruleOn(item.ctx, today);
    if (isQuotaRule(rule)) {
      if (item.quota?.met) continue;
      if (periodOf(rule, today, firstDayOfWeek).end !== today) continue;
    }

    const stats = evaluateHabit(item.ctx, records.get(item.ctx.habit.id) ?? EMPTY, {
      from: today,
      to: today,
      today,
      firstDayOfWeek,
    });
    const min = stats.streakUnit === 'day' ? minDailyStreak : 1;
    if (stats.currentStreak >= min) {
      out.push({ habitId: item.ctx.habit.id, name: item.ctx.habit.name, streak: stats.currentStreak, unit: stats.streakUnit });
    }
  }
  return out.sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name));
}

/**
 * Whether `now` falls in the hour-long window starting at the user's nudge
 * time, in their IANA time zone, and the local date there.
 */
export function nudgeWindow(
  now: Date,
  timeZone: string,
  nudgeTime: string,
): { inWindow: boolean; localDate: LocalDate } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return nudgeWindow(now, 'UTC', nudgeTime); // unknown zone
  }
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const localDate = `${String(get('year')).padStart(4, '0')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`;
  const minutes = get('hour') * 60 + get('minute');
  const [h, m] = parseTime(nudgeTime);
  const start = h * 60 + m;
  return { inWindow: minutes >= start && minutes < start + 60, localDate };
}

export function nudgeMessage(atRisk: AtRiskHabit[]): { title: string; body: string } {
  const top = atRisk[0];
  const unit = top.unit === 'day' ? 'day' : top.unit;
  const others = atRisk.length - 1;
  return {
    title: `Keep your ${top.streak}-${unit} streak going`,
    body:
      others > 0
        ? `“${top.name}” and ${others} other habit${others === 1 ? '' : 's'} still need you today.`
        : `“${top.name}” is still open for today — a few minutes keeps the streak alive.`,
  };
}
