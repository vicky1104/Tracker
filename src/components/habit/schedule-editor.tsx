import { Pressable, StyleSheet, View } from 'react-native';

import { Chip, Stepper } from '@/components/ui/controls';
import { WeekdayPicker } from '@/components/ui/pickers';
import { Text } from '@/components/ui/text';
import type { FirstDayOfWeek, ScheduleRule } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

const TYPES: { type: ScheduleRule['type']; label: string }[] = [
  { type: 'daily', label: 'Every day' },
  { type: 'weekdays', label: 'Specific days' },
  { type: 'timesPerWeek', label: 'X per week' },
  { type: 'timesPerMonth', label: 'X per month' },
  { type: 'monthDays', label: 'Days of month' },
  { type: 'interval', label: 'Every N days' },
];

function defaultRule(type: ScheduleRule['type']): ScheduleRule {
  switch (type) {
    case 'daily':
      return { type };
    case 'weekdays':
      return { type, days: [1, 2, 3, 4, 5] };
    case 'timesPerWeek':
      return { type, count: 3 };
    case 'timesPerMonth':
      return { type, count: 8 };
    case 'monthDays':
      return { type, days: [1] };
    case 'interval':
      return { type, every: 2 };
  }
}

export function ScheduleEditor({
  value,
  onChange,
  firstDayOfWeek,
}: {
  value: ScheduleRule;
  onChange: (r: ScheduleRule) => void;
  firstDayOfWeek: FirstDayOfWeek;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {TYPES.map((t) => (
          <Chip key={t.type} label={t.label} selected={value.type === t.type} onPress={() => value.type !== t.type && onChange(defaultRule(t.type))} />
        ))}
      </View>

      {value.type === 'weekdays' && (
        <WeekdayPicker value={value.days} onChange={(days) => onChange({ type: 'weekdays', days })} firstDayOfWeek={firstDayOfWeek} />
      )}

      {(value.type === 'timesPerWeek' || value.type === 'timesPerMonth') && (
        <View style={styles.inline}>
          <Stepper
            label="Times per period"
            value={value.count}
            min={1}
            max={value.type === 'timesPerWeek' ? 7 : 31}
            onChange={(count) => onChange({ ...value, count })}
          />
          <Text tone="secondary">
            times per {value.type === 'timesPerWeek' ? 'week' : 'month'}, on any days
          </Text>
        </View>
      )}

      {value.type === 'interval' && (
        <View style={styles.inline}>
          <Text tone="secondary">Every</Text>
          <Stepper label="Days between" value={value.every} min={2} max={60} onChange={(every) => onChange({ type: 'interval', every })} />
          <Text tone="secondary">days from the start date</Text>
        </View>
      )}

      {value.type === 'monthDays' && (
        <View>
          <View style={styles.grid} accessibilityLabel="Days of the month">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
              const selected = value.days.includes(d);
              return (
                <Pressable
                  key={d}
                  onPress={() => {
                    const days = selected ? value.days.filter((x) => x !== d) : [...value.days, d].sort((a, b) => a - b);
                    if (days.length) onChange({ type: 'monthDays', days });
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Day ${d}`}
                  style={[styles.day, { backgroundColor: selected ? colors.accent : colors.surfaceMuted }]}>
                  <Text variant="captionStrong" color={selected ? colors.onAccent : colors.text} maxFontSizeMultiplier={1.2}>
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {value.days.some((d) => d > 28) && (
            <Text variant="caption" tone="tertiary" style={styles.hint}>
              In shorter months, days 29–31 fall on the month’s last day.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: spacing.sm },
});
