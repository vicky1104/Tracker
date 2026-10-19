/** Row ↔ domain mapping for the local SQLite tables. */
import { resolveIconKey } from '@/constants/habit-icons';
import type {
  Completion,
  CompletionStatus,
  Habit,
  HabitCategory,
  HabitKind,
  HabitList,
  InactiveRange,
  Reminder,
  ScheduleRule,
  ScheduleVersion,
  TargetDirection,
  TimeOfDay,
  Weekday,
} from '@/domain/types';

function parseJson<T>(value: string | null, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    // Corrupt JSON in a column must not crash the app; fall back and let the
    // next write repair it.
    return fallback;
  }
}

export interface ListRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  archived_on: string | null;
  inactive_ranges: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const listFromRow = (r: ListRow): HabitList => ({
  id: r.id,
  name: r.name,
  color: r.color,
  icon: resolveIconKey(r.icon),
  sortOrder: r.sort_order,
  archivedOn: r.archived_on,
  inactiveRanges: parseJson<InactiveRange[]>(r.inactive_ranges, []),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export interface HabitRow {
  id: string;
  list_id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  time_of_day: string;
  kind: string;
  target: number | null;
  unit: string;
  target_direction: string;
  start_date: string;
  end_date: string | null;
  sort_order: number;
  archived_on: string | null;
  inactive_ranges: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const habitFromRow = (r: HabitRow): Habit => ({
  id: r.id,
  listId: r.list_id,
  name: r.name,
  description: r.description,
  icon: resolveIconKey(r.icon),
  color: r.color,
  category: r.category as HabitCategory,
  timeOfDay: r.time_of_day as TimeOfDay,
  kind: r.kind as HabitKind,
  target: r.target,
  unit: r.unit,
  targetDirection: r.target_direction as TargetDirection,
  startDate: r.start_date,
  endDate: r.end_date,
  sortOrder: r.sort_order,
  archivedOn: r.archived_on,
  inactiveRanges: parseJson<InactiveRange[]>(r.inactive_ranges, []),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export interface ScheduleRow {
  id: string;
  habit_id: string;
  effective_from: string;
  rule: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const scheduleFromRow = (r: ScheduleRow): ScheduleVersion => ({
  id: r.id,
  habitId: r.habit_id,
  effectiveFrom: r.effective_from,
  rule: parseJson<ScheduleRule>(r.rule, { type: 'daily' }),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface ReminderRow {
  id: string;
  habit_id: string;
  time: string;
  weekdays: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const reminderFromRow = (r: ReminderRow): Reminder => ({
  id: r.id,
  habitId: r.habit_id,
  time: r.time,
  weekdays: parseJson<Weekday[] | null>(r.weekdays, null),
  enabled: r.enabled === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export interface CompletionRow {
  habit_id: string;
  date: string;
  status: string;
  value: number | null;
  note: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const completionFromRow = (r: CompletionRow): Completion => ({
  habitId: r.habit_id,
  date: r.date,
  status: r.status as CompletionStatus,
  value: r.value,
  note: r.note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});
