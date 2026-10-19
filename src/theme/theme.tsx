import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import type { Density, ThemePreference } from '@/domain/types';

import { buildPalette, density as densityTokens, type Palette } from './tokens';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: Palette;
  density: (typeof densityTokens)[Density];
  densityName: Density;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  preference,
  accent,
  density,
  children,
}: {
  preference: ThemePreference;
  accent: string;
  density: Density;
  children: ReactNode;
}) {
  // Keep native UI (pickers, alerts, keyboard) in sync with the manual override.
  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const system = useColorScheme();
  const scheme: 'light' | 'dark' =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<Theme>(
    () => ({
      scheme,
      colors: buildPalette(scheme, accent),
      density: densityTokens[density],
      densityName: density,
    }),
    [scheme, accent, density],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}
