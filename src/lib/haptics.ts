import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const { AndroidHaptics, ImpactFeedbackStyle, NotificationFeedbackType } = Haptics;

/**
 * Android system haptic constants feel closest to iOS, but most were only standardised in
 * Android 14 (API 34): older versions reject them (SEGMENT_TICK, TOGGLE_*, DRAG_START) or OEMs
 * map them to nothing (CONFIRM/REJECT). Below that, use the vibrator-based effects, which
 * always fire. LONG_PRESS has been supported everywhere since API 1.
 */
const SYSTEM_HAPTICS = Platform.OS === 'android' && Number(Platform.Version) >= 34;

/**
 * Semantic haptics, so every screen gives the same feel for the same kind of action.
 * Calls are fire-and-forget.
 */
function play(android: Haptics.AndroidHaptics, fallback: () => Promise<void>) {
  const useSystem = SYSTEM_HAPTICS || (Platform.OS === 'android' && android === AndroidHaptics.Long_Press);
  const run = useSystem ? () => Haptics.performAndroidHapticsAsync(android).catch(fallback) : fallback;
  void run().catch(() => undefined);
}

export const haptics = {
  /** Picking one option from a set: segments, chips, pickers, days, steppers. */
  selection: () => play(AndroidHaptics.Segment_Tick, Haptics.selectionAsync),
  /** A switch or completion changing state. */
  toggle: (on: boolean) =>
    play(on ? AndroidHaptics.Toggle_On : AndroidHaptics.Toggle_Off, () =>
      Haptics.impactAsync(on ? ImpactFeedbackStyle.Light : ImpactFeedbackStyle.Soft),
    ),
  /** A long press that opens a contextual menu. */
  longPress: () => play(AndroidHaptics.Long_Press, () => Haptics.impactAsync(ImpactFeedbackStyle.Medium)),
  /** Picking up a row to drag. */
  dragStart: () => play(AndroidHaptics.Drag_Start, () => Haptics.impactAsync(ImpactFeedbackStyle.Medium)),
  /** Dropping a dragged row. */
  drop: () => play(AndroidHaptics.Gesture_End, () => Haptics.impactAsync(ImpactFeedbackStyle.Light)),
  /** Something worth celebrating finished: saved, signed in, all habits done. */
  success: () => play(AndroidHaptics.Confirm, () => Haptics.notificationAsync(NotificationFeedbackType.Success)),
  /** About to do something destructive, or an action that isn't allowed right now. */
  warning: () => play(AndroidHaptics.Reject, () => Haptics.notificationAsync(NotificationFeedbackType.Warning)),
  /** An action failed. */
  error: () => play(AndroidHaptics.Reject, () => Haptics.notificationAsync(NotificationFeedbackType.Error)),
};
