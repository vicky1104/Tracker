import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ICON_CATALOG, resolveIconKey } from '@/constants/habit-icons';
import { radius, withAlpha } from '@/theme/tokens';

/** A habit/list icon glyph (no background). Accepts a key or a legacy emoji. */
export function HabitGlyph({ icon, size = 20, color }: { icon: string; size?: number; color: string }) {
  const def = ICON_CATALOG[resolveIconKey(icon)];
  return (
    <SymbolView
      name={{ ios: def.ios, android: def.android, web: def.android }}
      size={size}
      tintColor={color}
      style={{ width: size, height: size }}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}

/** Icon on a softly tinted rounded tile, coloured with the habit's colour. */
export function HabitIcon({
  icon,
  color,
  size = 40,
  style,
}: {
  icon: string;
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size >= 56 ? radius.lg + 2 : radius.md, backgroundColor: withAlpha(color, 0.16) },
        style,
      ]}
      importantForAccessibility="no-hide-descendants">
      <HabitGlyph icon={icon} color={color} size={Math.round(size * 0.52)} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
