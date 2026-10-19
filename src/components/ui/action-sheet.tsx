import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { MAX_CONTENT_WIDTH, MIN_TOUCH, radius, spacing } from '@/theme/tokens';

import { HabitIcon } from './habit-icon';
import { Icon, type IconName } from './icon';
import { Text } from './text';

export interface SheetAction {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  selected?: boolean;
  onPress: () => void;
}

/** Bottom sheet with a list of actions. Accessible, dismissible, cross-platform. */
export function ActionSheet({
  visible,
  onClose,
  title,
  titleIcon,
  subtitle,
  actions,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Habit/list icon shown before the title. */
  titleIcon?: { icon: string; color: string };
  subtitle?: string;
  actions?: SheetAction[];
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.lg) },
        ]}
        accessibilityViewIsModal>
        <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
        {(title || subtitle) && (
          <View style={styles.header}>
            {title && (
              <View style={styles.titleRow}>
                {titleIcon && <HabitIcon icon={titleIcon.icon} color={titleIcon.color} size={32} />}
                <Text variant="heading" numberOfLines={2} accessibilityRole="header" style={styles.flex}>
                  {title}
                </Text>
              </View>
            )}
            {subtitle && (
              <Text variant="caption" tone="secondary">
                {subtitle}
              </Text>
            )}
          </View>
        )}
        {children}
        {actions?.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => {
              onClose();
              a.onPress();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: a.selected }}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfaceMuted }]}>
            {a.icon && <Icon name={a.icon} size={20} color={a.destructive ? colors.danger : colors.text} />}
            <Text tone={a.destructive ? 'danger' : 'primary'} style={styles.actionLabel}>
              {a.label}
            </Text>
            {a.selected && <Icon name="check" size={18} color={colors.accent} />}
          </Pressable>
        ))}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={({ pressed }) => [styles.action, styles.cancel, pressed && { backgroundColor: colors.surfaceMuted }]}>
          <Text variant="bodyStrong" tone="secondary" style={styles.cancelLabel}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: StyleSheet.absoluteFill,
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.sm },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH + 8,
    paddingHorizontal: spacing.xl,
  },
  actionLabel: { flex: 1 },
  cancel: { justifyContent: 'center', marginTop: spacing.xs },
  cancelLabel: { textAlign: 'center', flex: 1 },
});
