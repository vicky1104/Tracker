import { makeCtx, makeReminder, rec } from '@/test-utils/fixtures';

import { diffNotifications, planNotifications } from '../reminders';
import { buildRecordsByHabit } from '../stats';

const base = {
  firstDayOfWeek: 1 as const,
  horizonDays: 7,
};

describe('reminder planning', () => {
  it('plans one notification per scheduled day, honouring the habit schedule', () => {
    const ctx = makeCtx({ type: 'weekdays', days: [1, 3, 5] });
    const plan = planNotifications({
      ...base,
      contexts: [ctx],
      reminders: [makeReminder()],
      records: new Map(),
      now: new Date(2024, 0, 1, 8, 0), // Mon 08:00 local
      today: '2024-01-01',
    });
    expect(plan.map((p) => p.date)).toEqual(['2024-01-01', '2024-01-03', '2024-01-05']);
    expect(plan[0].fireAt.getHours()).toBe(9);
  });

  it('respects reminder weekday restrictions', () => {
    const ctx = makeCtx({ type: 'daily' });
    const plan = planNotifications({
      ...base,
      contexts: [ctx],
      reminders: [makeReminder({ weekdays: [6, 0] })],
      records: new Map(),
      now: new Date(2024, 0, 1, 8, 0),
      today: '2024-01-01',
    });
    expect(plan.map((p) => p.date)).toEqual(['2024-01-06', '2024-01-07']);
  });

  it('skips past times, completed days and disabled reminders', () => {
    const ctx = makeCtx({ type: 'daily' });
    const plan = planNotifications({
      ...base,
      contexts: [ctx],
      reminders: [makeReminder(), makeReminder({ id: 'r2', enabled: false })],
      records: buildRecordsByHabit([rec('2024-01-02')]),
      now: new Date(2024, 0, 1, 10, 0), // after 09:00 today
      today: '2024-01-01',
    });
    expect(plan.map((p) => p.date)).toEqual(['2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07']);
  });

  it('does not remind archived or deleted habits', () => {
    const archived = makeCtx({ type: 'daily' }, { id: 'a', archivedOn: '2024-01-01' });
    const deleted = makeCtx({ type: 'daily' }, { id: 'd', deletedAt: '2024-01-01T00:00:00Z' });
    const plan = planNotifications({
      ...base,
      contexts: [archived, deleted],
      reminders: [makeReminder({ habitId: 'a' }), makeReminder({ id: 'r2', habitId: 'd' })],
      records: new Map(),
      now: new Date(2024, 0, 1, 0, 0),
      today: '2024-01-01',
    });
    expect(plan).toHaveLength(0);
  });

  it('stops reminding a quota habit once the week target is met', () => {
    const ctx = makeCtx({ type: 'timesPerWeek', count: 2 });
    const plan = planNotifications({
      ...base,
      contexts: [ctx],
      reminders: [makeReminder()],
      records: buildRecordsByHabit([rec('2024-01-01'), rec('2024-01-02')]),
      now: new Date(2024, 0, 3, 0, 0),
      today: '2024-01-03',
    });
    // Rest of this week is suppressed; next week (from Mon Jan 8) is outside the 7-day horizon except none.
    expect(plan.every((p) => p.date >= '2024-01-08')).toBe(true);
  });

  it('caps the plan to the budget, keeping the soonest', () => {
    const ctxs = Array.from({ length: 10 }, (_, i) => makeCtx({ type: 'daily' }, { id: `h${i}` }));
    const reminders = ctxs.map((c, i) => makeReminder({ id: `r${i}`, habitId: c.habit.id }));
    const plan = planNotifications({
      ...base,
      contexts: ctxs,
      reminders,
      records: new Map(),
      now: new Date(2024, 0, 1, 0, 0),
      today: '2024-01-01',
      budget: 25,
    });
    expect(plan).toHaveLength(25);
    expect(plan[plan.length - 1].date).toBe('2024-01-03');
  });

  it('produces deterministic identifiers and a minimal diff', () => {
    const input = {
      ...base,
      contexts: [makeCtx({ type: 'daily' })],
      reminders: [makeReminder()],
      records: new Map(),
      now: new Date(2024, 0, 1, 0, 0),
      today: '2024-01-01',
    };
    const a = planNotifications(input);
    const b = planNotifications(input);
    expect(a.map((p) => p.identifier)).toEqual(b.map((p) => p.identifier));

    const existing = [...a.slice(1).map((p) => p.identifier), 'hf_stale', 'other_app_notification'];
    const diff = diffNotifications(a, existing);
    expect(diff.toCancel).toEqual(['hf_stale']);
    expect(diff.toSchedule.map((p) => p.identifier)).toEqual([a[0].identifier]);
  });

  it('changes identifiers when the reminder time changes (so old ones are cancelled)', () => {
    const input = {
      ...base,
      contexts: [makeCtx({ type: 'daily' })],
      records: new Map(),
      now: new Date(2024, 0, 1, 0, 0),
      today: '2024-01-01',
    };
    const before = planNotifications({ ...input, reminders: [makeReminder({ time: '09:00' })] });
    const after = planNotifications({ ...input, reminders: [makeReminder({ time: '10:00' })] });
    const diff = diffNotifications(after, before.map((p) => p.identifier));
    expect(diff.toCancel).toHaveLength(before.length);
    expect(diff.toSchedule).toHaveLength(after.length);
  });
});
