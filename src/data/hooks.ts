import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import * as backup from '@/db/backup';
import * as completions from '@/db/completions';
import * as habits from '@/db/habits';
import * as lists from '@/db/lists';
import { getSettings, updateSettings } from '@/db/settings';
import { buildRecordsByHabit, type RecordsByHabit } from '@/domain/stats';
import type {
  Completion,
  CompletionStatus,
  Habit,
  HabitContext,
  HabitList,
  LocalDate,
  Reminder,
  UserSettings,
} from '@/domain/types';
import type { ListFormValues } from '@/domain/validation';
import { nowIso } from '@/lib/clock';
import { errorMessage } from '@/lib/errors';
import { showToast, useAppStore } from '@/state/app-store';

import { useDb } from './database';
import { emitLocalDataChanged } from './events';
import { qk } from './query-client';

export interface HabitData {
  contexts: HabitContext[];
  lists: HabitList[];
  reminders: Reminder[];
  completions: Completion[];
  records: RecordsByHabit;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export function useHabitData(): HabitData {
  const db = useDb();
  const contexts = useQuery({ queryKey: qk.habits, queryFn: () => habits.getHabitContexts(db) });
  const comps = useQuery({ queryKey: qk.completions, queryFn: () => completions.getCompletions(db) });
  const listsQ = useQuery({ queryKey: qk.lists, queryFn: () => lists.getLists(db) });
  const reminders = useQuery({ queryKey: qk.reminders, queryFn: () => habits.getReminders(db) });

  const records = useMemo(() => buildRecordsByHabit(comps.data ?? []), [comps.data]);

  return {
    contexts: contexts.data ?? [],
    lists: listsQ.data ?? [],
    reminders: reminders.data ?? [],
    completions: comps.data ?? [],
    records,
    isLoading: contexts.isLoading || comps.isLoading || listsQ.isLoading || reminders.isLoading,
    error: contexts.error ?? comps.error ?? listsQ.error ?? reminders.error,
    refetch: () => {
      void contexts.refetch();
      void comps.refetch();
      void listsQ.refetch();
      void reminders.refetch();
    },
  };
}

/**
 * All write operations. Each one persists to SQLite first (the source of truth),
 * then refreshes the affected queries and notifies background services.
 * Completion changes are applied optimistically so one-tap logging feels instant.
 */
export function useActions() {
  const db = useDb();
  const qc = useQueryClient();

  const refresh = useCallback(
    async (...keys: (readonly string[])[]) => {
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
      emitLocalDataChanged();
    },
    [qc],
  );

  const run = useCallback(
    /** Resolves to the result (or `true` for void operations) on success, `null` on failure. */
    async <T>(
      fn: () => Promise<T>,
      keys: (readonly string[])[],
      success?: string,
    ): Promise<NonNullable<T> | true | null> => {
      try {
        const result = await fn();
        await refresh(...keys);
        if (success) showToast({ message: success });
        return result ?? true;
      } catch (error) {
        showToast({ message: errorMessage(error), tone: 'error' });
        return null;
      }
    },
    [refresh],
  );

  /** Optimistically patches the completions cache, rolling back on failure. */
  const optimistic = useCallback(
    async (habitId: string, date: LocalDate, next: Completion | null, write: () => Promise<void>) => {
      const prev = qc.getQueryData<Completion[]>(qk.completions) ?? [];
      const others = prev.filter((c) => !(c.habitId === habitId && c.date === date));
      qc.setQueryData<Completion[]>(qk.completions, next ? [...others, next] : others);
      try {
        await write();
        await refresh(qk.completions);
        return true;
      } catch (error) {
        qc.setQueryData(qk.completions, prev);
        showToast({ message: errorMessage(error), tone: 'error' });
        return false;
      }
    },
    [qc, refresh],
  );

  const draft = (habitId: string, date: LocalDate, status: CompletionStatus, value: number | null, note = '') => {
    const ts = nowIso();
    return { habitId, date, status, value, note, createdAt: ts, updatedAt: ts, deletedAt: null };
  };

  return {
    toggleDone: (habit: Habit, date: LocalDate, current: Completion | null) => {
      const next =
        current?.status === 'done'
          ? null
          : draft(habit.id, date, 'done', habit.kind === 'numeric' ? (habit.target ?? 1) : null, current?.note);
      return optimistic(habit.id, date, next, () => completions.toggleDone(db, habit, date, current));
    },
    setStatus: (habit: Habit, date: LocalDate, status: CompletionStatus, current: Completion | null) =>
      optimistic(habit.id, date, draft(habit.id, date, status, current?.value ?? null, current?.note), () =>
        completions.setCompletion(db, habit.id, date, { status, value: current?.value ?? null, note: current?.note }),
      ),
    clear: (habitId: string, date: LocalDate) =>
      optimistic(habitId, date, null, () => completions.clearCompletion(db, habitId, date)),
    /** Puts back a previous record exactly (used by "Undo"). */
    restoreRecord: (record: Completion) =>
      optimistic(record.habitId, record.date, record, () =>
        completions.setCompletion(db, record.habitId, record.date, {
          status: record.status,
          value: record.value,
          note: record.note,
        }),
      ),
    logValue: (habitId: string, date: LocalDate, value: number, note?: string) =>
      run(() => completions.logValue(db, habitId, date, value, note), [qk.completions]),
    setNote: (habitId: string, date: LocalDate, current: Completion, note: string) =>
      run(
        () => completions.setCompletion(db, habitId, date, { status: current.status, value: current.value, note }),
        [qk.completions],
      ),

    createHabit: (input: habits.HabitInput) =>
      run(() => habits.createHabit(db, input), [qk.habits, qk.reminders]),
    updateHabit: (id: string, input: habits.HabitInput, applyFrom: habits.ScheduleApplyFrom) =>
      run(() => habits.updateHabit(db, id, input, applyFrom), [qk.habits, qk.reminders], 'Habit saved'),
    duplicateHabit: (id: string) =>
      run(() => habits.duplicateHabit(db, id), [qk.habits, qk.reminders], 'Habit duplicated'),
    archiveHabit: (id: string) => run(() => habits.archiveHabit(db, id), [qk.habits], 'Habit archived'),
    restoreHabit: (id: string) => run(() => habits.restoreHabit(db, id), [qk.habits], 'Habit restored'),
    deleteHabit: (id: string) =>
      run(() => habits.deleteHabit(db, id), [qk.habits, qk.reminders, qk.completions], 'Habit deleted'),
    reorderHabits: (ids: string[]) => run(() => habits.reorderHabits(db, ids), [qk.habits]),

    createList: (input: ListFormValues) => run(() => lists.createList(db, input), [qk.lists]),
    updateList: (id: string, input: ListFormValues) =>
      run(() => lists.updateList(db, id, input), [qk.lists], 'List saved'),
    archiveList: (id: string) => run(() => lists.archiveList(db, id), [qk.lists, qk.habits], 'List archived'),
    restoreList: (id: string) => run(() => lists.restoreList(db, id), [qk.lists, qk.habits], 'List restored'),
    deleteList: (id: string, moveHabitsTo: string | null) =>
      run(
        () => lists.deleteList(db, id, moveHabitsTo),
        [qk.lists, qk.habits, qk.reminders, qk.completions],
        'List deleted',
      ),
    reorderLists: (ids: string[]) => run(() => lists.reorderLists(db, ids), [qk.lists]),

    exportBackup: () => backup.exportBackup(db),
    exportCsv: () => backup.exportCompletionsCsv(db),
    restoreBackup: (raw: unknown) =>
      run(() => backup.restoreBackup(db, raw), [qk.lists, qk.habits, qk.reminders, qk.completions]),

    /** Re-reads everything from disk (after sync pulls or restores). */
    reloadAll: () => refresh(qk.lists, qk.habits, qk.reminders, qk.completions),
  };
}

export function useUpdateSettings() {
  const db = useDb();
  return useCallback(
    async (patch: Partial<UserSettings>) => {
      const prev = useAppStore.getState().settings;
      useAppStore.getState().setSettings({ ...prev, ...patch });
      try {
        await updateSettings(db, patch);
        useAppStore.getState().setSettings(await getSettings(db));
        emitLocalDataChanged();
      } catch (error) {
        useAppStore.getState().setSettings(prev);
        showToast({ message: errorMessage(error), tone: 'error' });
      }
    },
    [db],
  );
}

export function useSettings(): UserSettings {
  return useAppStore((s) => s.settings);
}
