import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/theme';
import { MIN_TOUCH, radius, spacing, typography } from '@/theme/tokens';

import { HabitGlyph } from './habit-icon';
import { Icon, type IconName } from './icon';
import { Text } from './text';

export function Chip({
  label,
  selected,
  onPress,
  leading,
  icon,
  color,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  leading?: ReactNode;
  /** Habit/list icon key shown before the label. */
  icon?: string;
  color?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const tint = color ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? tint : colors.surface,
          borderColor: selected ? tint : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      {leading}
      {icon && <HabitGlyph icon={icon} size={14} color={selected ? colors.onAccent : tint} />}
      <Text variant="captionStrong" color={selected ? colors.onAccent : colors.text} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      style={styles.chipScroll}>
      {children}
    </ScrollView>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.segmented, { backgroundColor: colors.surfaceMuted }]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: colors.surface, ...shadow }]}>
            <Text variant="captionStrong" tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

export function TextField({
  label,
  error,
  hint,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="captionStrong" tone="secondary">
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        {...props}
        style={[
          styles.input,
          typography.body,
          props.multiline && styles.multiline,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
          },
          props.style,
        ]}
      />
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A tappable settings-style row. */
export function Row({
  icon,
  title,
  subtitle,
  value,
  onPress,
  danger,
  chevron = !!onPress,
  right,
  disabled,
  accessibilityHint,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
  right?: ReactNode;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      {icon && <Icon name={icon} size={20} color={danger ? colors.danger : colors.textSecondary} />}
      <View style={styles.rowText}>
        <Text tone={danger ? 'danger' : 'primary'} numberOfLines={2}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="caption" tone="secondary">
            {subtitle}
          </Text>
        )}
      </View>
      {value && (
        <Text tone="secondary" numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      )}
      {right}
      {chevron && <Icon name="chevronRight" size={14} color={colors.textTertiary} />}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={[title, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint ?? subtitle}
      style={({ pressed }) => [styles.row, { opacity: disabled ? 0.5 : 1, backgroundColor: pressed ? colors.surfaceMuted : 'transparent' }]}>
      {content}
    </Pressable>
  );
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  icon,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  icon?: IconName;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {icon && <Icon name={icon} size={20} color={colors.textSecondary} />}
      <View style={styles.rowText}>
        <Text>{title}</Text>
        {subtitle && (
          <Text variant="caption" tone="secondary">
            {subtitle}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.accent, false: colors.borderStrong }}
        accessibilityLabel={title}
      />
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.stepper, { borderColor: colors.border, backgroundColor: colors.surface }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ now: value, min, max }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + 1));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - 1));
      }}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        style={styles.stepButton}
        hitSlop={6}>
        <Icon name="minus" size={18} color={value <= min ? colors.textTertiary : colors.text} />
      </Pressable>
      <Text variant="bodyStrong" style={styles.stepValue}>
        {value}
      </Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        style={styles.stepButton}
        hitSlop={6}>
        <Icon name="add" size={18} color={value >= max ? colors.textTertiary : colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipScroll: { flexGrow: 0, marginHorizontal: -spacing.lg },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 1,
    paddingHorizontal: spacing.sm,
  },
  field: { gap: spacing.xs },
  input: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH + 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowText: { flex: 1, gap: 2 },
  rowValue: { maxWidth: '45%' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  stepButton: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 32, textAlign: 'center' },
});
