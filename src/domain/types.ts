/**
 * Core domain types. These are storage-agnostic: the SQLite layer and the
 * Supabase layer both map to and from these shapes.
 */

/** A calendar date in the user's local time, formatted `YYYY-MM-DD`. */
export type LocalDate = string;

/** 0 = Sunday … 6 = Saturday (matches `Date.prototype.getDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type FirstDayOfWeek = 0 | 1 | 6;

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'anytime';

export type HabitKind = 'check' | 'numeric';

/** For numeric habits: `atLeast` (e.g. read 20 pages) or `atMost` (e.g. ≤ 30 min social media). */
export type TargetDirection = 'atLeast' | 'atMost';

export type HabitCategory =
  | 'health'
  | 'fitness'
  | 'learning'
  | 'productivity'
  | 'mindfulness'
  | 'sleep'
  | 'personal'
  | 'other';

export type ScheduleRule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: Weekday[] }
  /** Days of the month (1–31). A day beyond the month's length falls on the month's last day. */
  | { type: 'monthDays'; days: number[] }
  /** Every N days counted from the version's anchor date. */
  | { type: 'interval'; every: number }
  /** Any N days within each week (week boundaries follow the first-day-of-week setting). */
  | { type: 'timesPerWeek'; count: number }
  /** Any N days within each calendar month. */
  | { type: 'timesPerMonth'; count: number };

export type QuotaRule = Extract<ScheduleRule, { type: 'timesPerWeek' | 'timesPerMonth' }>;

/**
 * Schedules are versioned so that editing a schedule never rewrites history:
 * a date is evaluated against the version in effect on that date.
 */
export interface ScheduleVersion {
  id: string;
  habitId: string;
  effectiveFrom: LocalDate;
  rule: ScheduleRule;
  createdAt: string;
  updatedAt: string;
}

/** Inclusive date range during which a habit/list was archived (paused). */
export interface InactiveRange {
  from: LocalDate;
  to: LocalDate;
}

export interface HabitList {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  archivedOn: LocalDate | null;
  inactiveRanges: InactiveRange[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Habit {
  id: string;
  listId: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: HabitCategory;
  timeOfDay: TimeOfDay;
  kind: HabitKind;
  target: number | null;
  unit: string;
  targetDirection: TargetDirection;
  startDate: LocalDate;
  endDate: LocalDate | null;
  sortOrder: number;
  archivedOn: LocalDate | null;
  inactiveRanges: InactiveRange[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * - `done`: completed (for numeric habits: target reached)
 * - `partial`: numeric progress logged but target not reached
 * - `skipped`: intentionally skipped — excluded from rates, does not break streaks
 * - `missed`: explicitly marked as not done — counts as a failure
 */
export type CompletionStatus = 'done' | 'partial' | 'skipped' | 'missed';

/** One record per habit per local date (enforced by a unique key). */
export interface Completion {
  habitId: string;
  date: LocalDate;
  status: CompletionStatus;
  value: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Reminder {
  id: string;
  habitId: string;
  /** `HH:MM`, 24-hour, local time. */
  time: string;
  /** Restrict to these weekdays; `null` means "whenever the habit is scheduled". */
  weekdays: Weekday[] | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type Density = 'compact' | 'comfortable';

export interface UserSettings {
  theme: ThemePreference;
  accent: string;
  density: Density;
  firstDayOfWeek: FirstDayOfWeek;
  onboardingCompleted: boolean;
  focusAreas: HabitCategory[];
  defaultReminderTimes: Record<Exclude<TimeOfDay, 'anytime'>, string>;
  remindersEnabled: boolean;
  /** Server push when a streak is about to break (needs an account with sync). */
  streakNudges: boolean;
  /** Local time (HH:MM) of the streak nudge. */
  streakNudgeTime: string;
  timeZone: string;
}

/** Everything needed to evaluate a habit on a given date. */
export interface HabitContext {
  habit: Habit;
  /** Sorted by `effectiveFrom` ascending. Must contain at least one version. */
  versions: ScheduleVersion[];
  list: Pick<HabitList, 'archivedOn' | 'inactiveRanges' | 'deletedAt'> | null;
}
