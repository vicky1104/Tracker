import { makeCtx } from '@/test-utils/fixtures';

import { isActiveOn, isEligibleOn, rulesEqual, upcomingEligibleDates, versionOn } from '../schedule';

describe('schedule rules', () => {
  it('selects weekdays', () => {
    const ctx = makeCtx({ type: 'weekdays', days: [1, 3, 5] }); // Mon/Wed/Fri
    expect(isEligibleOn(ctx, '2024-01-01')).toBe(true); // Mon
    expect(isEligibleOn(ctx, '2024-01-02')).toBe(false); // Tue
    expect(isEligibleOn(ctx, '2024-01-05')).toBe(true); // Fri
  });

  it('maps month days beyond the month length to the last day', () => {
    const ctx = makeCtx({ type: 'monthDays', days: [31] }, { startDate: '2023-01-01' });
    expect(isEligibleOn(ctx, '2024-02-29')).toBe(true);
    expect(isEligibleOn(ctx, '2024-02-28')).toBe(false);
    expect(isEligibleOn(ctx, '2023-02-28')).toBe(true);
    expect(isEligibleOn(ctx, '2024-04-30')).toBe(true);
    expect(isEligibleOn(ctx, '2024-05-31')).toBe(true);
    expect(isEligibleOn(ctx, '2024-05-30')).toBe(false);
  });

  it('counts intervals from the start date', () => {
    const ctx = makeCtx({ type: 'interval', every: 3 }, { startDate: '2024-02-27' });
    expect(upcomingEligibleDates(ctx, '2024-02-27', 4)).toEqual([
      '2024-02-27',
      '2024-03-01',
      '2024-03-04',
      '2024-03-07',
    ]);
  });

  it('respects start date, end date, archive date and inactive ranges', () => {
    const ctx = makeCtx(
      { type: 'daily' },
      {
        startDate: '2024-01-10',
        endDate: '2024-03-01',
        archivedOn: '2024-02-20',
        inactiveRanges: [{ from: '2024-01-15', to: '2024-01-16' }],
      },
    );
    expect(isActiveOn(ctx, '2024-01-09')).toBe(false);
    expect(isActiveOn(ctx, '2024-01-10')).toBe(true);
    expect(isActiveOn(ctx, '2024-01-15')).toBe(false);
    expect(isActiveOn(ctx, '2024-01-17')).toBe(true);
    expect(isActiveOn(ctx, '2024-02-19')).toBe(true);
    expect(isActiveOn(ctx, '2024-02-20')).toBe(false);
  });

  it('is inactive when the list is archived', () => {
    const ctx = { ...makeCtx(), list: { archivedOn: '2024-01-05', inactiveRanges: [], deletedAt: null } };
    expect(isActiveOn(ctx, '2024-01-04')).toBe(true);
    expect(isActiveOn(ctx, '2024-01-05')).toBe(false);
  });

  it('evaluates each date against the schedule version in effect', () => {
    const ctx = makeCtx({ type: 'daily' }, {}, [
      { effectiveFrom: '2024-02-01', rule: { type: 'weekdays', days: [1] } },
    ]);
    expect(versionOn(ctx, '2024-01-31').version.rule.type).toBe('daily');
    expect(isEligibleOn(ctx, '2024-01-30')).toBe(true); // Tue under old rule
    expect(isEligibleOn(ctx, '2024-02-06')).toBe(false); // Tue under new rule
    expect(isEligibleOn(ctx, '2024-02-05')).toBe(true); // Mon
  });

  it('anchors interval rules of later versions at their effective date', () => {
    const ctx = makeCtx({ type: 'daily' }, {}, [{ effectiveFrom: '2024-03-01', rule: { type: 'interval', every: 2 } }]);
    expect(isEligibleOn(ctx, '2024-03-01')).toBe(true);
    expect(isEligibleOn(ctx, '2024-03-02')).toBe(false);
    expect(isEligibleOn(ctx, '2024-03-03')).toBe(true);
  });

  it('compares rules ignoring day order', () => {
    expect(rulesEqual({ type: 'weekdays', days: [3, 1] }, { type: 'weekdays', days: [1, 3] })).toBe(true);
    expect(rulesEqual({ type: 'daily' }, { type: 'interval', every: 1 })).toBe(false);
  });
});
