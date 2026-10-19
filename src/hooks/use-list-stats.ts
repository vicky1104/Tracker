import { useMemo } from 'react';

import { useHabitData, useSettings } from '@/data/hooks';
import { addDays } from '@/domain/dates';
import { aggregateRate, dailySeries, daySummary } from '@/domain/stats';
import type { HabitContext, LocalDate } from '@/domain/types';

export interface ListStats {
  habitCount: number;
  today: { done: number; due: number; percent: number | null };
  week: number | null;
}

/** Today's completion and 7-day rate for each list, plus the combined total. */
export function useListStats(today: LocalDate): { byList: Map<string, ListStats>; overall: ListStats } {
  const { contexts, records, lists } = useHabitData();
  const { firstDayOfWeek } = useSettings();

  return useMemo(() => {
    const compute = (ctxs: HabitContext[]): ListStats => {
      const s = daySummary(ctxs, records, today, today, firstDayOfWeek);
      const week = aggregateRate(dailySeries(ctxs, records, addDays(today, -6), today, today, firstDayOfWeek)).rate;
      return {
        habitCount: ctxs.filter((c) => !c.habit.archivedOn).length,
        today: { done: s.done, due: s.due, percent: s.percent },
        week,
      };
    };
    const byList = new Map<string, ListStats>();
    for (const l of lists) byList.set(l.id, compute(contexts.filter((c) => c.habit.listId === l.id)));
    const activeIds = new Set(lists.filter((l) => !l.archivedOn).map((l) => l.id));
    return { byList, overall: compute(contexts.filter((c) => activeIds.has(c.habit.listId))) };
  }, [contexts, records, lists, today, firstDayOfWeek]);
}
