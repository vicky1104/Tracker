import { StyleSheet, View } from 'react-native';

import { Legend, MonthGrid, monthTitle, type DayCellStyle } from '@/components/charts/charts';
import { IconButton } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { addMonths, startOfMonth } from '@/domain/dates';
import { habitDayState, type RecordMap } from '@/domain/stats';
import type { FirstDayOfWeek, HabitContext, LocalDate } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

const LABELS: Record<string, string> = {
  done: 'done',
  partial: 'partly done',
  skipped: 'skipped',
  missed: 'missed',
  pending: 'not logged yet',
  future: 'upcoming',
  unscheduled: 'not scheduled',
  inactive: 'not active',
};

export function habitCell(ctx: HabitContext, records: RecordMap, d: LocalDate, today: LocalDate): DayCellStyle {
  const record = records.get(d);
  const state = habitDayState(ctx, d, record, today);
  const target = ctx.habit.target ?? 0;
  const label = `${LABELS[state]}${record?.value != null ? `, ${record.value} ${ctx.habit.unit}` : ''}${record?.note ? `, note: ${record.note}` : ''}`;
  switch (state) {
    case 'done':
      return { percent: 1, glyph: '✓', label };
    case 'partial':
      return { percent: target > 0 && record?.value ? Math.min(0.95, record.value / target) : 0.3, glyph: '◐', label };
    case 'skipped':
      return { percent: null, glyph: '–', label };
    case 'missed':
      return { percent: 0, glyph: '×', label };
    case 'pending':
      return { percent: null, glyph: '·', label };
    default:
      return { percent: null, label, muted: true };
  }
}

/** Month view of one habit's history; tapping a day opens the edit menu for it. */
export function HabitCalendar({
  ctx,
  records,
  month,
  onMonthChange,
  today,
  firstDayOfWeek,
  onSelectDay,
}: {
  ctx: HabitContext;
  records: RecordMap;
  month: LocalDate;
  onMonthChange: (m: LocalDate) => void;
  today: LocalDate;
  firstDayOfWeek: FirstDayOfWeek;
  onSelectDay: (d: LocalDate) => void;
}) {
  const { colors } = useTheme();
  const canGoForward = startOfMonth(month) < startOfMonth(today);
  return (
    <View style={styles.wrap}>
      <View style={styles.nav}>
        <IconButton icon="chevronLeft" label="Previous month" onPress={() => onMonthChange(addMonths(month, -1))} />
        <Text variant="heading" accessibilityRole="header" style={styles.title}>
          {monthTitle(month)}
        </Text>
        <IconButton icon="chevronRight" label="Next month" disabled={!canGoForward} onPress={() => onMonthChange(addMonths(month, 1))} />
      </View>
      <MonthGrid
        month={month}
        firstDayOfWeek={firstDayOfWeek}
        today={today}
        color={ctx.habit.color}
        cellFor={(d) => habitCell(ctx, records, d, today)}
        onSelect={onSelectDay}
      />
      <Legend
        items={[
          { color: ctx.habit.color, label: 'Done', glyph: '✓' },
          { color: colors.surfaceMuted, label: 'Missed', glyph: '×' },
          { color: colors.border, label: 'Skipped', glyph: '–', outline: true },
          { color: colors.border, label: 'Not scheduled', outline: true },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  nav: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, textAlign: 'center' },
});
