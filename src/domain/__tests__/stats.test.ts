import { makeCtx, rec } from '@/test-utils/fixtures';

import {
  buildRecordsByHabit,
  dailySeries,
  daySummary,
  evaluateHabit,
  habitDayState,
  statusForValue,
} from '../stats';

const opts = (today: string, from = '2024-01-01', to = today) => ({
  from,
  to,
  today,
  firstDayOfWeek: 1 as const,
});

const records = (...rs: ReturnType<typeof rec>[]) => new Map(rs.map((r) => [r.date, r]));

describe('streaks (day rules)', () => {
  it('counts consecutive completed days and keeps today pending', () => {
    const ctx = makeCtx();
    const r = records(rec('2024-01-01'), rec('2024-01-02'), rec('2024-01-03'));
    const s = evaluateHabit(ctx, r, opts('2024-01-04'));
    expect(s.currentStreak).toBe(3);
    expect(s.bestStreak).toBe(3);
    expect(s.rate).toBe(1); // today excluded while pending
  });

  it('resets on a missing past day and tracks the best streak', () => {
    const ctx = makeCtx();
    const r = records(rec('2024-01-01'), rec('2024-01-02'), rec('2024-01-04'));
    const s = evaluateHabit(ctx, r, opts('2024-01-05'));
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(2);
    expect(s.successes).toBe(3);
    expect(s.opportunities).toBe(4);
  });

  it('treats skipped days as neutral: no break, no increment, excluded from rate', () => {
    const ctx = makeCtx();
    const r = records(rec('2024-01-01'), rec('2024-01-02', 'skipped'), rec('2024-01-03'));
    const s = evaluateHabit(ctx, r, opts('2024-01-03'));
    expect(s.currentStreak).toBe(2);
    expect(s.rate).toBe(1);
    expect(s.skipped).toBe(1);
  });

  it('breaks on an explicit miss today', () => {
    const ctx = makeCtx();
    const r = records(rec('2024-01-01'), rec('2024-01-02', 'missed'));
    expect(evaluateHabit(ctx, r, opts('2024-01-02')).currentStreak).toBe(0);
  });

  it('ignores unscheduled days and never inflates with extra completions', () => {
    const ctx = makeCtx({ type: 'weekdays', days: [1, 3, 5] });
    // Mon, (Tue extra), Wed, Fri done
    const r = records(rec('2024-01-01'), rec('2024-01-02'), rec('2024-01-03'), rec('2024-01-05'));
    const s = evaluateHabit(ctx, r, opts('2024-01-07'));
    expect(s.currentStreak).toBe(3);
    expect(s.opportunities).toBe(3);
    expect(s.rate).toBe(1);
  });

  it('does not count partial numeric progress as success', () => {
    const ctx = makeCtx({ type: 'daily' }, { kind: 'numeric', target: 10 });
    const r = records(rec('2024-01-01', 'done', 'h1', 10), rec('2024-01-02', 'partial', 'h1', 4));
    const s = evaluateHabit(ctx, r, opts('2024-01-03'));
    expect(s.currentStreak).toBe(0);
    expect(s.successes).toBe(1);
    expect(s.totalValue).toBe(14);
  });

  it('stops evaluating at the archive date', () => {
    const ctx = makeCtx({ type: 'daily' }, { archivedOn: '2024-01-04' });
    const r = records(rec('2024-01-01'), rec('2024-01-02'), rec('2024-01-03'));
    const s = evaluateHabit(ctx, r, opts('2024-01-10'));
    expect(s.currentStreak).toBe(3);
    expect(s.rate).toBe(1);
  });

  it('does not penalise paused ranges after restore', () => {
    const ctx = makeCtx({ type: 'daily' }, { inactiveRanges: [{ from: '2024-01-03', to: '2024-01-08' }] });
    const r = records(rec('2024-01-01'), rec('2024-01-02'), rec('2024-01-09'));
    const s = evaluateHabit(ctx, r, opts('2024-01-09'));
    expect(s.currentStreak).toBe(3);
    expect(s.rate).toBe(1);
  });

  it('keeps history stable when the schedule changes', () => {
    // Daily in January, then Mondays only from February.
    const ctx = makeCtx({ type: 'daily' }, {}, [{ effectiveFrom: '2024-02-01', rule: { type: 'weekdays', days: [1] } }]);
    const jan = Array.from({ length: 31 }, (_, i) => rec(`2024-01-${String(i + 1).padStart(2, '0')}`));
    const r = records(...jan, rec('2024-02-05'));
    const janStats = evaluateHabit(ctx, r, opts('2024-02-10', '2024-01-01', '2024-01-31'));
    expect(janStats.rate).toBe(1);
    expect(janStats.opportunities).toBe(31);
    const s = evaluateHabit(ctx, r, opts('2024-02-10'));
    expect(s.currentStreak).toBe(32);
  });

  it('handles month boundaries and leap day correctly', () => {
    const ctx = makeCtx({ type: 'monthDays', days: [29] }, { startDate: '2024-01-01' });
    const r = records(rec('2024-01-29'), rec('2024-02-29'), rec('2024-03-29'));
    const s = evaluateHabit(ctx, r, opts('2024-04-01'));
    expect(s.opportunities).toBe(3);
    expect(s.currentStreak).toBe(3);
  });
});

