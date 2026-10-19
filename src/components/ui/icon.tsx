import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

/** App icon set, mapped to SF Symbols (iOS) and Material Symbols (Android/web). */
const ICONS = {
  add: { ios: 'plus', android: 'add' },
  check: { ios: 'checkmark', android: 'check' },
  close: { ios: 'xmark', android: 'close' },
  minus: { ios: 'minus', android: 'remove' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more' },
  up: { ios: 'arrow.up', android: 'arrow_upward' },
  down: { ios: 'arrow.down', android: 'arrow_downward' },
  more: { ios: 'ellipsis', android: 'more_horiz' },
  edit: { ios: 'pencil', android: 'edit' },
  delete: { ios: 'trash', android: 'delete' },
  archive: { ios: 'archivebox', android: 'archive' },
  unarchive: { ios: 'arrow.uturn.backward', android: 'unarchive' },
  duplicate: { ios: 'doc.on.doc', android: 'content_copy' },
  bell: { ios: 'bell', android: 'notifications' },
  bellOff: { ios: 'bell.slash', android: 'notifications_off' },
  search: { ios: 'magnifyingglass', android: 'search' },
  drag: { ios: 'line.3.horizontal', android: 'drag_indicator' },
  skip: { ios: 'forward.end', android: 'skip_next' },
  missed: { ios: 'xmark', android: 'block' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome' },
  cloud: { ios: 'icloud', android: 'cloud' },
  cloudOff: { ios: 'icloud.slash', android: 'cloud_off' },
  sync: { ios: 'arrow.triangle.2.circlepath', android: 'sync' },
  lock: { ios: 'lock.fill', android: 'lock' },
  star: { ios: 'star.fill', android: 'star' },
  download: { ios: 'square.and.arrow.down', android: 'download' },
  upload: { ios: 'square.and.arrow.up', android: 'upload' },
  person: { ios: 'person.crop.circle', android: 'person' },
  palette: { ios: 'paintpalette', android: 'palette' },
  info: { ios: 'info.circle', android: 'info' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  premium: { ios: 'crown', android: 'workspace_premium' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  today: { ios: 'checklist', android: 'checklist' },
  lists: { ios: 'list.bullet', android: 'format_list_bulleted' },
  stats: { ios: 'chart.bar', android: 'bar_chart' },
  settings: { ios: 'gearshape', android: 'settings' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo' },
  restore: { ios: 'clock.arrow.circlepath', android: 'restore' },
  clock: { ios: 'clock', android: 'schedule' },
  history: { ios: 'clock.arrow.circlepath', android: 'history' },
  insights: { ios: 'chart.line.uptrend.xyaxis', android: 'insights' },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  const def = ICONS[name];
  return (
    <SymbolView
      name={{ ios: def.ios, android: def.android, web: def.android }}
      size={size}
      tintColor={color}
      style={[{ width: size, height: size }, style]}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
