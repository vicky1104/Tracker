/**
 * Icons for habits and lists. Stored in the database as a short key (e.g.
 * "water"); rendered as SF Symbols on iOS and Material Symbols on Android/web.
 * Keys are stable — never rename one, only add new ones.
 */
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

export interface IconDef {
  label: string;
  ios: SFSymbol;
  android: AndroidSymbol;
}

export const ICON_CATALOG = {
  check: { label: 'Check', ios: 'checkmark.circle.fill', android: 'check_circle' },
  water: { label: 'Water', ios: 'drop.fill', android: 'water_drop' },
  run: { label: 'Running', ios: 'figure.run', android: 'directions_run' },
  walk: { label: 'Walking', ios: 'figure.walk', android: 'directions_walk' },
  hike: { label: 'Hiking', ios: 'figure.hiking', android: 'hiking' },
  strength: { label: 'Strength', ios: 'dumbbell.fill', android: 'fitness_center' },
  yoga: { label: 'Yoga', ios: 'figure.mind.and.body', android: 'self_improvement' },
  bike: { label: 'Cycling', ios: 'bicycle', android: 'directions_bike' },
  swim: { label: 'Swimming', ios: 'figure.pool.swim', android: 'pool' },
  sport: { label: 'Sport', ios: 'soccerball', android: 'sports_soccer' },
  food: { label: 'Meal', ios: 'fork.knife', android: 'restaurant' },
  veggie: { label: 'Vegetables', ios: 'carrot.fill', android: 'nutrition' },
  pill: { label: 'Medication', ios: 'pills.fill', android: 'medication' },
  tooth: { label: 'Dental care', ios: 'mouth.fill', android: 'dentistry' },
  shower: { label: 'Shower', ios: 'shower.fill', android: 'shower' },
  skincare: { label: 'Self-care', ios: 'face.smiling.inverse', android: 'face' },
  sleep: { label: 'Sleep', ios: 'bed.double.fill', android: 'bed' },
  moon: { label: 'Night', ios: 'moon.fill', android: 'bedtime' },
  alarm: { label: 'Alarm', ios: 'alarm.fill', android: 'alarm' },
  sun: { label: 'Sun', ios: 'sun.max.fill', android: 'light_mode' },
  sunrise: { label: 'Morning', ios: 'sunrise.fill', android: 'wb_twilight' },
  book: { label: 'Reading', ios: 'book.fill', android: 'menu_book' },
  books: { label: 'Study', ios: 'books.vertical.fill', android: 'library_books' },
  school: { label: 'School', ios: 'graduationcap.fill', android: 'school' },
  pencil: { label: 'Writing', ios: 'pencil', android: 'edit' },
  note: { label: 'Notes', ios: 'note.text', android: 'sticky_note_2' },
  target: { label: 'Focus', ios: 'target', android: 'track_changes' },
  brain: { label: 'Mind', ios: 'brain.head.profile', android: 'psychology' },
  laptop: { label: 'Computer', ios: 'laptopcomputer', android: 'laptop_mac' },
  work: { label: 'Work', ios: 'briefcase.fill', android: 'work' },
  paint: { label: 'Art', ios: 'paintbrush.fill', android: 'brush' },
  music: { label: 'Music', ios: 'music.note', android: 'music_note' },
  language: { label: 'Language', ios: 'character.bubble.fill', android: 'translate' },
  mindful: { label: 'Mindfulness', ios: 'sparkles', android: 'spa' },
  plant: { label: 'Growth', ios: 'leaf.fill', android: 'eco' },
  houseplant: { label: 'Plants', ios: 'camera.macro', android: 'potted_plant' },
  home: { label: 'Home', ios: 'house.fill', android: 'home' },
  clean: { label: 'Cleaning', ios: 'bubbles.and.sparkles.fill', android: 'cleaning_services' },
  laundry: { label: 'Laundry', ios: 'washer.fill', android: 'local_laundry_service' },
  money: { label: 'Savings', ios: 'banknote.fill', android: 'savings' },
  phoneOff: { label: 'Phone-free', ios: 'iphone.slash', android: 'mobile_off' },
  phone: { label: 'Phone', ios: 'iphone', android: 'smartphone' },
  coffee: { label: 'Coffee', ios: 'cup.and.saucer.fill', android: 'coffee' },
  noSmoking: { label: 'No smoking', ios: 'nosign', android: 'smoke_free' },
  wine: { label: 'Alcohol', ios: 'wineglass.fill', android: 'wine_bar' },
  gratitude: { label: 'Gratitude', ios: 'hands.sparkles.fill', android: 'volunteer_activism' },
  heart: { label: 'Health', ios: 'heart.fill', android: 'favorite' },
  smile: { label: 'Mood', ios: 'face.smiling', android: 'mood' },
  people: { label: 'Social', ios: 'person.2.fill', android: 'group' },
  call: { label: 'Call', ios: 'phone.fill', android: 'call' },
  pet: { label: 'Pet', ios: 'pawprint.fill', android: 'pets' },
  timer: { label: 'Timer', ios: 'timer', android: 'timer' },
  calendar: { label: 'Planning', ios: 'calendar', android: 'calendar_month' },
  list: { label: 'Checklist', ios: 'checklist', android: 'checklist' },
  inbox: { label: 'Inbox', ios: 'tray.fill', android: 'inbox' },
  flag: { label: 'Goal', ios: 'flag.fill', android: 'flag' },
  trophy: { label: 'Achievement', ios: 'trophy.fill', android: 'emoji_events' },
  bolt: { label: 'Energy', ios: 'bolt.fill', android: 'bolt' },
  flame: { label: 'Streak', ios: 'flame.fill', android: 'local_fire_department' },
  mountain: { label: 'Challenge', ios: 'mountain.2.fill', android: 'landscape' },
  star: { label: 'Star', ios: 'star.fill', android: 'star' },
} as const satisfies Record<string, IconDef>;

