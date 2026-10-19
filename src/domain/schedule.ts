/**
 * Schedule evaluation.
 *
 * Rules:
 * - A habit is *active* on a date when it is not deleted, the date is within
 *   [startDate, endDate], and neither the habit nor its list was archived on that
 *   date (archived dates are tracked as `archivedOn` + historical `inactiveRanges`).
 * - The schedule rule for a date is the latest version whose `effectiveFrom` is on
 *   or before the date. Dates before the first version use the first version.
 * - Day rules (`daily`, `weekdays`, `monthDays`, `interval`) mark individual days as
 *   scheduled. Quota rules (`timesPerWeek`, `timesPerMonth`) make every active day
 *   *eligible*; success is judged per period (see stats.ts).
 */
import {
  addDays,
  diffDays,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  parseLocalDate,
  startOfMonth,
  startOfWeek,
  weekdayOf,
} from './dates';
import type {
  FirstDayOfWeek,
  HabitContext,
  InactiveRange,
  LocalDate,
  QuotaRule,
  ScheduleRule,
  ScheduleVersion,
} from './types';

export function isQuotaRule(rule: ScheduleRule): rule is QuotaRule {
  return rule.type === 'timesPerWeek' || rule.type === 'timesPerMonth';
}

function inRanges(date: LocalDate, ranges: InactiveRange[]): boolean {
  return ranges.some((r) => date >= r.from && date <= r.to);
}

export function isActiveOn(ctx: HabitContext, date: LocalDate): boolean {
  const { habit, list } = ctx;
  if (habit.deletedAt) return false;
  if (date < habit.startDate) return false;
  if (habit.endDate && date > habit.endDate) return false;
  if (habit.archivedOn && date >= habit.archivedOn) return false;
  if (inRanges(date, habit.inactiveRanges)) return false;
  if (list) {
    if (list.deletedAt) return false;
    if (list.archivedOn && date >= list.archivedOn) return false;
    if (inRanges(date, list.inactiveRanges)) return false;
  }
  return true;
}

/** The schedule version in effect on `date`, plus the anchor date used by interval rules. */
export function versionOn(
  ctx: HabitContext,
  date: LocalDate,
): { version: ScheduleVersion; anchor: LocalDate } {
  const { versions, habit } = ctx;
  if (versions.length === 0) throw new Error(`Habit ${habit.id} has no schedule`);
  let index = 0;
  for (let i = 0; i < versions.length; i++) {
    if (versions[i].effectiveFrom <= date) index = i;
    else break;
  }
  const version = versions[index];
  const anchor = index === 0 ? habit.startDate : version.effectiveFrom;
  return { version, anchor };
}

export function ruleOn(ctx: HabitContext, date: LocalDate): ScheduleRule {
  return versionOn(ctx, date).version.rule;
}

/** Whether a day rule selects `date`. Quota rules select every day. */
export function ruleMatches(rule: ScheduleRule, anchor: LocalDate, date: LocalDate): boolean {
  switch (rule.type) {
    case 'daily':
    case 'timesPerWeek':
    case 'timesPerMonth':
      return true;
    case 'weekdays':
      return rule.days.includes(weekdayOf(date));
    case 'monthDays': {
      const { year, month, day } = parseLocalDate(date);
      const last = daysInMonth(year, month);
      return rule.days.some((d) => Math.min(d, last) === day);
    }
    case 'interval': {
      const every = Math.max(1, Math.floor(rule.every));
      const diff = diffDays(anchor, date);
      return diff >= 0 && diff % every === 0;
    }
  }
}

/** Active and selected by the rule in effect (for quota rules: active). */
export function isEligibleOn(ctx: HabitContext, date: LocalDate): boolean {
  if (!isActiveOn(ctx, date)) return false;
  const { version, anchor } = versionOn(ctx, date);
  return ruleMatches(version.rule, anchor, date);
}

export function periodOf(
  rule: QuotaRule,
  date: LocalDate,
  firstDayOfWeek: FirstDayOfWeek,
): { start: LocalDate; end: LocalDate } {
  return rule.type === 'timesPerWeek'
    ? { start: startOfWeek(date, firstDayOfWeek), end: endOfWeek(date, firstDayOfWeek) }
    : { start: startOfMonth(date), end: endOfMonth(date) };
}

/** Next `count` eligible dates starting at `from` (inclusive), scanning at most `maxDays`. */
export function upcomingEligibleDates(
  ctx: HabitContext,
  from: LocalDate,
  count: number,
  maxDays = 400,
): LocalDate[] {
  const out: LocalDate[] = [];
  for (let i = 0; i < maxDays && out.length < count; i++) {
    const d = addDays(from, i);
    if (ctx.habit.endDate && d > ctx.habit.endDate) break;
    if (isEligibleOn(ctx, d)) out.push(d);
  }
  return out;
}

export function describeRule(rule: ScheduleRule, weekdayName: (d: number) => string): string {
  switch (rule.type) {
    case 'daily':
      return 'Every day';
    case 'weekdays': {
      const days = [...rule.days].sort();
      if (days.length === 7) return 'Every day';
      if (days.join() === '1,2,3,4,5') return 'Weekdays';
      if (days.join() === '0,6') return 'Weekends';
      return days.map(weekdayName).join(', ');
    }
    case 'monthDays': {
      const days = [...rule.days].sort((a, b) => a - b);
      return `Monthly on day ${days.join(', ')}`;
    }
    case 'interval':
      return rule.every === 1 ? 'Every day' : `Every ${rule.every} days`;
    case 'timesPerWeek':
      return `${rule.count}× per week`;
    case 'timesPerMonth':
      return `${rule.count}× per month`;
  }
}

/** Basic structural validation for a rule coming from user input, storage or the network. */
export function isValidRule(rule: ScheduleRule): boolean {
  switch (rule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return rule.days.length > 0 && rule.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    case 'monthDays':
      return rule.days.length > 0 && rule.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 31);
    case 'interval':
      return Number.isInteger(rule.every) && rule.every >= 1 && rule.every <= 365;
    case 'timesPerWeek':
      return Number.isInteger(rule.count) && rule.count >= 1 && rule.count <= 7;
    case 'timesPerMonth':
      return Number.isInteger(rule.count) && rule.count >= 1 && rule.count <= 31;
  }
}

export function rulesEqual(a: ScheduleRule, b: ScheduleRule): boolean {
  const norm = (r: ScheduleRule) => {
    if (r.type === 'weekdays' || r.type === 'monthDays') {
      return JSON.stringify({ ...r, days: [...r.days].sort((x, y) => x - y) });
    }
    return JSON.stringify(r);
  };
  return norm(a) === norm(b);
}
