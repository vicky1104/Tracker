import type { HabitIconKey } from './habit-icons';

/** Habit/list colors. Chosen to stay legible on both light and dark surfaces. */
export const HABIT_COLORS = [
  '#2F9E7E', // sage
  '#3B82C4', // ocean
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#C2549D', // plum
  '#E25C5C', // coral
  '#E07B39', // amber
  '#C9A227', // mustard
  '#5E9E3A', // leaf
  '#2A9DB0', // teal
  '#7A7F87', // slate
  '#9C6B4E', // clay
] as const;

export const CATEGORY_LABELS = {
  health: 'Health',
  fitness: 'Fitness',
  learning: 'Learning',
  productivity: 'Productivity',
  mindfulness: 'Mindfulness',
  sleep: 'Sleep',
  personal: 'Personal growth',
  other: 'Other',
} as const;

export const CATEGORY_ICONS = {
  health: 'heart',
  fitness: 'strength',
  learning: 'books',
  productivity: 'target',
  mindfulness: 'yoga',
  sleep: 'moon',
  personal: 'plant',
  other: 'star',
} as const satisfies Record<string, HabitIconKey>;

export const TIME_OF_DAY_LABELS = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  anytime: 'Anytime',
} as const;
