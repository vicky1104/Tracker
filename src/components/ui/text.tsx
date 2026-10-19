import { Text as RNText, type TextProps } from 'react-native';

import { useTheme } from '@/theme/theme';
import { typography, type TypographyVariant } from '@/theme/tokens';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'onAccent';

export function Text({
  variant = 'body',
  tone = 'primary',
  color,
  style,
  ...rest
}: TextProps & { variant?: TypographyVariant; tone?: TextTone; color?: string }) {
  const { colors } = useTheme();
  const toneColor = {
    primary: colors.text,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    accent: colors.accent,
    danger: colors.danger,
    onAccent: colors.onAccent,
  }[tone];
  return (
    <RNText
      maxFontSizeMultiplier={variant === 'micro' ? 1.4 : 2}
      {...rest}
      style={[typography[variant], { color: color ?? toneColor }, style]}
    />
  );
}
