import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';

import { ActionSheet, type SheetAction } from '@/components/ui/action-sheet';
import { useActions } from '@/data/hooks';
import { formatLocalDate } from '@/domain/dates';
import type { DayItem } from '@/domain/stats';
import type { Completion, Habit, LocalDate } from '@/domain/types';
import { haptics } from '@/lib/haptics';
import { showToast } from '@/state/app-store';

import type { HabitRowHandlers } from './habit-row';
import { NoteSheet } from './note-sheet';
import { ValueSheet } from './value-sheet';

interface Target {
  habit: Habit;
  date: LocalDate;
  record: Completion | null;
}

/**
 * Shared completion interactions (tap, long-press menu, numeric entry) used by
 * Today, Calendar and Habit details so behaviour is identical everywhere.
 */
export function useHabitInteractions(today: LocalDate): {
  handlersFor: (date: LocalDate) => HabitRowHandlers;
  toggle: (habit: Habit, date: LocalDate, record: Completion | null) => void;
  openMenu: (habit: Habit, date: LocalDate, record: Completion | null) => void;
  sheets: ReactNode;
} {
  const actions = useActions();
  const [menu, setMenu] = useState<Target | null>(null);
  const [value, setValue] = useState<Target | null>(null);

  const toggle = (habit: Habit, date: LocalDate, record: Completion | null) => {
    if (date > today) {
      haptics.warning();
      showToast({ message: 'You can log this day when it arrives.' });
      return;
    }
    if (habit.kind === 'numeric' && record?.status !== 'done' && habit.targetDirection === 'atMost') {
      // For limits, "done" requires an actual value.
      setValue({ habit, date, record });
      return;
    }
    haptics.toggle(record?.status !== 'done');
    void actions.toggleDone(habit, date, record).then((ok) => {
      if (ok && record?.status === 'done') {
        showToast({ message: `${habit.name}: completion removed`, actionLabel: 'Undo', onAction: () => void actions.restoreRecord(record) });
      }
    });
  };

  const openMenu = (habit: Habit, date: LocalDate, record: Completion | null) => {
    haptics.longPress();
    setMenu({ habit, date, record });
  };

  const menuActions = (t: Target): SheetAction[] => {
    const { habit, date, record } = t;
    const future = date > today;
    const list: SheetAction[] = [];
    if (!future) {
      list.push(
        record?.status === 'done'
          ? { label: 'Undo completion', icon: 'undo', onPress: () => toggle(habit, date, record) }
          : { label: 'Mark done', icon: 'check', onPress: () => toggle(habit, date, record) },
      );
      if (habit.kind === 'numeric') {
        list.push({ label: `Log ${habit.unit || 'value'}…`, icon: 'edit', onPress: () => setValue(t) });
      }
    }
    list.push(
      record?.status === 'skipped'
        ? { label: 'Unskip', icon: 'undo', onPress: () => void actions.clear(habit.id, date) }
        : { label: future ? 'Skip this day (planned)' : 'Skip (doesn’t break streak)', icon: 'skip', onPress: () => void actions.setStatus(habit, date, 'skipped', record) },
    );
    if (!future && record?.status !== 'missed') {
      list.push({ label: 'Mark as missed', icon: 'missed', onPress: () => void actions.setStatus(habit, date, 'missed', record) });
    }
    if (habit.kind !== 'numeric' && record && !future) {
      list.push({ label: record.note ? 'Edit note…' : 'Add note…', icon: 'edit', onPress: () => setValue(t) });
    }
    if (record) {
      list.push({
        label: 'Clear this day',
        icon: 'delete',
        destructive: true,
        onPress: () =>
          void actions.clear(habit.id, date).then((ok) => {
            if (ok) showToast({ message: 'Day cleared', actionLabel: 'Undo', onAction: () => void actions.restoreRecord(record) });
          }),
      });
    }
    list.push({ label: 'Habit details', icon: 'insights', onPress: () => router.push({ pathname: '/habit/[id]', params: { id: habit.id } }) });
    list.push({ label: 'Edit habit', icon: 'edit', onPress: () => router.push({ pathname: '/habit/edit', params: { id: habit.id } }) });
    return list;
  };

  const handlersFor = (date: LocalDate): HabitRowHandlers => ({
    onToggle: (item: DayItem) => toggle(item.ctx.habit, date, item.record),
    onOpenMenu: (item: DayItem) => openMenu(item.ctx.habit, date, item.record),
    onOpenValue: (item: DayItem) => setValue({ habit: item.ctx.habit, date, record: item.record }),
    onOpenDetails: (item: DayItem) => router.push({ pathname: '/habit/[id]', params: { id: item.ctx.habit.id } }),
  });

  const sheets = (
    <>
      <ActionSheet
        visible={!!menu}
        onClose={() => setMenu(null)}
        title={menu?.habit.name}
        titleIcon={menu ? { icon: menu.habit.icon, color: menu.habit.color } : undefined}
        subtitle={menu ? formatLocalDate(menu.date, { weekday: 'long', month: 'long', day: 'numeric' }) : undefined}
        actions={menu ? menuActions(menu) : []}
      />
      {value && value.habit.kind === 'numeric' ? (
        <ValueSheet
          key={`${value.habit.id}:${value.date}`}
          habit={value.habit}
          date={value.date}
          record={value.record}
          onClose={() => setValue(null)}
          onSave={(v, note) => void actions.logValue(value.habit.id, value.date, v, note)}
        />
      ) : value && value.record ? (
        <NoteSheet key={`${value.habit.id}:${value.date}`} target={value} onClose={() => setValue(null)} onSave={(note) => void actions.setNote(value.habit.id, value.date, value.record!, note)} />
      ) : null}
    </>
  );

  return { handlersFor, toggle, openMenu, sheets };
}

