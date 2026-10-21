import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/theme';
import { radius as radii, spacing, typography, type TypographyVariant } from '@/theme/tokens';

/** One pulse shared by every block in a group, so the whole placeholder breathes in sync. */
const PulseContext = createContext<SharedValue<number> | null>(null);

/**
 * Wraps a loading placeholder. Fades in after a short delay so fast local reads
 * don't flash a skeleton, then pulses (static when Reduce Motion is on).
 */
export function SkeletonGroup({
  children,
  label = 'Loading',
  style,
}: {
  children: ReactNode;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const appear = useSharedValue(0);

  useEffect(() => {
    appear.set(withDelay(120, withTiming(1, { duration: 200 })));
    if (!reduceMotion) {
      pulse.set(withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true));
    }
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(appear);
    };
  }, [appear, pulse, reduceMotion]);

  const fade = useAnimatedStyle(() => ({ opacity: appear.get() }));

  return (
    <PulseContext.Provider value={pulse}>
      <Animated.View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        style={[fade, style]}>
        {children}
      </Animated.View>
    </PulseContext.Provider>
  );
}

/** A single placeholder block. */
export function Skeleton({
  width = '100%',
  height,
  radius = radii.sm,
  style,
}: {
  width?: DimensionValue;
  height: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const pulse = useContext(PulseContext);
  const animated = useAnimatedStyle(() => ({ opacity: pulse ? 1 - pulse.get() * 0.5 : 1 }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.border }, animated, style]} />;
}

export function SkeletonCircle({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  return <Skeleton width={size} height={size} radius={size / 2} style={style} />;
}

/** A text-line placeholder that occupies the same height as real text of `variant`. */
export function SkeletonText({
  variant = 'body',
  width = '60%',
  style,
}: {
  variant?: TypographyVariant;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
}) {
  const { fontSize, lineHeight } = typography[variant];
  return (
    <View style={[{ height: lineHeight, width, justifyContent: 'center' }, style]}>
      <Skeleton height={Math.round(fontSize * 0.75)} radius={radii.sm / 2} />
    </View>
  );
}

/** Pill placeholders matching `ChipRow`. */
export function SkeletonChips({ widths = [72, 96, 64, 88] }: { widths?: number[] }) {
  return (
    <View style={styles.chips}>
      {widths.map((w, i) => (
        <Skeleton key={i} width={w} height={36} radius={radii.pill} />
      ))}
    </View>
  );
}

/** Placeholder for a `SectionHeader`. */
export function SkeletonSectionHeader({ width = 96 }: { width?: number }) {
  return <SkeletonText variant="micro" width={width} style={styles.sectionHeader} />;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.sm, overflow: 'hidden' },
  sectionHeader: { marginHorizontal: spacing.xs, marginBottom: -spacing.sm },
});