export type HabitIconKey = keyof typeof ICON_CATALOG;

export const HABIT_ICON_KEYS = Object.keys(ICON_CATALOG) as HabitIconKey[];

export const LIST_ICON_KEYS: HabitIconKey[] = [
  'list', 'sunrise', 'strength', 'books', 'work', 'moon', 'home', 'heart', 'target', 'yoga', 'plant', 'star',
];

export function isIconKey(value: string): value is HabitIconKey {
  return Object.prototype.hasOwnProperty.call(ICON_CATALOG, value);
}

/** Emoji used by earlier builds → icon keys (data from old backups or other devices). */
export const LEGACY_EMOJI_ICONS: Record<string, HabitIconKey> = {
  '✅': 'check', '💧': 'water', '🏃': 'run', '🚶': 'walk', '🏋️': 'strength', '🏋': 'strength', '🧘': 'yoga',
  '🚴': 'bike', '🏊': 'swim', '🥗': 'food', '🥦': 'veggie', '🍎': 'food', '💊': 'pill', '😴': 'sleep',
  '🛏️': 'sleep', '🛏': 'sleep', '⏰': 'alarm', '🌅': 'sunrise', '🌙': 'moon', '📖': 'book', '📚': 'books',
  '✍️': 'pencil', '✍': 'pencil', '📝': 'note', '🎯': 'target', '🧠': 'brain', '💻': 'laptop', '🎨': 'paint',
  '🎸': 'music', '🎹': 'music', '🗣️': 'language', '🗣': 'language', '🌱': 'plant', '🪴': 'houseplant',
  '🧹': 'clean', '🧺': 'laundry', '💰': 'money', '📵': 'phoneOff', '📱': 'phone', '☕': 'coffee',
  '🚭': 'noSmoking', '🍷': 'wine', '🙏': 'gratitude', '❤️': 'heart', '❤': 'heart', '😊': 'smile',
  '🤝': 'people', '📞': 'call', '🐶': 'pet', '🦷': 'tooth', '🧴': 'skincare', '☀️': 'sun', '☀': 'sun',
  '✨': 'mindful', '📋': 'list', '💪': 'strength', '💼': 'work', '🏠': 'home', '⭐': 'star', '🎒': 'books',
  '🗂️': 'books', '🗂': 'books', '🌿': 'plant', '🛣️': 'run', '🛣': 'run', '📥': 'inbox', '🗓️': 'calendar',
  '🗓': 'calendar', '🔥': 'flame',
};

/** Resolves any stored value (key or legacy emoji) to a renderable icon key. */
export function resolveIconKey(value: string | null | undefined): HabitIconKey {
  if (!value) return 'check';
  if (isIconKey(value)) return value;
  return LEGACY_EMOJI_ICONS[value] ?? LEGACY_EMOJI_ICONS[value.replace(/️/g, '')] ?? 'check';
}

export function iconLabel(value: string | null | undefined): string {
  return ICON_CATALOG[resolveIconKey(value)].label;
}
