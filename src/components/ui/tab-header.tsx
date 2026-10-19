import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/tokens';

import { Text } from './text';

/** In-content title for tab root screens (consistent across tabs, no native large-title quirks). */
export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        {subtitle && (
          <Text variant="caption" tone="secondary">
            {subtitle}
          </Text>
        )}
        <Text variant="display" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  text: { flex: 1 },
});
