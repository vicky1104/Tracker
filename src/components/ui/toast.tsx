import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/state/app-store';
import { useTheme } from '@/theme/theme';
import { MAX_CONTENT_WIDTH, radius, spacing } from '@/theme/tokens';

import { Text } from './text';

const TAB_BAR_CLEARANCE = 72;

/** Global, non-blocking toast (never a modal pop-up). */
export function ToastHost() {
  const toast = useAppStore((s) => s.toast);
  const hide = useAppStore((s) => s.hideToast);
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    if (toast.tone === 'error') haptics.error();
    else if (toast.tone === 'success') haptics.success();
    AccessibilityInfo.announceForAccessibility(toast.message);
    const t = setTimeout(hide, toast.actionLabel ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [toast, hide]);

  if (!toast) return null;
  const bg = toast.tone === 'error' ? colors.danger : scheme === 'dark' ? '#F3F2EF' : '#1B1A18';
  const fg = toast.tone === 'error' ? '#FFFFFF' : scheme === 'dark' ? '#1B1A18' : '#F3F2EF';

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(150)}
        style={[styles.toast, { backgroundColor: bg }]}
        accessibilityLiveRegion="polite">
        <Text variant="callout" color={fg} style={styles.message}>
          {toast.message}
        </Text>
        {toast.actionLabel && toast.onAction && (
          <Pressable
            onPress={() => {
              toast.onAction?.();
              hide();
            }}
            accessibilityRole="button"
            hitSlop={8}>
            <Text variant="bodyStrong" color={toast.tone === 'error' ? '#FFFFFF' : colors.accent}>
              {toast.actionLabel}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.lg },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH - spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  message: { flex: 1 },
});
