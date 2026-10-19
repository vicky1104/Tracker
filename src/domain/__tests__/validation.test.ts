import { matchTemplates, PLANNER_TEMPLATES, starterSuggestions } from '../templates';
import { aiPlanResponseSchema, habitFormSchema, type HabitFormValues } from '../validation';

const valid: HabitFormValues = {
  name: 'Read',
  description: '',
  icon: '📖',
  color: '#2F9E7E',
  listId: 'l1',
  category: 'learning',
  timeOfDay: 'evening',
  kind: 'check',
  target: null,
  unit: '',
  targetDirection: 'atLeast',
  rule: { type: 'daily' },
  startDate: '2024-01-01',
  endDate: null,
  reminders: [],
};

describe('habit form validation', () => {
  it('accepts a valid habit', () => {
    expect(habitFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects blank names, bad dates and inconsistent targets', () => {
    expect(habitFormSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(habitFormSchema.safeParse({ ...valid, startDate: '2023-02-29' }).success).toBe(false);
    expect(habitFormSchema.safeParse({ ...valid, endDate: '2023-12-31' }).success).toBe(false);
    expect(habitFormSchema.safeParse({ ...valid, kind: 'numeric', target: null }).success).toBe(false);
    expect(habitFormSchema.safeParse({ ...valid, kind: 'numeric', target: 10, unit: 'pages' }).success).toBe(true);
  });

  it('validates schedule rules and reminders', () => {
    expect(habitFormSchema.safeParse({ ...valid, rule: { type: 'weekdays', days: [] } }).success).toBe(false);
    expect(habitFormSchema.safeParse({ ...valid, rule: { type: 'timesPerWeek', count: 8 } }).success).toBe(false);
    expect(habitFormSchema.safeParse({ ...valid, rule: { type: 'monthDays', days: [31] } }).success).toBe(true);
    expect(
      habitFormSchema.safeParse({ ...valid, reminders: [{ time: '24:00', weekdays: null, enabled: true }] }).success,
    ).toBe(false);
    expect(
      habitFormSchema.safeParse({ ...valid, reminders: [{ time: '07:30', weekdays: [1, 3], enabled: true }] }).success,
    ).toBe(true);
  });
});

describe('AI planner response validation', () => {
  it('rejects malformed or oversized responses', () => {
    expect(aiPlanResponseSchema.safeParse({ suggestions: [] }).success).toBe(false);
    expect(aiPlanResponseSchema.safeParse({ suggestions: [{ name: 'x' }] }).success).toBe(false);
    expect(
      aiPlanResponseSchema.safeParse({ suggestions: [{ name: 'Walk', rule: { type: 'interval', every: 0 } }] }).success,
    ).toBe(false);
  });

  it('fills safe defaults for optional fields', () => {
    const r = aiPlanResponseSchema.parse({ suggestions: [{ name: 'Walk', rule: { type: 'daily' } }] });
    expect(r.suggestions[0]).toMatchObject({ kind: 'check', reminderTime: null, difficulty: 'easy' });
  });
});

describe('template planner', () => {
  it('ships only valid templates', () => {
    for (const t of PLANNER_TEMPLATES) {
      expect(aiPlanResponseSchema.safeParse({ suggestions: t.suggestions }).success).toBe(true);
    }
  });

  it('matches goals by keyword and hides advanced templates on the free tier', () => {
    expect(matchTemplates('I want to sleep better', false)[0].id).toBe('sleep');
    expect(matchTemplates('run a 5k', false).some((t) => t.advanced)).toBe(false);
    expect(matchTemplates('run a 5k', true)[0].id).toBe('run-5k');
    expect(matchTemplates('something unrelated', false).length).toBeGreaterThan(0);
  });

  it('derives starter habits from focus areas', () => {
    expect(starterSuggestions(['fitness', 'sleep']).map((s) => s.category)).toEqual(['fitness', 'sleep']);
  });
});
