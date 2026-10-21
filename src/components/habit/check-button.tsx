import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import type { DayState } from '@/domain/stats';
import { useTheme } from '@/theme/theme';
import { withAlpha } from '@/theme/tokens';

/**
 * Completion control. Each state has a distinct glyph *and* fill so state is
 * never communicated by color alone.
 */
export function CheckButton({
  state,
  color,
  size,
  progress,
  onPress,
  onLongPress,
  label,
  disabled,
}: {
  state: DayState;
  color: string;
  size: number;
  /** 0–1 partial progress for numeric habits. */
  progress?: number;
  onPress: () => void;
  onLongPress?: () => void;
  label: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const done = state === 'done';
  const skipped = state === 'skipped';
  const missed = state === 'missed';
  const partial = state === 'partial';

  const press = () => {
    // Haptics come from the shared toggle handler so every completion path feels the same.
    if (!done && !reduceMotion) scale.set(withSequence(withTiming(0.86, { duration: 80 }), withSpring(1, { damping: 9 })));
    onPress();
  };

  const bg = done ? color : partial ? withAlpha(color, 0.18) : 'transparent';
  const border = done ? color : skipped || missed ? colors.borderStrong : withAlpha(color, 0.6);

  return (
    <Pressable
      onPress={press}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: done ? true : partial ? 'mixed' : false, disabled }}>
      <Animated.View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderColor: border },
          skipped && styles.dashed,
          disabled && { opacity: 0.4 },
          animated,
        ]}>
        {done && <Icon name="check" size={size * 0.5} color="#FFFFFF" />}
        {skipped && <Icon name="skip" size={size * 0.42} color={colors.skipped} />}
        {missed && <Icon name="missed" size={size * 0.42} color={colors.danger} />}
        {partial && progress != null && (
          <View
            style={[
              styles.partialFill,
              { height: `${Math.round(Math.max(0.1, Math.min(1, progress)) * 100)}%`, backgroundColor: withAlpha(color, 0.45) },
            ]}
          />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dashed: { borderStyle: 'dashed' },
  partialFill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
