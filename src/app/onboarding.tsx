import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/controls';
import { HabitGlyph, HabitIcon } from '@/components/ui/habit-icon';
import { Icon } from '@/components/ui/icon';
import { TimeField } from '@/components/ui/pickers';
import { Text } from '@/components/ui/text';
import { resolveIconKey } from '@/constants/habit-icons';
import { CATEGORY_ICONS, CATEGORY_LABELS, HABIT_COLORS } from '@/constants/palette';
import { useActions, useHabitData, useSettings, useUpdateSettings } from '@/data/hooks';
import { starterSuggestions } from '@/domain/templates';
import type { FirstDayOfWeek, HabitCategory } from '@/domain/types';
import { todayLocal } from '@/lib/clock';
import { isSupabaseConfigured } from '@/config/env';
import { useTheme } from '@/theme/theme';
import { MAX_CONTENT_WIDTH, radius, spacing } from '@/theme/tokens';

const AREAS: HabitCategory[] = ['health', 'fitness', 'learning', 'productivity', 'mindfulness', 'sleep', 'personal'];
const STEPS = 4;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const settings = useSettings();
  const update = useUpdateSettings();
  const actions = useActions();
  const { lists } = useHabitData();
  const [step, setStep] = useState(0);
  const [areas, setAreas] = useState<HabitCategory[]>(settings.focusAreas);
  const [fdw, setFdw] = useState<FirstDayOfWeek>(settings.firstDayOfWeek);
  const [times, setTimes] = useState(settings.defaultReminderTimes);
  const suggestions = starterSuggestions(areas);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const finish = async (createStarters: boolean) => {
    setSaving(true);
    await update({ onboardingCompleted: true, focusAreas: areas, firstDayOfWeek: fdw, defaultReminderTimes: times });
    const listId = lists.find((l) => !l.archivedOn)?.id;
    if (createStarters && listId) {
      let i = 0;
      for (const s of suggestions.filter((x) => picked.has(x.name))) {
        await actions.createHabit({
          name: s.name,
          description: s.description,
          icon: resolveIconKey(s.icon),
          color: HABIT_COLORS[i++ % HABIT_COLORS.length],
          listId,
          category: s.category,
          timeOfDay: s.timeOfDay,
          kind: s.kind,
          target: s.target,
          unit: s.unit,
          targetDirection: s.targetDirection,
          rule: s.rule,
          startDate: todayLocal(),
          endDate: null,
          reminders: [], // reminders are only added when the user sets them up
        });
      }
    }
    setSaving(false);
    router.replace('/today');
  };

  const skip = () => void finish(false);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.top}>
        <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i <= step ? colors.accent : colors.border, width: i === step ? 20 : 8 }]} />
          ))}
        </View>
        <Button title="Skip" variant="ghost" size="sm" onPress={skip} accessibilityHint="Skips the introduction and opens Today" />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View key={step} entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.step}>
          {step === 0 && (
            <>
              <HabitIcon icon="plant" color={colors.accent} size={72} />
              <Text variant="display" accessibilityRole="header">
                Small habits,{'\n'}steady progress.
              </Text>
              <Text tone="secondary">HabitFlow keeps your daily routine simple: check things off, see your progress, and stay consistent.</Text>
              {[
                ['checkCircle', 'One tap to complete — and fix any past day whenever you need'],
                ['lists', 'Separate lists for mornings, workouts, study or work'],
                ['stats', 'Clear daily progress, streaks that are never inflated'],
                ['lock', 'Works offline, no account needed, your data stays yours'],
              ].map(([icon, text]) => (
                <View key={text} style={styles.point}>
                  <Icon name={icon as 'lock'} size={20} color={colors.accent} />
                  <Text style={styles.flex}>{text}</Text>
                </View>
              ))}
              {isSupabaseConfigured && (
                <Button
                  title="Already have an account? Sign in"
                  variant="ghost"
                  size="sm"
                  style={styles.signIn}
                  onPress={() => router.push('/sign-in')}
                  accessibilityHint="Optional. Restores your habits from your account."
                />
              )}
            </>
          )}

          {step === 1 && (
            <>
              <Text variant="title" accessibilityRole="header">
                What would you like to improve?
              </Text>
              <Text tone="secondary">Pick any that apply. This only tailors suggestions.</Text>
              <View style={styles.grid}>
                {AREAS.map((a) => {
                  const selected = areas.includes(a);
                  return (
                    <Pressable
                      key={a}
                      onPress={() => setAreas(selected ? areas.filter((x) => x !== a) : [...areas, a])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={CATEGORY_LABELS[a]}
                      style={[styles.area, { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.border }]}>
                      <HabitGlyph icon={CATEGORY_ICONS[a]} size={26} color={selected ? colors.accent : colors.textSecondary} />
                      <Text variant="captionStrong">{CATEGORY_LABELS[a]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {step === 2 && (
            <>
              <Text variant="title" accessibilityRole="header">
                Your rhythm
              </Text>
              <Text variant="captionStrong" tone="secondary">
                Week starts on
              </Text>
              <SegmentedControl<string>
                accessibilityLabel="First day of the week"
                value={String(fdw)}
                onChange={(v) => setFdw(Number(v) as FirstDayOfWeek)}
                options={[
                  { value: '1', label: 'Monday' },
                  { value: '0', label: 'Sunday' },
                  { value: '6', label: 'Saturday' },
                ]}
              />
              <Text variant="captionStrong" tone="secondary">
                Preferred reminder times
              </Text>
              {(['morning', 'afternoon', 'evening'] as const).map((slot) => (
                <View key={slot} style={[styles.timeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.flex}>{slot[0].toUpperCase() + slot.slice(1)}</Text>
                  <TimeField label={`${slot} reminder time`} value={times[slot]} onChange={(t) => setTimes({ ...times, [slot]: t })} />
                </View>
              ))}
              <Text variant="caption" tone="tertiary">
                These are just defaults. We’ll only ask for notification permission when you add your first reminder.
              </Text>
            </>
          )}

          {step === 3 && (
            <>
              <Text variant="title" accessibilityRole="header">
                Start with a few habits?
              </Text>
              <Text tone="secondary">
                {suggestions.length > 0 ? 'Tap to select. You can edit or remove them later.' : 'You can create your first habit on the next screen.'}
              </Text>
              {suggestions.map((s) => {
                const selected = picked.has(s.name);
                return (
                  <Pressable
                    key={s.name}
                    onPress={() => {
                      const next = new Set(picked);
                      if (selected) next.delete(s.name);
                      else next.add(s.name);
                      setPicked(next);
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    style={[styles.suggestion, { backgroundColor: colors.surface, borderColor: selected ? colors.accent : colors.border }]}>
                    <HabitIcon icon={s.icon} color={colors.accent} size={40} />
                    <View style={styles.flex}>
                      <Text variant="bodyStrong">{s.name}</Text>
                      {s.rationale ? (
                        <Text variant="caption" tone="secondary">
                          {s.rationale}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.check, { borderColor: selected ? colors.accent : colors.borderStrong, backgroundColor: selected ? colors.accent : 'transparent' }]}>
                      {selected && <Icon name="check" size={14} color={colors.onAccent} />}
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 && <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} style={styles.flex} />}
        {step < STEPS - 1 ? (
          <Button title={step === 0 ? 'Get started' : 'Continue'} onPress={() => setStep(step + 1)} style={styles.flex} />
        ) : (
          <Button
            title={picked.size > 0 ? `Add ${picked.size} habit${picked.size === 1 ? '' : 's'}` : 'Finish'}
            loading={saving}
            onPress={() => void finish(true)}
            style={styles.flex}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  content: { padding: spacing.xl, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  step: { gap: spacing.lg },
  point: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  signIn: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  area: { width: '47%', flexGrow: 1, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 2, gap: spacing.xs },
  timeRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
});
