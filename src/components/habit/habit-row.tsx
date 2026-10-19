import { Pressable, StyleSheet, View } from 'react-native';

import { HabitIcon } from '@/components/ui/habit-icon';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { DayItem } from '@/domain/stats';
import { useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

import { CheckButton } from './check-button';

export interface HabitRowHandlers {
  onToggle: (item: DayItem) => void;
  onOpenMenu: (item: DayItem) => void;
  onOpenValue: (item: DayItem) => void;
  onOpenDetails: (item: DayItem) => void;
}

const STATE_LABEL: Record<string, string> = {
  done: 'Done',
  partial: 'In progress',
  skipped: 'Skipped',
  missed: 'Missed',
  pending: 'Not done yet',
  future: 'Upcoming',
  unscheduled: 'Not scheduled',
  inactive: 'Inactive',
};

function subtitleFor(item: DayItem): string | null {
  const { habit } = item.ctx;
  const parts: string[] = [];
  if (habit.kind === 'numeric' && habit.target != null) {
    const v = item.record?.value ?? 0;
    parts.push(`${formatNumber(v)} / ${habit.targetDirection === 'atMost' ? '≤' : ''}${formatNumber(habit.target)} ${habit.unit}`.trim());
  }
  if (item.quota) {
    parts.push(
      item.quota.met
        ? `Goal met this ${item.quota.period}`
        : `${item.quota.done}/${item.quota.target} this ${item.quota.period}`,
    );
  }
  if (item.state === 'skipped') parts.push('Skipped');
  if (item.state === 'missed') parts.push('Missed');
  if (!item.due && !item.quota && item.record) parts.push('Extra');
  return parts.length ? parts.join(' · ') : null;
}

export function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function HabitRow({
  item,
  handlers,
  readOnly,
}: {
  item: DayItem;
  handlers: HabitRowHandlers;
  /** Future days: completion disabled (skipping is still available via the menu). */
  readOnly?: boolean;
}) {
  const { colors, density } = useTheme();
  const { habit } = item.ctx;
  const subtitle = subtitleFor(item);
  const muted = item.quota?.met && !item.done;
  const progress =
    habit.kind === 'numeric' && habit.target ? (item.record?.value ?? 0) / habit.target : undefined;
  const stateLabel = STATE_LABEL[item.state] ?? '';

  return (
    <View
      style={[styles.row, { paddingVertical: density.rowPaddingV, opacity: muted ? 0.6 : 1 }]}
      accessibilityActions={[
        { name: 'activate', label: item.done ? 'Undo completion' : 'Mark done' },
        { name: 'menu', label: 'More options' },
        { name: 'details', label: 'Open details' },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !readOnly) handlers.onToggle(item);
        if (e.nativeEvent.actionName === 'menu') handlers.onOpenMenu(item);
        if (e.nativeEvent.actionName === 'details') handlers.onOpenDetails(item);
      }}>
      <Pressable
        style={styles.main}
        onPress={() => handlers.onOpenDetails(item)}
        onLongPress={() => handlers.onOpenMenu(item)}
        accessibilityRole="button"
        accessibilityLabel={`${habit.name}. ${stateLabel}${subtitle ? `. ${subtitle}` : ''}`}
        accessibilityHint="Opens habit details. Long press for more options.">
        <HabitIcon icon={habit.icon} color={habit.color} size={density.icon} />
        <View style={styles.text}>
          <Text
            variant="bodyStrong"
            numberOfLines={2}
            style={item.done ? { color: colors.textSecondary } : undefined}>
            {habit.name}
          </Text>
          {subtitle && (
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </Pressable>

      {habit.kind === 'numeric' && !readOnly && (
        <Pressable
          onPress={() => handlers.onOpenValue(item)}
          accessibilityRole="button"
          accessibilityLabel={`Log ${habit.unit || 'value'} for ${habit.name}`}
          hitSlop={6}
          style={[styles.valueButton, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name="add" size={16} color={colors.text} />
        </Pressable>
      )}
      <Pressable
        onPress={() => handlers.onOpenMenu(item)}
        accessibilityRole="button"
        accessibilityLabel={`More options for ${habit.name}`}
        hitSlop={4}
        style={styles.more}>
        <Icon name="more" size={18} color={colors.textTertiary} />
      </Pressable>
      <CheckButton
        state={item.state}
        color={habit.color}
        size={density.check}
        progress={progress}
        disabled={readOnly}
        onPress={() => handlers.onToggle(item)}
        onLongPress={() => handlers.onOpenMenu(item)}
        label={`${habit.name}: ${stateLabel}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  text: { flex: 1, gap: 1 },
  valueButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  more: { width: 28, height: 44, alignItems: 'center', justifyContent: 'center' },
});