describe('streaks (quota rules)', () => {
  it('counts successful weeks and keeps the current week pending', () => {
    const ctx = makeCtx({ type: 'timesPerWeek', count: 2 });
    // Week of Jan 1 (Mon): 2 done; week of Jan 8: 2 done; week of Jan 15: 1 done so far
    const r = records(rec('2024-01-01'), rec('2024-01-03'), rec('2024-01-09'), rec('2024-01-12'), rec('2024-01-15'));
    const s = evaluateHabit(ctx, r, opts('2024-01-16'));
    expect(s.streakUnit).toBe('week');
    expect(s.currentStreak).toBe(2);
    expect(s.rate).toBe(1);
  });

  it('fails a past week below target', () => {
    const ctx = makeCtx({ type: 'timesPerWeek', count: 3 });
    const r = records(rec('2024-01-01'), rec('2024-01-02'), rec('2024-01-03'), rec('2024-01-08'));
    const s = evaluateHabit(ctx, r, opts('2024-01-15'));
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(1);
    expect(s.successes).toBe(4); // 3 + 1 credit
    expect(s.opportunities).toBe(6);
  });

  it('prorates the first partial week and reduces target by skips', () => {
    // Starts on Saturday: only 2 eligible days in the first week, target 3 → 2.
    const ctx = makeCtx({ type: 'timesPerWeek', count: 3 }, { startDate: '2024-01-06' });
    const r = records(rec('2024-01-06'), rec('2024-01-07'));
    expect(evaluateHabit(ctx, r, opts('2024-01-08')).currentStreak).toBe(1);

    const ctx2 = makeCtx({ type: 'timesPerWeek', count: 7 });
    const r2 = records(
      rec('2024-01-01'),
      rec('2024-01-02'),
      rec('2024-01-03'),
      rec('2024-01-04'),
      rec('2024-01-05'),
      rec('2024-01-06', 'skipped'),
      rec('2024-01-07', 'skipped'),
    );
    expect(evaluateHabit(ctx2, r2, opts('2024-01-08')).currentStreak).toBe(1);
  });
});

