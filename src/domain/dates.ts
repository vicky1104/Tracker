/**
 * Local-date utilities.
 *
 * Habit occurrences are identified by a `LocalDate` string (`YYYY-MM-DD`) that
 * represents a calendar day in the user's time zone. All arithmetic below is done
 * on calendar components via `Date.UTC`, so daylight-saving transitions can never
 * shift a date or make a "day" 23/25 hours long.
 */
import type { FirstDayOfWeek, LocalDate, Weekday } from './types';

const DAY_MS = 86_400_000;
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function fromParts(year: number, month: number, day: number): LocalDate {
  // Normalise overflow (e.g. month 13, day 0) through Date.UTC.
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const m = LOCAL_DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid local date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function isValidLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !LOCAL_DATE_RE.test(value)) return false;
  const { year, month, day } = parseLocalDate(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function toUtcMs(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return Date.UTC(year, month - 1, day);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  return fromParts(year, month, day + days);
}

/** Number of calendar days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

export function weekdayOf(date: LocalDate): Weekday {
  return new Date(toUtcMs(date)).getUTCDay() as Weekday;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function startOfWeek(date: LocalDate, firstDayOfWeek: FirstDayOfWeek): LocalDate {
  const offset = (weekdayOf(date) - firstDayOfWeek + 7) % 7;
  return addDays(date, -offset);
}

export function endOfWeek(date: LocalDate, firstDayOfWeek: FirstDayOfWeek): LocalDate {
  return addDays(startOfWeek(date, firstDayOfWeek), 6);
}

export function startOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(date);
  return fromParts(year, month, 1);
}

export function endOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(date);
  return fromParts(year, month, daysInMonth(year, month));
}

/** Adds months, clamping the day to the target month's length (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth() + 1;
  return fromParts(y, m, Math.min(day, daysInMonth(y, m)));
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a <= b ? a : b;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a >= b ? a : b;
}

/** Inclusive list of dates from `from` to `to`. Empty if `from > to`. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  const n = diffDays(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

/** Weekdays ordered starting at the user's first day of the week. */
export function orderedWeekdays(firstDayOfWeek: FirstDayOfWeek): Weekday[] {
  return Array.from({ length: 7 }, (_, i) => ((firstDayOfWeek + i) % 7) as Weekday);
}

/**
 * The local date of an instant. With `timeZone` (IANA name) the date is computed
 * for that zone; otherwise the device's zone is used.
 */
export function localDateOf(instant: Date, timeZone?: string): LocalDate {
  if (!timeZone) {
    return fromParts(instant.getFullYear(), instant.getMonth() + 1, instant.getDate());
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return fromParts(get('year'), get('month'), get('day'));
}

export function today(now: Date = new Date(), timeZone?: string): LocalDate {
  return localDateOf(now, timeZone);
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** A `Date` for a local wall-clock time on a local date, in the device's time zone. */
export function toLocalDateTime(date: LocalDate, time: string): Date {
  const { year, month, day } = parseLocalDate(date);
  const [h, m] = parseTime(time);
  return new Date(year, month - 1, day, h, m, 0, 0);
}

export function parseTime(time: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) throw new Error(`Invalid time: ${time}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time: ${time}`);
  return [h, min];
}

export function formatTime(hours: number, minutes: number): string {
  return `${pad(hours)}:${pad(minutes)}`;
}

/**
 * Formats a local date for display. Formatting happens in UTC on the date's
 * UTC midnight, so the device time zone cannot shift the displayed day.
 */
export function formatLocalDate(
  date: LocalDate,
  options: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
    new Date(toUtcMs(date)),
  );
}

export function formatTimeLabel(time: string, locale?: string): string {
  const [h, m] = parseTime(time);
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

export function weekdayShortName(weekday: Weekday, locale?: string): string {
  // 2023-01-01 was a Sunday.
  return formatLocalDate(fromParts(2023, 1, 1 + weekday), { weekday: 'short' }, locale);
}
