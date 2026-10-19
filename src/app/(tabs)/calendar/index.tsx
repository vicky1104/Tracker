import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Legend, MonthGrid, monthTitle, type DayCellStyle } from '@/components/charts/charts';
import { habitCell } from '@/components/habit/habit-calendar';
import { HabitRow } from '@/components/habit/habit-row';
import { useHabitInteractions } from '@/components/habit/use-habit-interactions';
import { Button, IconButton } from '@/components/ui/button';
import { Chip, ChipRow, SegmentedControl } from '@/components/ui/controls';
import { HabitGlyph } from '@/components/ui/habit-icon';
import { Card, Divider, EmptyState, ErrorState, LoadingState, Screen, SectionHeader } from '@/components/ui/layout';
import { TabHeader } from '@/components/ui/tab-header';
import { Text } from '@/components/ui/text';
import { useHabitData, useSettings } from '@/data/hooks';
import { addDays, addMonths, endOfMonth, endOfWeek, formatLocalDate, startOfMonth, startOfWeek } from '@/domain/dates';
import { isActiveOn } from '@/domain/schedule';
import { daySummary } from '@/domain/stats';
import type { LocalDate } from '@/domain/types';
import { useToday } from '@/hooks/use-today';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/theme';
import { MIN_TOUCH, radius, spacing, withAlpha } from '@/theme/tokens';

type Mode = 'month' | 'week';

