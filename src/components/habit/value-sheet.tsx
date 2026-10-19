import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/controls';
import { HabitIcon } from '@/components/ui/habit-icon';
import { Text } from '@/components/ui/text';
import { formatLocalDate } from '@/domain/dates';
import type { Completion, Habit, LocalDate } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { MAX_CONTENT_WIDTH, radius, spacing, typography } from '@/theme/tokens';

import { formatNumber } from './habit-row';

/** Log a numeric value (and optional note) for a habit on a date. */
export function ValueSheet({
  habit,
  date,
  record,
  onClose,
  onSave,
}: {
  habit: Habit | null;
  date: LocalDate;
  record: Completion | null;
  onClose: () => void;
  onSave: (value: number, note: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(record?.value != null ? String(record.value) : '');
  const [note, setNote] = useState(record?.note ?? '');

  if (!habit) return null;
  const parsed = Number(text.replace(',', '.'));
  const valid = text.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;
  const target = habit.target ?? 1;
  const step = target >= 1000 ? Math.round(target / 10) : target >= 50 ? 5 : 1;
  const current = valid ? parsed : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.avoid} pointerEvents="box-none">
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          accessibilityViewIsModal>
          <View style={styles.sheetTitle}>
            <HabitIcon icon={habit.icon} color={habit.color} size={32} />
            <Text variant="heading" accessibilityRole="header" style={styles.flex}>
              {habit.name}
            </Text>
          </View>
          <Text variant="caption" tone="secondary">
            {formatLocalDate(date, { weekday: 'long', month: 'long', day: 'numeric' })} · Goal{' '}
            {habit.targetDirection === 'atMost' ? 'at most' : 'at least'} {formatNumber(target)} {habit.unit}
          </Text>

          <View style={styles.inputRow}>
            <Pressable
              onPress={() => setText(String(Math.max(0, current - step)))}
              style={[styles.step, { backgroundColor: colors.surfaceMuted }]}
              accessibilityRole="button"
              accessibilityLabel={`Decrease by ${step}`}>
              <Text variant="title">−</Text>
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              selectTextOnFocus
              accessibilityLabel={`Value in ${habit.unit || 'units'}`}
              style={[styles.input, typography.display, { color: colors.text, borderColor: colors.border }]}
            />
            <Pressable
              onPress={() => setText(String(current + step))}
              style={[styles.step, { backgroundColor: colors.surfaceMuted }]}
              accessibilityRole="button"
              accessibilityLabel={`Increase by ${step}`}>
              <Text variant="title">+</Text>
            </Pressable>
          </View>
          <Text variant="caption" tone="tertiary" style={styles.center}>
            {habit.unit}
          </Text>

          <Button title="Set to goal" variant="secondary" size="sm" onPress={() => setText(String(target))} />
          <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={280} placeholder="How did it go?" />

          <View style={styles.actions}>
            <Button title="Cancel" variant="ghost" onPress={onClose} style={styles.flex} />
            <Button
              title="Save"
              disabled={!valid}
              onPress={() => {
                onSave(parsed, note.trim());
                onClose();
              }}
              style={styles.flex}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avoid: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  step: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, textAlign: 'center', borderBottomWidth: 2, paddingVertical: spacing.sm },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
