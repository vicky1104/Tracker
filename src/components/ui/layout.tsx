import type { ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { MAX_CONTENT_WIDTH, radius, spacing } from '@/theme/tokens';

import { Button } from './button';
import { HabitGlyph } from './habit-icon';
import { Icon, type IconName } from './icon';
import { Text } from './text';

/** Scrollable screen body with consistent padding, background and tablet max width. */
export function Screen({
  children,
  scroll = true,
  contentStyle,
  refreshing,
  onRefresh,
  headerless,
  ...rest
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** No native header above: pad for the status bar / Dynamic Island instead. */
  headerless?: boolean;
} & Pick<ScrollViewProps, 'keyboardShouldPersistTaps' | 'stickyHeaderIndices' | 'scrollEnabled'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topPad = headerless ? { paddingTop: insets.top + spacing.md } : null;
  if (!scroll) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={[styles.content, styles.flex, topPad, contentStyle]}>{children}</View>
      </View>
    );
  }
  const scrollView = (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, topPad, contentStyle]}
      contentInsetAdjustmentBehavior={headerless ? 'never' : 'automatic'}
      keyboardDismissMode="on-drag"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
      }
      {...rest}>
      {children}
    </ScrollView>
  );
  if (!headerless) return scrollView;
  return (
    <View style={styles.flex}>
      {scrollView}
      {/* Opaque strip behind the status bar so scrolled content never shows under it. */}
      <View pointerEvents="none" style={[styles.statusBarBackdrop, { height: insets.top, backgroundColor: colors.background }]} />
    </View>
  );
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        padded && styles.cardPadded,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader} accessibilityRole="header">
      <Text variant="micro" tone="secondary">
        {title}
      </Text>
      {action}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

export function EmptyState({
  icon = 'sparkles',
  habitIcon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  /** Habit/list icon key (alternative to `icon`). */
  habitIcon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
        {habitIcon ? <HabitGlyph icon={habitIcon} size={28} color={colors.accent} /> : <Icon name={icon} size={28} color={colors.accent} />}
      </View>
      <Text variant="heading" style={styles.center}>
        {title}
      </Text>
      {message && (
        <Text tone="secondary" style={styles.center}>
          {message}
        </Text>
      )}
      {actionLabel && onAction && <Button title={actionLabel} onPress={onAction} icon="add" style={styles.emptyButton} />}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={styles.empty}>
        <Icon name="warning" size={28} color={colors.warning} />
        <Text variant="heading" style={styles.center}>
          {title}
        </Text>
        <Text tone="secondary" style={styles.center}>
          {message}
        </Text>
        {onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} style={styles.emptyButton} />}
      </View>
    </View>
  );
}

/** Inline notice banner (info / warning / premium). */
export function Notice({
  icon = 'info',
  title,
  message,
  tone = 'info',
  action,
}: {
  icon?: IconName;
  title?: string;
  message: string;
  tone?: 'info' | 'warning';
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  const tint = tone === 'warning' ? colors.warning : colors.accent;
  return (
    <View style={[styles.notice, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
      <Icon name={icon} size={18} color={tint} />
      <View style={styles.flex}>
        {title && <Text variant="captionStrong">{title}</Text>}
        <Text variant="caption" tone="secondary">
          {message}
        </Text>
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  statusBarBackdrop: { position: 'absolute', top: 0, left: 0, right: 0 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
    gap: spacing.lg,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardPadded: { padding: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: -spacing.sm,
  },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  emptyButton: { marginTop: spacing.md },
  center: { textAlign: 'center' },
  notice: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
});
