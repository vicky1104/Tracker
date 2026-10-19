import { makeCtx, rec } from '@/test-utils/fixtures';

import { findStreaksAtRisk, nudgeMessage, nudgeWindow } from '../nudges';
import { buildRecordsByHabit } from '../stats';

const TODAY = '2024-01-10'; // Wednesday

describe('streak-at-risk detection', () => {
  it('flags a due, incomplete habit with a running streak', () => {
    const ctx = makeCtx({ type: 'daily' }, { id: 'a', name: 'Read' });
    const records = buildRecordsByHabit([rec('2024-01-08', 'done', 'a'), rec('2024-01-09', 'done', 'a')]);
    expect(findStreaksAtRisk([ctx], records, TODAY, 1)).toEqual([{ habitId: 'a', name: 'Read', streak: 2, unit: 'day' }]);
  });

  it('ignores habits already done, skipped or missed today, and short streaks', () => {
    const done = makeCtx({ type: 'daily' }, { id: 'd' });
    const skipped = makeCtx({ type: 'daily' }, { id: 's' });
    const short = makeCtx({ type: 'daily' }, { id: 'x' });
    const records = buildRecordsByHabit([
      rec('2024-01-08', 'done', 'd'),
      rec('2024-01-09', 'done', 'd'),
      rec(TODAY, 'done', 'd'),
      rec('2024-01-08', 'done', 's'),
      rec('2024-01-09', 'done', 's'),
      rec(TODAY, 'skipped', 's'),
      rec('2024-01-09', 'done', 'x'),
    ]);
    expect(findStreaksAtRisk([done, skipped, short], records, TODAY, 1)).toEqual([]);
  });

  it('does not nudge for habits not scheduled today or archived', () => {
    const mondays = makeCtx({ type: 'weekdays', days: [1] }, { id: 'm' });
    const archived = makeCtx({ type: 'daily' }, { id: 'z', archivedOn: '2024-01-05' });
    const records = buildRecordsByHabit([rec('2024-01-01', 'done', 'm'), rec('2024-01-08', 'done', 'm')]);
    expect(findStreaksAtRisk([mondays, archived], records, TODAY, 1)).toEqual([]);
  });

  it('only flags quota habits on the last day of an unmet period', () => {
    const q = makeCtx({ type: 'timesPerWeek', count: 2 }, { id: 'q', name: 'Gym' });
    // Previous week met (Jan 1–7), this week 1 of 2 so far.
    const records = buildRecordsByHabit([rec('2024-01-02', 'done', 'q'), rec('2024-01-04', 'done', 'q'), rec('2024-01-08', 'done', 'q')]);
    expect(findStreaksAtRisk([q], records, TODAY, 1)).toEqual([]); // Wednesday: still time
    expect(findStreaksAtRisk([q], records, '2024-01-14', 1)).toEqual([{ habitId: 'q', name: 'Gym', streak: 1, unit: 'week' }]);
  });

  it('orders by longest streak first and builds a message', () => {
    const a = makeCtx({ type: 'daily' }, { id: 'a', name: 'Read' });
    const b = makeCtx({ type: 'daily' }, { id: 'b', name: 'Walk' });
    const records = buildRecordsByHabit([
      rec('2024-01-07', 'done', 'b'),
      rec('2024-01-08', 'done', 'a'),
      rec('2024-01-08', 'done', 'b'),
      rec('2024-01-09', 'done', 'a'),
      rec('2024-01-09', 'done', 'b'),
    ]);
    const atRisk = findStreaksAtRisk([a, b], records, TODAY, 1);
    expect(atRisk.map((x) => x.name)).toEqual(['Walk', 'Read']);
    expect(nudgeMessage(atRisk)).toEqual({
      title: 'Keep your 3-day streak going',
      body: '“Walk” and 1 other habit still need you today.',
    });
  });
});

describe('nudge window', () => {
  it('uses the user’s local time and date', () => {
    const now = new Date('2024-01-10T14:45:00Z'); // 20:15 in Kolkata, 09:45 in New York
    expect(nudgeWindow(now, 'Asia/Kolkata', '20:00')).toEqual({ inWindow: true, localDate: '2024-01-10' });
    expect(nudgeWindow(now, 'America/New_York', '20:00')).toEqual({ inWindow: false, localDate: '2024-01-10' });
    expect(nudgeWindow(now, 'Asia/Kolkata', '21:00').inWindow).toBe(false);
  });

  it('handles day boundaries and unknown zones', () => {
    expect(nudgeWindow(new Date('2024-01-10T23:30:00Z'), 'Asia/Tokyo', '08:00')).toEqual({ inWindow: true, localDate: '2024-01-11' });
    expect(nudgeWindow(new Date('2024-01-10T20:10:00Z'), 'Not/AZone', '20:00')).toEqual({ inWindow: true, localDate: '2024-01-10' });
  });
});
