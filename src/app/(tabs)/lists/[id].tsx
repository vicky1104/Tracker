import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { StatTile } from '@/components/charts/charts';
import { HabitSummaryRow } from '@/components/habit/habit-summary-row';
import { listMenuActions } from '@/components/list/list-actions';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button, IconButton } from '@/components/ui/button';
import { HabitGlyph } from '@/components/ui/habit-icon';
import { Card, Divider, EmptyState, LoadingState, Notice, SectionHeader } from '@/components/ui/layout';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ReorderableList } from '@/components/ui/reorderable-list';
import { Text } from '@/components/ui/text';
import { useActions, useHabitData, useSettings } from '@/data/hooks';
import { addDays } from '@/domain/dates';
import { aggregateRate, dailySeries, evaluateHabit } from '@/domain/stats';
import { useListStats } from '@/hooks/use-list-stats';
import { useToday } from '@/hooks/use-today';
import { useAppStore } from '@/state/app-store';
import { useTheme } from '@/theme/theme';
import { MAX_CONTENT_WIDTH, spacing } from '@/theme/tokens';

const pct = (p: number | null) => (p == null ? '—' : `${Math.round(p * 100)}%`);

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const today = useToday();
  const data = useHabitData();
  const settings = useSettings();
  const actions = useActions();
  const { byList } = useListStats(today);
  const setSelectedListId = useAppStore((s) => s.setSelectedListId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [dragging, setDragging] = useState(false);

  const list = data.lists.find((l) => l.id === id);
  const habits = useMemo(() => data.contexts.filter((c) => c.habit.listId === id), [data.contexts, id]);
  const active = habits.filter((c) => !c.habit.archivedOn);
  const archived = habits.filter((c) => c.habit.archivedOn);

  const month = useMemo(
    () => aggregateRate(dailySeries(active, data.records, addDays(today, -29), today, today, settings.firstDayOfWeek)).rate,
    [active, data.records, today, settings.firstDayOfWeek],
  );
  const streaks = useMemo(
    () =>
      new Map(
        active.map((c) => [
          c.habit.id,
          evaluateHabit(c, data.records.get(c.habit.id) ?? new Map(), {
            from: today,
            to: today,
            today,
            firstDayOfWeek: settings.firstDayOfWeek,
          }),
        ]),
      ),
    [active, data.records, today, settings.firstDayOfWeek],
  );

  if (data.isLoading) return <LoadingState />;
  if (!list) {
    return <EmptyState icon="info" title="This list no longer exists" actionLabel="Back to lists" onAction={() => router.back()} />;
  }
  const stats = byList.get(list.id);

  return (
    <>
      <Stack.Screen
        options={{
          title: list.name,
          headerLargeTitle: false,
          headerRight: () => <IconButton icon="more" label="List options" onPress={() => setMenuOpen(true)} />,
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        scrollEnabled={!dragging}>
        {list.archivedOn && (
          <Notice
            icon="archive"
            title="Archived list"
            message="Its habits are hidden from Today and don’t send reminders. History is kept."
            action={<Button title="Restore" variant="ghost" size="sm" onPress={() => void actions.restoreList(list.id)} />}
          />
        )}
        <View style={styles.tiles}>
          <StatTile label="Today" value={pct(stats?.today.percent ?? null)} hint={`${stats?.today.done ?? 0} of ${stats?.today.due ?? 0}`} />
          <StatTile label="7 days" value={pct(stats?.week ?? null)} />
          <StatTile label="30 days" value={pct(month)} />
        </View>
        <ProgressBar value={stats?.today.percent ?? 0} color={list.color} label={`${list.name} today`} />

        <View style={styles.row}>
          <Button
            title="Open in Today"
            icon="today"
            variant="secondary"
            size="sm"
            onPress={() => {
              setSelectedListId(list.id);
              router.navigate('/today');
            }}
          />
          {active.length > 1 && (
            <Button title={reordering ? 'Done' : 'Reorder'} icon="drag" variant="secondary" size="sm" onPress={() => setReordering((r) => !r)} />
          )}
        </View>

        <SectionHeader title={`Habits (${active.length})`} />
        {active.length === 0 ? (
          <EmptyState
            habitIcon={list.icon}
            title="No habits in this list yet"
            actionLabel="Add a habit"
            onAction={() => router.push({ pathname: '/habit/edit', params: { listId: list.id } })}
          />
        ) : reordering ? (
          <Card padded={false}>
            <ReorderableList
              items={active}
              keyOf={(c) => c.habit.id}
              labelOf={(c) => c.habit.name}
              onDragActive={setDragging}
              onReorder={(next) => void actions.reorderHabits([...next, ...archived].map((c) => c.habit.id))}
              renderItem={(c) => (
                <View style={styles.reorderRow}>
                  <HabitGlyph icon={c.habit.icon} color={c.habit.color} size={20} />
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                    {c.habit.name}
                  </Text>
                </View>
              )}
            />
          </Card>
        ) : (
          <Card padded={false}>
            {active.map((c, i) => {
              const s = streaks.get(c.habit.id);
              return (
                <View key={c.habit.id}>
                  {i > 0 && <Divider inset={spacing.lg} />}
                  <HabitSummaryRow
                    ctx={c}
                    today={today}
                    trailingNode={
                      s && s.currentStreak > 0 ? (
                        <View style={styles.streak} accessibilityLabel={`${s.currentStreak} ${s.streakUnit} streak`}>
                          <HabitGlyph icon="flame" size={14} color={colors.warning} />
                          <Text variant="captionStrong" tone="secondary">
                            {s.currentStreak}
                          </Text>
                        </View>
                      ) : undefined
                    }
                  />
                </View>
              );
            })}
          </Card>
        )}
        {active.length > 0 && !reordering && (
          <Button title="Add habit" icon="add" variant="secondary" onPress={() => router.push({ pathname: '/habit/edit', params: { listId: list.id } })} />
        )}

        {archived.length > 0 && (
          <>
            <SectionHeader title={`Archived (${archived.length})`} />
            <Card padded={false}>
              {archived.map((c, i) => (
                <View key={c.habit.id}>
                  {i > 0 && <Divider inset={spacing.lg} />}
                  <HabitSummaryRow ctx={c} today={today} subtitle="Archived — history kept" />
                </View>
              ))}
            </Card>
          </>
        )}
        <Text variant="caption" tone="tertiary" style={styles.center}>
          Each habit keeps its own schedule. List progress counts only habits scheduled for that day.
        </Text>
      </ScrollView>
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={list.name}
        titleIcon={{ icon: list.icon, color: list.color }}
        actions={listMenuActions(list, data.lists, habits.length, actions, () => router.back())}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl * 2, gap: spacing.lg, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  tiles: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  reorderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  center: { textAlign: 'center' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