export default function CalendarScreen() {
  const { colors } = useTheme();
  const today = useToday();
  const settings = useSettings();
  const data = useHabitData();
  const { handlersFor, toggle, openMenu, sheets } = useHabitInteractions(today);
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(startOfMonth(today));
  const [weekStart, setWeekStart] = useState(startOfWeek(today, settings.firstDayOfWeek));
  const [selected, setSelected] = useState<LocalDate>(today);
  const [listId, setListId] = useState<string | null>(null);
  const fdw = settings.firstDayOfWeek;

  const contexts = useMemo(
    () => (listId ? data.contexts.filter((c) => c.habit.listId === listId) : data.contexts),
    [data.contexts, listId],
  );
  // Summaries for every day currently visible (month grid, week strip, selected day).
  const summaries = useMemo(() => {
    const days = new Set<LocalDate>([selected]);
    const first = startOfMonth(month);
    for (let d = first; d <= endOfMonth(first); d = addDays(d, 1)) days.add(d);
    for (let i = 0; i < 7; i++) days.add(addDays(weekStart, i));
    const m = new Map<LocalDate, ReturnType<typeof daySummary>>();
    for (const d of days) m.set(d, daySummary(contexts, data.records, d, today, fdw));
    return m;
  }, [contexts, data.records, today, fdw, month, weekStart, selected]);
  const summaryFor = (d: LocalDate) => summaries.get(d) ?? daySummary(contexts, data.records, d, today, fdw);

  if (data.isLoading) return <LoadingState />;
  if (data.error) return <ErrorState message={errorMessage(data.error)} onRetry={data.refetch} />;

  const dayCell = (d: LocalDate): DayCellStyle => {
    if (d > today) return { percent: null, label: 'upcoming', muted: true };
    const s = summaryFor(d);
    if (s.due === 0) {
      return s.skipped > 0
        ? { percent: null, glyph: '–', label: 'all skipped' }
        : { percent: null, label: 'nothing scheduled', muted: true };
    }
    const label = `${s.done} of ${s.due} done${s.skipped ? `, ${s.skipped} skipped` : ''}`;
    const p = d === today && s.done === 0 ? null : s.percent;
    return { percent: p, glyph: s.percent === 1 ? '✓' : s.done === 0 && d < today ? '×' : undefined, label };
  };

  const selectedSummary = summaryFor(selected);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekHabits = contexts.filter((c) => week.some((d) => isActiveOn(c, d)));

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <Screen headerless>
        <TabHeader title="Calendar" />
        <SegmentedControl<Mode>
          accessibilityLabel="Calendar view"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'week', label: 'Week' },
          ]}
        />
        {data.lists.length > 1 && (
          <ChipRow>
            <Chip label="All lists" selected={listId == null} onPress={() => setListId(null)} />
            {data.lists.map((l) => (
              <Chip key={l.id} label={l.name} icon={l.icon} color={l.color} selected={listId === l.id} onPress={() => setListId(l.id)} />
            ))}
          </ChipRow>
        )}

        {mode === 'month' ? (
          <Card style={styles.gap}>
            <View style={styles.nav}>
              <IconButton icon="chevronLeft" label="Previous month" onPress={() => setMonth(addMonths(month, -1))} />
              <Text variant="heading" accessibilityRole="header" style={styles.navTitle}>
                {monthTitle(month)}
              </Text>
              <IconButton icon="chevronRight" label="Next month" onPress={() => setMonth(addMonths(month, 1))} />
            </View>
            <MonthGrid
              month={month}
              firstDayOfWeek={fdw}
              today={today}
              selected={selected}
              onSelect={setSelected}
              cellFor={dayCell}
            />
            <Legend
              items={[
                { color: colors.accent, label: 'All done', glyph: '✓' },
                { color: withAlpha(colors.accent, 0.4), label: 'Partly done' },
                { color: colors.surfaceMuted, label: 'None done', glyph: '×' },
                { color: colors.border, label: 'Skipped', glyph: '–', outline: true },
                { color: colors.border, label: 'Nothing scheduled', outline: true },
              ]}
            />
            {startOfMonth(month) !== startOfMonth(today) && (
              <Button
                title="Back to this month"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setMonth(startOfMonth(today));
                  setSelected(today);
                }}
              />
            )}
          </Card>
        ) : (
          <Card padded={false}>
            <View style={[styles.nav, styles.weekNav]}>
              <IconButton icon="chevronLeft" label="Previous week" onPress={() => setWeekStart(addDays(weekStart, -7))} />
              <Text variant="heading" accessibilityRole="header" style={styles.navTitle}>
                {formatLocalDate(weekStart, { month: 'short', day: 'numeric' })} – {formatLocalDate(endOfWeek(weekStart, fdw), { month: 'short', day: 'numeric' })}
              </Text>
              <IconButton icon="chevronRight" label="Next week" onPress={() => setWeekStart(addDays(weekStart, 7))} />
            </View>
            <View style={styles.weekHeader}>
              <View style={styles.weekName} />
              {week.map((d) => (
                <Pressable key={d} style={styles.weekCol} onPress={() => setSelected(d)} accessibilityRole="button" accessibilityLabel={`Show ${formatLocalDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}`}>
                  <Text variant="micro" tone={d === today ? 'accent' : 'tertiary'} maxFontSizeMultiplier={1.2}>
                    {formatLocalDate(d, { weekday: 'narrow' })}
                  </Text>
                  <Text variant="captionStrong" tone={d === selected ? 'accent' : 'primary'} maxFontSizeMultiplier={1.2}>
                    {formatLocalDate(d, { day: 'numeric' })}
                  </Text>
                </Pressable>
              ))}
            </View>
            {weekHabits.length === 0 ? (
              <EmptyState icon="calendar" title="No habits this week" />
            ) : (
              weekHabits.map((ctx, i) => {
                const records = data.records.get(ctx.habit.id) ?? new Map();
                return (
                  <View key={ctx.habit.id}>
                    {i > 0 && <Divider />}
                    <View style={styles.weekRow}>
                      <View style={[styles.weekName, styles.weekNameRow]}>
                        <HabitGlyph icon={ctx.habit.icon} color={ctx.habit.color} size={14} />
                        <Text numberOfLines={2} variant="caption" style={styles.flex}>
                          {ctx.habit.name}
                        </Text>
                      </View>
                      {week.map((d) => {
                        const cell = habitCell(ctx, records, d, today);
                        const record = records.get(d) ?? null;
                        const full = cell.percent === 1;
                        return (
                          <Pressable
                            key={d}
                            style={styles.weekCol}
                            onPress={() => (d > today ? openMenu(ctx.habit, d, record) : toggle(ctx.habit, d, record))}
                            onLongPress={() => openMenu(ctx.habit, d, record)}
                            disabled={cell.muted && !record}
                            accessibilityRole="button"
                            accessibilityLabel={`${ctx.habit.name}, ${formatLocalDate(d, { weekday: 'long', day: 'numeric' })}: ${cell.label}`}
                            accessibilityHint="Tap to toggle done, long press for more options">
                            <View
                              style={[
                                styles.weekCell,
                                {
                                  backgroundColor: full
                                    ? ctx.habit.color
                                    : cell.percent && cell.percent > 0
                                      ? withAlpha(ctx.habit.color, 0.35)
                                      : cell.muted
                                        ? 'transparent'
                                        : colors.surfaceMuted,
                                  borderColor: cell.muted ? colors.border : 'transparent',
                                },
                              ]}>
                              <Text variant="captionStrong" color={full ? '#FFFFFF' : colors.textSecondary} maxFontSizeMultiplier={1}>
                                {cell.glyph ?? ''}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        )}

        <SectionHeader title={formatLocalDate(selected, { weekday: 'long', month: 'long', day: 'numeric' })} />
        {selectedSummary.items.length === 0 ? (
          <Text tone="secondary">Nothing scheduled on this day.</Text>
        ) : (
          <>
            <Text variant="caption" tone="secondary">
              {selectedSummary.percent == null ? 'Nothing due' : `${Math.round(selectedSummary.percent * 100)}% · ${selectedSummary.done} of ${selectedSummary.due} done`}
              {selected < today ? ' · tap to correct this day' : ''}
            </Text>
            <Card padded={false}>
              {selectedSummary.items.map((item, i) => (
                <View key={item.ctx.habit.id}>
                  {i > 0 && <Divider inset={spacing.lg} />}
                  <HabitRow item={item} handlers={handlersFor(selected)} readOnly={selected > today} />
                </View>
              ))}
            </Card>
          </>
        )}
      </Screen>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  nav: { flexDirection: 'row', alignItems: 'center' },
  weekNav: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  navTitle: { flex: 1, textAlign: 'center' },
  weekHeader: { flexDirection: 'row', paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  weekRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  weekName: { width: 92, paddingRight: spacing.xs },
  weekNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weekCol: { flex: 1, alignItems: 'center', minHeight: MIN_TOUCH, justifyContent: 'center' },
  weekCell: { width: 30, height: 30, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
