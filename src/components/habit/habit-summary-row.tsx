import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HabitIcon } from '@/components/ui/habit-icon';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { weekdayShortName } from '@/domain/dates';
import { describeRule, ruleOn } from '@/domain/schedule';
import type { HabitContext, LocalDate } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

/** Compact row for habit management screens (not for completion). */
export function HabitSummaryRow({
  ctx,
  today,
  trailing,
  trailingNode,
  subtitle,
}: {
  ctx: HabitContext;
  today: LocalDate;
  /** Short text (e.g. a value) shown at the end of the row. */
  trailing?: string;
  /** Optional element (e.g. a streak badge or list icon) shown at the end of the row. */
  trailingNode?: ReactNode;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  const { habit } = ctx;
  const schedule = describeRule(ruleOn(ctx, today < habit.startDate ? habit.startDate : today), (d) => weekdayShortName(d as 0));
  const sub = subtitle ?? schedule;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${habit.name}, ${sub}${trailing ? `, ${trailing}` : ''}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}>
      <HabitIcon icon={habit.icon} color={habit.color} size={36} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {habit.name}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {trailingNode}
      {trailing && (
        <Text variant="captionStrong" tone="secondary">
          {trailing}
        </Text>
      )}
      <Icon name="chevronRight" size={14} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  text: { flex: 1, gap: 1 },
});
