import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { BarChart, StatTile } from '@/components/charts/charts';
import { HabitCalendar } from '@/components/habit/habit-calendar';
import { formatNumber } from '@/components/habit/habit-row';
import { useHabitInteractions } from '@/components/habit/use-habit-interactions';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button, IconButton } from '@/components/ui/button';
import { Row } from '@/components/ui/controls';
import { HabitIcon } from '@/components/ui/habit-icon';
import { Card, Divider, EmptyState, Notice, Screen, SectionHeader } from '@/components/ui/layout';
import { HabitDetailSkeleton } from '@/components/ui/screen-skeletons';
import { Text } from '@/components/ui/text';
import { CATEGORY_LABELS, TIME_OF_DAY_LABELS } from '@/constants/palette';
import { useActions, useHabitData, useSettings } from '@/data/hooks';
import { addDays, formatLocalDate, formatTimeLabel, startOfMonth, weekdayShortName } from '@/domain/dates';
import { describeRule, versionOn } from '@/domain/schedule';
import { evaluateHabit, type HabitStats } from '@/domain/stats';
import { useToday } from '@/hooks/use-today';
import { haptics } from '@/lib/haptics';
import { spacing } from '@/theme/tokens';

const EMPTY = new Map();

function streakLabel(n: number, unit: HabitStats['streakUnit']) {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useHabitData();
  const settings = useSettings();
  const actions = useActions();
  const today = useToday();
  const [month, setMonth] = useState(startOfMonth(today));
  const [menuOpen, setMenuOpen] = useState(false);
  const { openMenu, sheets } = useHabitInteractions(today);

  const ctx = data.contexts.find((c) => c.habit.id === id);
  const records = (ctx && data.records.get(ctx.habit.id)) || EMPTY;
  const list = data.lists.find((l) => l.id === ctx?.habit.listId);
  const reminders = data.reminders.filter((r) => r.habitId === id);

  const stats = useMemo(() => {
    if (!ctx) return null;
    const opts = { today, firstDayOfWeek: settings.firstDayOfWeek };
    return {
      last30: evaluateHabit(ctx, records, { ...opts, from: addDays(today, -29), to: today }),
      all: evaluateHabit(ctx, records, { ...opts, from: ctx.habit.startDate, to: today }),
    };
  }, [ctx, records, today, settings.firstDayOfWeek]);

  if (data.isLoading) return <HabitDetailSkeleton />;
  if (!ctx || !stats) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Habit' }} />
        <EmptyState icon="info" title="This habit no longer exists" message="It may have been deleted on this or another device." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const { habit } = ctx;
  const rule = versionOn(ctx, today < habit.startDate ? habit.startDate : today).version.rule;
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));

  const confirmDelete = () => {
    haptics.warning();
    Alert.alert(`Delete “${habit.name}”?`, 'This permanently removes the habit and its entire history. To keep the history, archive it instead.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void actions.deleteHabit(habit.id).then((ok) => ok && router.back()) },
    ]);
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: habit.name,
          headerRight: () => <IconButton icon="more" label="Habit actions" onPress={() => setMenuOpen(true)} />,
        }}
      />
      <Screen>
        <View style={styles.hero}>
          <HabitIcon icon={habit.icon} color={habit.color} size={64} />
          <View style={styles.flex}>
            <Text variant="title" accessibilityRole="header">
              {habit.name}
            </Text>
            <Text variant="caption" tone="secondary">
              {[list ? list.name : null, describeRule(rule, (d) => weekdayShortName(d as 0)), TIME_OF_DAY_LABELS[habit.timeOfDay]]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {habit.kind === 'numeric' && habit.target != null && (
              <Text variant="caption" tone="secondary">
                Goal: {habit.targetDirection === 'atMost' ? 'at most' : 'at least'} {formatNumber(habit.target)} {habit.unit}
              </Text>
            )}
          </View>
        </View>

        {habit.description ? <Text tone="secondary">{habit.description}</Text> : null}
        {habit.archivedOn && (
          <Notice
            icon="archive"
            title="Archived"
            message={`Archived on ${formatLocalDate(habit.archivedOn, { month: 'long', day: 'numeric', year: 'numeric' })}. History is kept; it no longer appears on Today or sends reminders.`}
            action={<Button title="Restore" variant="ghost" size="sm" onPress={() => void actions.restoreHabit(habit.id)} />}
          />
        )}

        <View style={styles.tiles}>
          <StatTile label="Current streak" value={streakLabel(stats.all.currentStreak, stats.all.streakUnit)} />
          <StatTile label="Best streak" value={streakLabel(stats.all.bestStreak, stats.all.streakUnit)} />
        </View>
        <View style={styles.tiles}>
          <StatTile label="Last 30 days" value={pct(stats.last30.rate)} hint={`${stats.last30.successes} of ${stats.last30.opportunities}`} />
          <StatTile
            label={habit.kind === 'numeric' ? `Total ${habit.unit || ''}`.trim() : 'All time'}
            value={habit.kind === 'numeric' ? formatNumber(stats.all.totalValue) : pct(stats.all.rate)}
            hint={`${stats.all.totalDone} days done${stats.all.skipped ? ` · ${stats.all.skipped} skipped` : ''}`}
          />
        </View>

        <SectionHeader title="History" />
        <Card>
          <HabitCalendar
            ctx={ctx}
            records={records}
            month={month}
            onMonthChange={setMonth}
            today={today}
            firstDayOfWeek={settings.firstDayOfWeek}
            onSelectDay={(d) => openMenu(habit, d, records.get(d) ?? null)}
          />
          <Text variant="caption" tone="tertiary" style={styles.hint}>
            Tap any past day to log, skip or correct it. Stats update immediately.
          </Text>
        </Card>

        {habit.kind === 'numeric' && habit.target != null && (
          <>
            <SectionHeader title="Last 14 days" />
            <Card>
              <BarChart
                points={last14.map((d) => {
                  const v = records.get(d)?.value;
                  return { key: d, percent: v == null ? null : Math.min(1, v / habit.target!) };
                })}
                labelFor={(d, i) => (i % 2 === 0 ? formatLocalDate(d, { day: 'numeric' }) : '')}
                color={habit.color}
                summary={`Logged values for the last 14 days relative to the goal of ${habit.target} ${habit.unit}`}
              />
            </Card>
          </>
        )}

        <SectionHeader title="Reminders" />
        <Card padded={false}>
          {reminders.length === 0 ? (
            <Row icon="bellOff" title="No reminders" subtitle="Add one from Edit" onPress={() => router.push({ pathname: '/habit/edit', params: { id: habit.id } })} />
          ) : (
            reminders.map((r, i) => (
              <View key={r.id}>
                {i > 0 && <Divider inset={spacing.lg} />}
                <Row
                  icon={r.enabled ? 'bell' : 'bellOff'}
                  title={formatTimeLabel(r.time)}
                  subtitle={r.weekdays ? r.weekdays.map((d) => weekdayShortName(d)).join(', ') : 'Whenever scheduled'}
                  value={r.enabled ? undefined : 'Off'}
                />
              </View>
            ))
          )}
        </Card>

        <Text variant="caption" tone="tertiary" style={styles.center}>
          {CATEGORY_LABELS[habit.category]} · Started {formatLocalDate(habit.startDate, { month: 'short', day: 'numeric', year: 'numeric' })}
          {habit.endDate ? ` · Ends ${formatLocalDate(habit.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
        </Text>
      </Screen>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={habit.name}
        titleIcon={{ icon: habit.icon, color: habit.color }}
        actions={[
          { label: 'Edit', icon: 'edit', onPress: () => router.push({ pathname: '/habit/edit', params: { id: habit.id } }) },
          { label: 'Duplicate', icon: 'duplicate', onPress: () => void actions.duplicateHabit(habit.id) },
          habit.archivedOn
            ? { label: 'Restore', icon: 'unarchive', onPress: () => void actions.restoreHabit(habit.id) }
            : { label: 'Archive', icon: 'archive', onPress: () => void actions.archiveHabit(habit.id) },
          { label: 'Delete', icon: 'delete', destructive: true, onPress: confirmDelete },
        ]}
      />
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  tiles: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  hint: { marginTop: spacing.md },
  center: { textAlign: 'center' },
});
