/**
 * Entry point for the domain bundle used by Supabase Edge Functions
 * (`npm run build:edge` → supabase/functions/_shared/domain.js).
 * Only pure, dependency-free domain code may be exported from here.
 */
export { findStreaksAtRisk, nudgeMessage, nudgeWindow } from './nudges';
export type { AtRiskHabit } from './nudges';
export { buildRecordsByHabit } from './stats';
export type {
  Completion,
  FirstDayOfWeek,
  Habit,
  HabitContext,
  HabitList,
  ScheduleRule,
  ScheduleVersion,
} from './types';
