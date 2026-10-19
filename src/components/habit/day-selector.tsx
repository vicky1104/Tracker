import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { addDays, formatLocalDate, parseLocalDate } from '@/domain/dates';
import type { LocalDate } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

const ITEM_WIDTH = 48;
const GAP = 6;
const PAST_DAYS = 60;
const FUTURE_DAYS = 7;

/** Horizontal day strip with a small completion indicator under each day. */
export function DaySelector({
  today,
  selected,
  onSelect,
  percentFor,
}: {
  today: LocalDate;
  selected: LocalDate;
  onSelect: (d: LocalDate) => void;
  percentFor: (d: LocalDate) => number | null;
}) {
  const { colors } = useTheme();
  const listRef = useRef<FlatList<LocalDate>>(null);
  const days = useMemo(
    () => Array.from({ length: PAST_DAYS + FUTURE_DAYS + 1 }, (_, i) => addDays(today, i - PAST_DAYS)),
    [today],
  );
  const selectedIndex = Math.max(0, days.indexOf(selected));

  useEffect(() => {
    listRef.current?.scrollToIndex({ index: selectedIndex, viewPosition: 0.5, animated: true });
  }, [selectedIndex]);

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={days}
      keyExtractor={(d) => d}
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={selectedIndex}
      getItemLayout={(_, index) => ({ length: ITEM_WIDTH + GAP, offset: (ITEM_WIDTH + GAP) * index, index })}
      onScrollToIndexFailed={() => undefined}
      contentContainerStyle={styles.content}
      style={styles.list}
      accessibilityLabel="Choose a day"
      renderItem={({ item: d }) => {
        const isSelected = d === selected;
        const isToday = d === today;
        const isFuture = d > today;
        const pct = isFuture ? null : percentFor(d);
        const weekday = formatLocalDate(d, { weekday: 'short' });
        const fg = isSelected ? colors.onAccent : isFuture ? colors.textTertiary : colors.text;
        return (
          <Pressable
            onPress={() => onSelect(d)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${formatLocalDate(d, { weekday: 'long', month: 'long', day: 'numeric' })}${isToday ? ', today' : ''}${
              pct != null ? `, ${Math.round(pct * 100)} percent complete` : ''
            }`}
            style={[
              styles.day,
              {
                backgroundColor: isSelected ? colors.accent : colors.surface,
                borderColor: isToday && !isSelected ? colors.accent : colors.border,
              },
            ]}>
            <Text variant="micro" color={isSelected ? colors.onAccent : colors.textSecondary} maxFontSizeMultiplier={1.2}>
              {weekday.slice(0, 3)}
            </Text>
            <Text variant="bodyStrong" color={fg} maxFontSizeMultiplier={1.2}>
              {parseLocalDate(d).day}
            </Text>
            <View style={[styles.meter, { backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : colors.surfaceMuted }]}>
              {pct != null && pct > 0 && (
                <View
                  style={[
                    styles.meterFill,
                    { width: `${Math.round(pct * 100)}%`, backgroundColor: isSelected ? colors.onAccent : colors.accent },
                  ]}
                />
              )}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 0, marginHorizontal: -spacing.lg },
  content: { paddingHorizontal: spacing.lg, gap: GAP },
  day: {
    width: ITEM_WIDTH,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  meter: { width: 24, height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 2 },
  meterFill: { height: '100%' },
});
