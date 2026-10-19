import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/charts/charts';
import { DaySelector } from '@/components/habit/day-selector';
import { HabitRow } from '@/components/habit/habit-row';
import { useHabitInteractions } from '@/components/habit/use-habit-interactions';
import { IconButton } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/controls';
import { Card, Divider, EmptyState, ErrorState, LoadingState, Screen, SectionHeader } from '@/components/ui/layout';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { TIME_OF_DAY_LABELS } from '@/constants/palette';
import { useHabitData, useSettings } from '@/data/hooks';
import { addDays, dateRange, formatLocalDate, minDate, startOfWeek } from '@/domain/dates';
import { isActiveOn } from '@/domain/schedule';
import { daySummary, type DayItem } from '@/domain/stats';
import type { TimeOfDay } from '@/domain/types';
import { useToday } from '@/hooks/use-today';
import { errorMessage } from '@/lib/errors';
import { now } from '@/lib/clock';
import { useAppStore } from '@/state/app-store';
import { useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

const SECTION_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];
const DAY_STRIP_PAST = 60;

function greeting(): string {
  const h = now().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  const { colors } = useTheme();
  const today = useToday();
  const settings = useSettings();
  const selectedDate = useAppStore((s) => s.selectedDate) ?? today;
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const selectedListId = useAppStore((s) => s.selectedListId);
  const setSelectedListId = useAppStore((s) => s.setSelectedListId);
  const data = useHabitData();
  const { handlersFor, sheets } = useHabitInteractions(today);

  const activeLists = useMemo(() => data.lists.filter((l) => !l.archivedOn), [data.lists]);
  const listOrder = useMemo(() => new Map(data.lists.map((l) => [l.id, l.sortOrder])), [data.lists]);
  const listId = selectedListId !== 'all' && activeLists.some((l) => l.id === selectedListId) ? selectedListId : 'all';

  const contexts = useMemo(() => {
    const filtered = listId === 'all' ? data.contexts : data.contexts.filter((c) => c.habit.listId === listId);
    return [...filtered].sort(
      (a, b) =>
        (listOrder.get(a.habit.listId) ?? 0) - (listOrder.get(b.habit.listId) ?? 0) ||
        a.habit.sortOrder - b.habit.sortOrder,
    );
  }, [data.contexts, listId, listOrder]);

  const fdw = settings.firstDayOfWeek;
  const summary = useMemo(
    () => daySummary(contexts, data.records, selectedDate, today, fdw),
    [contexts, data.records, selectedDate, today, fdw],
  );

  const weekStart = startOfWeek(selectedDate, fdw);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Daily percentages for the day strip and the week chart, computed once per data change.
  const stripFrom = minDate(addDays(today, -DAY_STRIP_PAST), weekStart);
  const percents = useMemo(
    () =>
      new Map(
        dateRange(stripFrom, today).map((d) => [d, daySummary(contexts, data.records, d, today, fdw).percent] as const),
      ),
    [contexts, data.records, today, fdw, stripFrom],
  );
  const percentFor = (d: string) => percents.get(d) ?? null;

  const sections = useMemo(() => {
    const groups = new Map<TimeOfDay, DayItem[]>();
    for (const item of summary.items) {
      const arr = groups.get(item.ctx.habit.timeOfDay) ?? [];
      arr.push(item);
      groups.set(item.ctx.habit.timeOfDay, arr);
    }
    return SECTION_ORDER.filter((t) => groups.has(t)).map((t) => ({ key: t, items: groups.get(t)! }));
  }, [summary.items]);

  if (data.isLoading) return <LoadingState />;
  if (data.error) return <ErrorState message={errorMessage(data.error)} onRetry={data.refetch} />;

  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;
  const anyHabits = data.contexts.some((c) => isActiveOn(c, today) || c.habit.startDate > today);
  const pct = summary.percent;
  const remaining = summary.due - summary.done;
  const handlers = handlersFor(selectedDate);
  const newHabit = () =>
    router.push({ pathname: '/habit/edit', params: listId !== 'all' ? { listId } : {} });

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <Screen headerless refreshing={false} onRefresh={data.refetch}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text variant="caption" tone="secondary">
              {formatLocalDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            <Text variant="display" accessibilityRole="header">
              {isToday ? greeting() : isFuture ? 'Upcoming' : 'Looking back'}
            </Text>
          </View>
          <IconButton icon="sparkles" label="Habit planner" onPress={() => router.push('/planner')} />
          <IconButton icon="add" label="New habit" filled onPress={newHabit} />
        </View>

        <DaySelector today={today} selected={selectedDate} onSelect={(d) => setSelectedDate(d === today ? null : d)} percentFor={percentFor} />

        {!isToday && (
          <Chip label="Back to today" selected={false} onPress={() => setSelectedDate(null)} />
        )}

        {anyHabits && (
          <Card>
            <View style={styles.progressTop}>
              <View style={styles.flex}>
                <Text variant="title" accessibilityLabel={pct == null ? 'Nothing due' : `${Math.round(pct * 100)} percent complete`}>
                  {pct == null ? '—' : `${Math.round(pct * 100)}%`}
                </Text>
                <Text variant="caption" tone="secondary">
                  {summary.due === 0
                    ? isFuture
                      ? 'Nothing scheduled'
                      : 'Nothing due — enjoy the day'
                    : `${summary.done} of ${summary.due} done${remaining > 0 ? ` · ${remaining} left` : ' · all done'}${
                        summary.skipped ? ` · ${summary.skipped} skipped` : ''
                      }`}
                </Text>
              </View>
              <View style={styles.week}>
                <BarChart
                  height={40}
                  points={week.map((d) => ({ key: d, percent: d > today ? null : percentFor(d) }))}
                  labelFor={(d) => formatLocalDate(d, { weekday: 'narrow' })}
                  selected={selectedDate}
                  onSelect={(d) => setSelectedDate(d === today ? null : d)}
                  summary="This week's daily completion"
                />
              </View>
            </View>
            <ProgressBar value={pct ?? 0} label="Daily completion" />
          </Card>
        )}

        {activeLists.length > 1 && (
          <ChipRow>
            <Chip label="All lists" selected={listId === 'all'} onPress={() => setSelectedListId('all')} />
            {activeLists.map((l) => (
              <Chip
                key={l.id}
                label={l.name}
                icon={l.icon}
                selected={listId === l.id}
                color={l.color}
                onPress={() => setSelectedListId(l.id)}
              />
            ))}
          </ChipRow>
        )}

        {!anyHabits ? (
          <EmptyState
            habitIcon="plant"
            title="Start with one small habit"
            message="Pick something you can do in under two minutes. You can add more any time — or let the planner suggest a few."
            actionLabel="Create a habit"
            onAction={newHabit}
          />
        ) : sections.length === 0 ? (
          <EmptyState
            habitIcon={isFuture ? 'calendar' : 'coffee'}
            title={isFuture ? 'Nothing scheduled for this day' : 'No habits scheduled'}
            message={listId === 'all' ? 'Habits only appear on the days they are scheduled.' : 'Nothing in this list is scheduled for this day.'}
          />
        ) : (
          sections.map((section) => (
            <View key={section.key} style={styles.section}>
              <SectionHeader title={TIME_OF_DAY_LABELS[section.key]} />
              <Card padded={false}>
                {section.items.map((item, i) => (
                  <View key={item.ctx.habit.id}>
                    {i > 0 && <Divider inset={spacing.lg} />}
                    <HabitRow item={item} handlers={handlers} readOnly={isFuture} />
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}
        {isFuture && sections.length > 0 && (
          <Text variant="caption" tone="tertiary" style={styles.center}>
            Future days can be skipped in advance from the ⋯ menu. Logging opens on the day.
          </Text>
        )}
      </Screen>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  progressTop: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg, marginBottom: spacing.md },
  week: { width: 150 },
  section: { gap: spacing.md },
  center: { textAlign: 'center' },
});
