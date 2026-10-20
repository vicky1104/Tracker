/**
 * Design tokens. Every color, spacing value and text style in the app comes
 * from here, so light/dark/accent variants stay consistent.
 */
import type { TextStyle } from 'react-native';

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export interface Palette {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  danger: string;
  warning: string;
  skipped: string;
  overlay: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
}

const light = {
  background: '#F7F6F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F0EEEA',
  border: '#E6E3DD',
  borderStrong: '#D2CEC6',
  text: '#1B1A18',
  textSecondary: '#5F5C56',
  textTertiary: '#8C8880',
  danger: '#C23B3B',
  warning: '#B26D12',
  skipped: '#8C8880',
  overlay: 'rgba(15, 15, 14, 0.4)',
};

const dark = {
  background: '#0F0F0E',
  surface: '#1A1A18',
  surfaceMuted: '#242421',
  border: '#2E2D2A',
  borderStrong: '#3D3C38',
  text: '#F3F2EF',
  textSecondary: '#B5B1AA',
  textTertiary: '#86827B',
  danger: '#F07272',
  warning: '#E3A44A',
  skipped: '#86827B',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export interface AccentOption {
  id: string;
  name: string;
  light: string;
  dark: string;
  /** Additional accents are part of the premium tier. */
  premium: boolean;
}

export const ACCENTS: AccentOption[] = [
  { id: 'sage', name: 'Sage', light: '#2A8C70', dark: '#4CC39E', premium: false },
  { id: 'ocean', name: 'Ocean', light: '#2F72B8', dark: '#6AA8EC', premium: false },
  { id: 'indigo', name: 'Indigo', light: '#5457E0', dark: '#8E91FF', premium: false },
  { id: 'coral', name: 'Coral', light: '#D24E3C', dark: '#FF8A75', premium: true },
  { id: 'plum', name: 'Plum', light: '#A8457F', dark: '#E486BD', premium: true },
  { id: 'amber', name: 'Amber', light: '#B4630F', dark: '#F2A64F', premium: true },
  { id: 'graphite', name: 'Graphite', light: '#3F4650', dark: '#C5CBD3', premium: true },
];

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

export function buildPalette(scheme: 'light' | 'dark', accentId: string): Palette {
  const accent = ACCENTS.find((a) => a.id === accentId) ?? ACCENTS[0];
  const base = scheme === 'dark' ? dark : light;
  const accentColor = scheme === 'dark' ? accent.dark : accent.light;
  return {
    ...base,
    accent: accentColor,
    accentSoft: withAlpha(accentColor, scheme === 'dark' ? 0.2 : 0.12),
    onAccent: scheme === 'dark' && accent.id === 'graphite' ? '#111111' : '#FFFFFF',
  };
}

/** Habit row metrics (comfortable is the only density). */
export const density = {
  comfortable: { rowPaddingV: 12, rowGap: 10, icon: 40, check: 40 },
} as const;

/** Minimum touch target recommended by both platforms' accessibility guidelines. */
export const MIN_TOUCH = 44;
export const MAX_CONTENT_WIDTH = 720;
