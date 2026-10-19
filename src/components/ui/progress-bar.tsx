import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';

export function ProgressBar({
  value,
  color,
  height = 8,
  label,
}: {
  /** 0–1 */
  value: number;
  color?: string;
  height?: number;
  label: string;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, value));
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.set(reduceMotion ? clamped : withTiming(clamped, { duration: 350 }));
  }, [clamped, progress, reduceMotion]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, backgroundColor: colors.surfaceMuted, borderRadius: height / 2 }]}>
      <Animated.View style={[styles.fill, { backgroundColor: color ?? colors.accent, borderRadius: height / 2 }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden', borderRadius: radius.pill },
  fill: { height: '100%' },
});
