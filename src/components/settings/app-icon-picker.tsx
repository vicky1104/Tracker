import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { APP_ICONS, getAppIcon, setAppIcon, supportsAppIcons } from '@/services/app-icon';
import { useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

/** Premium: choose an alternate home-screen icon. `locked` sends free users to the paywall. */
export function AppIconPicker({ locked, onLockedPress }: { locked: boolean; onLockedPress: () => void }) {
  const { colors } = useTheme();
  const [current, setCurrent] = useState<string | null>(getAppIcon);

  const choose = async (name: string | null) => {
    if (locked && name) return onLockedPress(); // resetting to default is always allowed
    try {
      setCurrent(await setAppIcon(name));
    } catch {
      Alert.alert('Couldn’t change the icon', 'Please try again.');
    }
  };

  if (!supportsAppIcons()) {
    return (
      <>
        <Text variant="captionStrong" tone="secondary">
          App icon
        </Text>
        <Text variant="caption" tone="secondary">
          Alternate app icons aren’t available in this build. Rebuild the app (npx expo prebuild --clean, then run it again) or try a device that supports them.
        </Text>
      </>
    );
  }

  return (
    <>
      <Text variant="captionStrong" tone="secondary">
        App icon
      </Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="App icon">
        {APP_ICONS.map((icon) => {
          const selected = current === icon.name;
          return (
            <Pressable
              key={icon.id}
              onPress={() => void choose(icon.name)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${icon.label}${locked && icon.name ? ', premium' : ''}`}
              style={styles.item}>
              <View style={[styles.frame, { borderColor: selected ? colors.text : 'transparent' }]}>
                <Image source={icon.preview} style={styles.image} />
                {locked && icon.name ? (
                  <View style={styles.lock}>
                    <Icon name="lock" size={14} color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              <Text variant="caption" tone="secondary">
                {icon.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  item: { alignItems: 'center', gap: spacing.xs },
  frame: { width: 60, height: 60, borderRadius: 16, borderWidth: 3, padding: 2, overflow: 'hidden' },
  image: { width: '100%', height: '100%', borderRadius: 12 },
  lock: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000066' },
});
