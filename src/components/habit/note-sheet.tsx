import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/controls';
import { HabitIcon } from '@/components/ui/habit-icon';
import { Text } from '@/components/ui/text';
import { formatLocalDate } from '@/domain/dates';
import type { Completion, Habit, LocalDate } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { MAX_CONTENT_WIDTH, radius, spacing } from '@/theme/tokens';

export function NoteSheet({
  target,
  onClose,
  onSave,
}: {
  target: { habit: Habit; date: LocalDate; record: Completion | null };
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState(target.record?.note ?? '');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.avoid} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.lg) }]} accessibilityViewIsModal>
          <View style={styles.sheetTitle}>
            <HabitIcon icon={target.habit.icon} color={target.habit.color} size={32} />
            <Text variant="heading" accessibilityRole="header" style={styles.flex}>
              {target.habit.name}
            </Text>
          </View>
          <Text variant="caption" tone="secondary">
            {formatLocalDate(target.date, { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <TextField label="Note" value={note} onChangeText={setNote} multiline maxLength={280} autoFocus placeholder="How did it go?" />
          <View style={styles.actions}>
            <Button title="Cancel" variant="ghost" onPress={onClose} style={styles.flex} />
            <Button
              title="Save"
              onPress={() => {
                onSave(note.trim());
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
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
