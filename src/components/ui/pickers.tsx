import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { HABIT_ICON_KEYS, ICON_CATALOG, resolveIconKey, type HabitIconKey } from '@/constants/habit-icons';
import { HABIT_COLORS } from '@/constants/palette';
import {
  formatLocalDate,
  formatTime,
  formatTimeLabel,
  fromParts,
  orderedWeekdays,
  parseLocalDate,
  parseTime,
  weekdayShortName,
} from '@/domain/dates';
import type { FirstDayOfWeek, LocalDate, Weekday } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { MIN_TOUCH, radius, spacing, withAlpha } from '@/theme/tokens';

import { HabitGlyph } from './habit-icon';
import { Icon } from './icon';
import { Text } from './text';

const COLOR_NAMES: Record<string, string> = {
  '#2F9E7E': 'Sage',
  '#3B82C4': 'Ocean',
  '#6366F1': 'Indigo',
  '#8B5CF6': 'Violet',
  '#C2549D': 'Plum',
  '#E25C5C': 'Coral',
  '#E07B39': 'Amber',
  '#C9A227': 'Mustard',
  '#5E9E3A': 'Leaf',
  '#2A9DB0': 'Teal',
  '#7A7F87': 'Slate',
  '#9C6B4E': 'Clay',
};

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Color">
      {HABIT_COLORS.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            accessibilityRole="radio"
            accessibilityLabel={COLOR_NAMES[c] ?? c}
            accessibilityState={{ selected }}
            style={[styles.swatch, { backgroundColor: c, borderColor: selected ? colors.text : 'transparent' }]}>
            {selected && <Icon name="check" size={16} color="#FFFFFF" />}
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconPicker({
  value,
  onChange,
  options = HABIT_ICON_KEYS,
  color,
}: {
  value: string;
  onChange: (key: HabitIconKey) => void;
  options?: readonly HabitIconKey[];
  /** Tint for the selected icon (defaults to the accent colour). */
  color?: string;
}) {
  const { colors } = useTheme();
  const selectedKey = resolveIconKey(value);
  const tint = color ?? colors.accent;
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Icon">
      {options.map((key) => {
        const selected = key === selectedKey;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="radio"
            accessibilityLabel={ICON_CATALOG[key].label}
            accessibilityState={{ selected }}
            style={[
              styles.iconOption,
              { backgroundColor: selected ? withAlpha(tint, 0.18) : colors.surfaceMuted, borderColor: selected ? tint : 'transparent' },
            ]}>
            <HabitGlyph icon={key} size={22} color={selected ? tint : colors.textSecondary} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function WeekdayPicker({
  value,
  onChange,
  firstDayOfWeek,
}: {
  value: Weekday[];
  onChange: (days: Weekday[]) => void;
  firstDayOfWeek: FirstDayOfWeek;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.weekdays} accessibilityLabel="Days of the week">
      {orderedWeekdays(firstDayOfWeek).map((d) => {
        const selected = value.includes(d);
        const name = weekdayShortName(d);
        return (
          <Pressable
            key={d}
            onPress={() => {
              const next = selected ? value.filter((x) => x !== d) : [...value, d];
              if (next.length > 0) onChange(next.sort());
            }}
            accessibilityRole="checkbox"
            accessibilityLabel={formatLocalDate(fromParts(2023, 1, 1 + d), { weekday: 'long' })}
            accessibilityState={{ checked: selected }}
            style={[
              styles.weekday,
              { backgroundColor: selected ? colors.accent : colors.surfaceMuted },
            ]}>
            <Text variant="captionStrong" color={selected ? colors.onAccent : colors.text} maxFontSizeMultiplier={1.3}>
              {name.slice(0, 2)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FieldButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.fieldButton, { backgroundColor: colors.surfaceMuted }]}>
      <Text variant="bodyStrong">{value}</Text>
    </Pressable>
  );
}

/** Time of day (HH:MM). Native dialog on Android, compact inline picker on iOS. */
export function TimeField({ value, onChange, label = 'Time' }: { value: string; onChange: (t: string) => void; label?: string }) {
  const [h, m] = parseTime(value);
  const date = new Date(2000, 0, 1, h, m);
  const apply = (d: Date) => onChange(formatTime(d.getHours(), d.getMinutes()));

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={date}
        mode="time"
        display="compact"
        onValueChange={(_, d) => apply(d)}
        accessibilityLabel={label}
      />
    );
  }
  return (
    <FieldButton
      label={label}
      value={formatTimeLabel(value)}
      onPress={() =>
        DateTimePickerAndroid.open({ value: date, mode: 'time', onValueChange: (_, d) => apply(d) })
      }
    />
  );
}

export function DateField({
  value,
  onChange,
  label = 'Date',
  minimumDate,
}: {
  value: LocalDate;
  onChange: (d: LocalDate) => void;
  label?: string;
  minimumDate?: LocalDate;
}) {
  const { year, month, day } = parseLocalDate(value);
  const date = new Date(year, month - 1, day, 12);
  const min = minimumDate
    ? (() => {
        const p = parseLocalDate(minimumDate);
        return new Date(p.year, p.month - 1, p.day, 0);
      })()
    : undefined;
  const apply = (d: Date) => onChange(fromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()));

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={date}
        mode="date"
        display="compact"
        minimumDate={min}
        onValueChange={(_, d) => apply(d)}
        accessibilityLabel={label}
      />
    );
  }
  return (
    <FieldButton
      label={label}
      value={formatLocalDate(value, { day: 'numeric', month: 'short', year: 'numeric' })}
      onPress={() =>
        DateTimePickerAndroid.open({ value: date, mode: 'date', minimumDate: min, onValueChange: (_, d) => apply(d) })
      }
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOption: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  weekday: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldButton: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