describe('daily summary', () => {
  it('computes the dashboard percentage', () => {
    const a = makeCtx({ type: 'daily' }, { id: 'a' });
    const b = makeCtx({ type: 'daily' }, { id: 'b' });
    const c = makeCtx({ type: 'weekdays', days: [2] }, { id: 'c' }); // Tuesdays only
    const recs = buildRecordsByHabit([rec('2024-01-01', 'done', 'a')]);
    const s = daySummary([a, b, c], recs, '2024-01-01', '2024-01-01', 1);
    expect(s.items.map((i) => i.ctx.habit.id)).toEqual(['a', 'b']);
    expect(s.due).toBe(2);
    expect(s.done).toBe(1);
    expect(s.percent).toBe(0.5);
    expect(s.pending).toBe(1);
  });

  it('excludes skipped items from the denominator', () => {
    const a = makeCtx({ type: 'daily' }, { id: 'a' });
    const b = makeCtx({ type: 'daily' }, { id: 'b' });
    const recs = buildRecordsByHabit([rec('2024-01-01', 'done', 'a'), rec('2024-01-01', 'skipped', 'b')]);
    const s = daySummary([a, b], recs, '2024-01-01', '2024-01-01', 1);
    expect(s.percent).toBe(1);
  });

  it('stops counting a quota habit as due once the period target is met', () => {
    const q = makeCtx({ type: 'timesPerWeek', count: 2 }, { id: 'q' });
    const recs = buildRecordsByHabit([rec('2024-01-01', 'done', 'q'), rec('2024-01-02', 'done', 'q')]);
    const wed = daySummary([q], recs, '2024-01-03', '2024-01-03', 1);
    expect(wed.items[0].quota).toMatchObject({ done: 2, target: 2, met: true });
    expect(wed.due).toBe(0);
    expect(wed.percent).toBeNull();
    const tue = daySummary([q], recs, '2024-01-02', '2024-01-03', 1);
    expect(tue.due).toBe(1);
    expect(tue.percent).toBe(1);
  });

  it('excludes deleted habits and inactive days', () => {
    const a = makeCtx({ type: 'daily' }, { id: 'a', deletedAt: '2024-01-02T00:00:00Z' });
    const b = makeCtx({ type: 'daily' }, { id: 'b', startDate: '2024-01-05' });
    const s = daySummary([a, b], new Map(), '2024-01-03', '2024-01-03', 1);
    expect(s.items).toHaveLength(0);
  });

  it('recalculates after a historical edit', () => {
    const a = makeCtx({ type: 'daily' }, { id: 'a' });
    const before = buildRecordsByHabit([rec('2024-01-01', 'done', 'a')]);
    const after = buildRecordsByHabit([rec('2024-01-01', 'done', 'a'), rec('2024-01-02', 'done', 'a')]);
    const s1 = dailySeries([a], before, '2024-01-01', '2024-01-03', '2024-01-03', 1);
    const s2 = dailySeries([a], after, '2024-01-01', '2024-01-03', '2024-01-03', 1);
    expect(s1.map((p) => p.percent)).toEqual([1, 0, null]); // today pending → null
    expect(s2.map((p) => p.percent)).toEqual([1, 1, null]);
  });
});

describe('day state', () => {
  it('distinguishes all states', () => {
    const ctx = makeCtx({ type: 'weekdays', days: [1, 2, 3] }, { startDate: '2024-01-01' });
    expect(habitDayState(ctx, '2023-12-31', undefined, '2024-01-03')).toBe('inactive');
    expect(habitDayState(ctx, '2024-01-01', rec('2024-01-01'), '2024-01-03')).toBe('done');
    expect(habitDayState(ctx, '2024-01-02', undefined, '2024-01-03')).toBe('missed');
    expect(habitDayState(ctx, '2024-01-03', undefined, '2024-01-03')).toBe('pending');
    expect(habitDayState(ctx, '2024-01-04', undefined, '2024-01-03')).toBe('unscheduled');
    expect(habitDayState(ctx, '2024-01-08', undefined, '2024-01-03')).toBe('future');
  });
});

describe('numeric status', () => {
  it('maps values to statuses', () => {
    const atLeast = { kind: 'numeric' as const, target: 10, targetDirection: 'atLeast' as const };
    expect(statusForValue(atLeast, 10)).toBe('done');
    expect(statusForValue(atLeast, 3)).toBe('partial');
    expect(statusForValue(atLeast, 0)).toBeNull();
    const atMost = { kind: 'numeric' as const, target: 30, targetDirection: 'atMost' as const };
    expect(statusForValue(atMost, 20)).toBe('done');
    expect(statusForValue(atMost, 45)).toBe('missed');
  });
});
