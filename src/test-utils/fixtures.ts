import type {
  Completion,
  CompletionStatus,
  Habit,
  HabitContext,
  LocalDate,
  Reminder,
  ScheduleRule,
  ScheduleVersion,
} from '@/domain/types';

const TS = '2024-01-01T00:00:00.000Z';

export function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    listId: 'l1',
    name: 'Read',
    description: '',
    icon: 'book',
    color: '#2F9E7E',
    category: 'learning',
    timeOfDay: 'anytime',
    kind: 'check',
    target: null,
    unit: '',
    targetDirection: 'atLeast',
    startDate: '2024-01-01',
    endDate: null,
    sortOrder: 0,
    archivedOn: null,
    inactiveRanges: [],
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    ...overrides,
  };
}

export function makeCtx(
  rule: ScheduleRule = { type: 'daily' },
  habit: Partial<Habit> = {},
  extraVersions: { effectiveFrom: LocalDate; rule: ScheduleRule }[] = [],
): HabitContext {
  const h = makeHabit(habit);
  const versions: ScheduleVersion[] = [
    { id: `${h.id}-v0`, habitId: h.id, effectiveFrom: h.startDate, rule, createdAt: TS, updatedAt: TS },
    ...extraVersions.map((v, i) => ({
      id: `${h.id}-v${i + 1}`,
      habitId: h.id,
      effectiveFrom: v.effectiveFrom,
      rule: v.rule,
      createdAt: TS,
      updatedAt: TS,
    })),
  ];
  return { habit: h, versions, list: null };
}

export function rec(
  date: LocalDate,
  status: CompletionStatus = 'done',
  habitId = 'h1',
  value: number | null = null,
): Completion {
  return { habitId, date, status, value, note: '', createdAt: TS, updatedAt: TS, deletedAt: null };
}

export function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    habitId: 'h1',
    time: '09:00',
    weekdays: null,
    enabled: true,
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    ...overrides,
  };
}
