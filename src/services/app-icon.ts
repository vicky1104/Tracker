/**
 * Alternate home-screen icons (premium). Names must match the `expo-alternate-app-icons`
 * plugin entries in app.json; `null` is the default icon.
 */
import { getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons';
import type { ImageSourcePropType } from 'react-native';

export type AppIconOption = { id: string; name: string | null; label: string; preview: ImageSourcePropType };

export const APP_ICONS: AppIconOption[] = [
  { id: 'default', name: null, label: 'Default', preview: require('../../assets/images/icon.png') },
  { id: 'coral', name: 'Coral', label: 'Coral', preview: require('../../assets/app-icons/coral.png') },
  { id: 'plum', name: 'Plum', label: 'Plum', preview: require('../../assets/app-icons/plum.png') },
  { id: 'amber', name: 'Amber', label: 'Amber', preview: require('../../assets/app-icons/amber.png') },
  { id: 'graphite', name: 'Graphite', label: 'Graphite', preview: require('../../assets/app-icons/graphite.png') },
];

export const supportsAppIcons = () => supportsAlternateIcons;
export const getAppIcon = () => getAppIconName();
export const setAppIcon = (name: string | null) => setAlternateAppIcon(name);
