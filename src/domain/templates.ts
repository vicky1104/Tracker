/**
 * Local, template-based habit planner. Works fully offline and is the fallback
 * whenever the AI planner is not configured, unavailable, or over its limit.
 */
import type { HabitCategory } from './types';
import type { HabitSuggestion } from './validation';

export interface PlannerTemplate {
  id: string;
  title: string;
  keywords: string[];
  category: HabitCategory;
  /** Advanced templates are part of the premium tier (configurable). */
  advanced: boolean;
  suggestions: HabitSuggestion[];
}

const s = (x: Partial<HabitSuggestion> & Pick<HabitSuggestion, 'name' | 'rule'>): HabitSuggestion => ({
  description: '',
  icon: 'mindful',
  category: 'other',
  timeOfDay: 'anytime',
  kind: 'check',
  target: null,
  unit: '',
  targetDirection: 'atLeast',
  reminderTime: null,
  difficulty: 'easy',
  rationale: '',
  ...x,
});

export const PLANNER_TEMPLATES: PlannerTemplate[] = [
  {
    id: 'fitness',
    title: 'Improve fitness',
    keywords: ['fit', 'fitness', 'exercise', 'workout', 'gym', 'run', 'strength', 'weight', 'cardio'],
    category: 'fitness',
    advanced: false,
    suggestions: [
      s({
        name: 'Walk',
        icon: 'walk',
        category: 'fitness',
        kind: 'numeric',
        target: 6000,
        unit: 'steps',
        rule: { type: 'daily' },
        timeOfDay: 'afternoon',
        difficulty: 'easy',
        rationale: 'Daily low-intensity movement builds a base without needing recovery days.',
      }),
      s({
        name: 'Strength workout',
        icon: 'strength',
        category: 'fitness',
        rule: { type: 'timesPerWeek', count: 3 },
        timeOfDay: 'evening',
        reminderTime: '18:00',
        difficulty: 'medium',
        rationale: 'Three sessions a week is enough for steady progress and leaves rest days.',
      }),
      s({
        name: 'Stretch for 5 minutes',
        icon: 'yoga',
        category: 'fitness',
        rule: { type: 'daily' },
        timeOfDay: 'morning',
        reminderTime: '07:30',
        difficulty: 'easy',
        rationale: 'A tiny daily habit that keeps the routine alive on busy days.',
      }),
    ],
  },
  {
    id: 'reading',
    title: 'Read regularly',
    keywords: ['read', 'reading', 'book', 'books', 'novel'],
    category: 'learning',
    advanced: false,
    suggestions: [
      s({
        name: 'Read',
        icon: 'book',
        category: 'learning',
        kind: 'numeric',
        target: 10,
        unit: 'pages',
        rule: { type: 'daily' },
        timeOfDay: 'evening',
        reminderTime: '21:00',
        difficulty: 'easy',
        rationale: 'Ten pages a day is about a book a month — small enough to keep going.',
      }),
      s({
        name: 'Keep a book within reach',
        icon: 'books',
        category: 'learning',
        rule: { type: 'daily' },
        timeOfDay: 'morning',
        difficulty: 'easy',
        rationale: 'Reducing friction makes it easier to read in spare moments.',
      }),
    ],
  },
  {
    id: 'morning',
    title: 'Build a morning routine',
    keywords: ['morning', 'routine', 'wake', 'early', 'start the day'],
    category: 'productivity',
    advanced: false,
    suggestions: [
      s({
        name: 'Drink a glass of water',
        icon: 'water',
        category: 'health',
        rule: { type: 'daily' },
        timeOfDay: 'morning',
        reminderTime: '07:00',
        rationale: 'An easy first win that anchors the rest of the routine.',
      }),
      s({
        name: 'Make the bed',
        icon: 'sleep',
        category: 'personal',
        rule: { type: 'daily' },
        timeOfDay: 'morning',
        rationale: 'A visible, two-minute task that signals the day has started.',
      }),
      s({
        name: 'Plan top 3 tasks',
        icon: 'note',
        category: 'productivity',
        rule: { type: 'weekdays', days: [1, 2, 3, 4, 5] },
        timeOfDay: 'morning',
        reminderTime: '08:30',
        difficulty: 'medium',
        rationale: 'Deciding priorities early reduces decision fatigue later.',
      }),
    ],
  },
  {
    id: 'study',
    title: 'Study for an exam',
    keywords: ['study', 'exam', 'test', 'learn', 'revision', 'course', 'school', 'university'],
    category: 'learning',
    advanced: false,
    suggestions: [
      s({
        name: 'Focused study session',
        icon: 'target',
        category: 'learning',
        kind: 'numeric',
        target: 45,
        unit: 'min',
        rule: { type: 'weekdays', days: [1, 2, 3, 4, 5, 6] },
        timeOfDay: 'afternoon',
        reminderTime: '16:00',
        difficulty: 'medium',
        rationale: 'Regular, time-boxed sessions beat last-minute cramming for retention.',
      }),
      s({
        name: 'Review flashcards',
        icon: 'books',
        category: 'learning',
        rule: { type: 'daily' },
        timeOfDay: 'evening',
        difficulty: 'easy',
        rationale: 'Spaced repetition works best when it happens every day.',
      }),
      s({
        name: 'Practice test',
        icon: 'check',
        category: 'learning',
        rule: { type: 'timesPerWeek', count: 1 },
        difficulty: 'hard',
        rationale: 'Testing yourself reveals gaps while there is still time to fix them.',
      }),
    ],
  },
  {
    id: 'sleep',
    title: 'Improve sleep',
    keywords: ['sleep', 'bed', 'rest', 'insomnia', 'tired', 'night'],
    category: 'sleep',
    advanced: false,
    suggestions: [
      s({
        name: 'Screens off before bed',
        icon: 'phoneOff',
        category: 'sleep',
        rule: { type: 'daily' },
        timeOfDay: 'evening',
        reminderTime: '22:00',
        difficulty: 'medium',
        rationale: 'Less light and stimulation late in the evening makes it easier to fall asleep.',
      }),
      s({
        name: 'Consistent wake-up time',
        icon: 'alarm',
        category: 'sleep',
        rule: { type: 'daily' },
        timeOfDay: 'morning',
        difficulty: 'medium',
        rationale: 'A fixed wake time is one of the strongest levers for a stable sleep rhythm.',
      }),
      s({
        name: 'No caffeine after 2 pm',
        icon: 'coffee',
        category: 'sleep',
        rule: { type: 'daily' },
        timeOfDay: 'afternoon',
        reminderTime: '14:00',
        difficulty: 'easy',
        rationale: 'Caffeine can stay in your system for many hours.',
      }),
    ],
  },
  {
    id: 'social',
    title: 'Reduce social media',
    keywords: ['social', 'media', 'phone', 'screen', 'instagram', 'tiktok', 'scroll', 'doom'],
    category: 'mindfulness',
    advanced: false,
    suggestions: [
      s({
        name: 'Social media time',
        icon: 'phone',
        category: 'mindfulness',
        kind: 'numeric',
        target: 30,
        unit: 'min',
        targetDirection: 'atMost',
        rule: { type: 'daily' },
        timeOfDay: 'evening',
        reminderTime: '21:30',
        difficulty: 'medium',
        rationale: 'Logging your actual minutes against a limit builds awareness without an all-or-nothing rule.',
      }),
      s({
        name: 'Phone-free first hour',
        icon: 'sunrise',
        category: 'mindfulness',
        rule: { type: 'daily' },
        timeOfDay: 'morning',
        difficulty: 'hard',
        rationale: 'Starting the day without a feed keeps your attention your own.',
      }),
    ],
  },
  {
    id: 'mindfulness',
    title: 'Be more mindful',
    keywords: ['mindful', 'meditat', 'stress', 'calm', 'anxiety', 'gratitude', 'journal'],
    category: 'mindfulness',
    advanced: false,
    suggestions: [
      s({
        name: 'Meditate',
        icon: 'yoga',
        category: 'mindfulness',
        kind: 'numeric',
        target: 5,
        unit: 'min',
        rule: { type: 'daily' },
        timeOfDay: 'morning',
        reminderTime: '07:15',
        rationale: 'Five minutes is short enough to do every day, which matters more than length.',
      }),
      s({
        name: 'Write 3 things you are grateful for',
        icon: 'gratitude',
        category: 'mindfulness',
        rule: { type: 'daily' },
        timeOfDay: 'evening',
        rationale: 'A short reflection at the end of the day shifts attention to what went well.',
      }),
    ],
  },
  {
    id: 'run-5k',
    title: 'Couch to 5K (8 weeks)',
    keywords: ['5k', 'run', 'running', 'jog', 'marathon'],
    category: 'fitness',
    advanced: true,
    suggestions: [
      s({
        name: 'Run/walk intervals',
        icon: 'run',
        category: 'fitness',
        kind: 'numeric',
        target: 20,
        unit: 'min',
        rule: { type: 'weekdays', days: [1, 3, 6] },
        timeOfDay: 'morning',
        reminderTime: '07:00',
        difficulty: 'medium',
        rationale: 'Three spaced sessions a week with rest days in between, building up gradually.',
      }),
      s({
        name: 'Mobility & foam rolling',
        icon: 'yoga',
        category: 'fitness',
        rule: { type: 'weekdays', days: [2, 4] },
        timeOfDay: 'evening',
        difficulty: 'easy',
        rationale: 'Recovery work on off days reduces injury risk as volume grows.',
      }),
      s({
        name: 'Long easy run',
        icon: 'run',
        category: 'fitness',
        rule: { type: 'timesPerWeek', count: 1 },
        difficulty: 'hard',
        rationale: 'One longer, slow run a week builds endurance for race distance.',
      }),
    ],
  },
  {
    id: 'deep-work',
    title: 'Deep work system',
    keywords: ['productiv', 'focus', 'work', 'deep work', 'procrastinat', 'career'],
    category: 'productivity',
    advanced: true,
    suggestions: [
      s({
        name: 'Deep work block',
        icon: 'brain',
        category: 'productivity',
        kind: 'numeric',
        target: 90,
        unit: 'min',
        rule: { type: 'weekdays', days: [1, 2, 3, 4, 5] },
        timeOfDay: 'morning',
        reminderTime: '09:00',
        difficulty: 'hard',
        rationale: 'A protected block at the same time every day becomes automatic.',
      }),
      s({
        name: 'Inbox zero',
        icon: 'inbox',
        category: 'productivity',
        rule: { type: 'weekdays', days: [1, 2, 3, 4, 5] },
        timeOfDay: 'afternoon',
        difficulty: 'medium',
        rationale: 'Batching communication keeps it from fragmenting your focus.',
      }),
      s({
        name: 'Weekly review',
        icon: 'calendar',
        category: 'productivity',
        rule: { type: 'weekdays', days: [5] },
        timeOfDay: 'afternoon',
        reminderTime: '16:00',
        difficulty: 'medium',
        rationale: 'Reviewing the week closes open loops and sets up the next one.',
      }),
    ],
  },
  {
    id: 'health',
    title: 'Healthier everyday habits',
    keywords: ['health', 'water', 'hydrat', 'diet', 'eat', 'nutrition', 'vegetable'],
    category: 'health',
    advanced: false,
    suggestions: [
      s({
        name: 'Drink water',
        icon: 'water',
        category: 'health',
        kind: 'numeric',
        target: 8,
        unit: 'glasses',
        rule: { type: 'daily' },
        difficulty: 'easy',
        rationale: 'A countable target makes hydration easy to track through the day.',
      }),
      s({
        name: 'Eat a serving of vegetables',
        icon: 'veggie',
        category: 'health',
        rule: { type: 'daily' },
        timeOfDay: 'afternoon',
        difficulty: 'easy',
        rationale: 'Adding something is easier to sustain than removing something.',
      }),
    ],
  },
];

/** Picks templates matching a free-text goal. Falls back to the most general template. */
export function matchTemplates(goal: string, includeAdvanced: boolean): PlannerTemplate[] {
  const g = goal.toLowerCase();
  const available = PLANNER_TEMPLATES.filter((t) => includeAdvanced || !t.advanced);
  const scored = available
    .map((t) => ({ t, score: t.keywords.filter((k) => g.includes(k)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
  return scored.length > 0 ? scored : available.filter((t) => t.id === 'morning' || t.id === 'health');
}

/** Starter suggestions for onboarding focus areas. */
export function starterSuggestions(areas: HabitCategory[]): HabitSuggestion[] {
  const out: HabitSuggestion[] = [];
  const seen = new Set<string>();
  for (const area of areas) {
    const t = PLANNER_TEMPLATES.find((x) => !x.advanced && x.category === area);
    const first = t?.suggestions[0];
    if (first && !seen.has(first.name)) {
      seen.add(first.name);
      out.push(first);
    }
  }
  return out.slice(0, 5);
}
