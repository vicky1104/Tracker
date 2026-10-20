import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIconPicker } from '@/components/settings/app-icon-picker';
import { Button } from '@/components/ui/button';
import { Row, SegmentedControl, SwitchRow } from '@/components/ui/controls';
import { Icon } from '@/components/ui/icon';
import { Card, Divider, Screen, SectionHeader } from '@/components/ui/layout';
import { TimeField } from '@/components/ui/pickers';
import { TabHeader } from '@/components/ui/tab-header';
import { Text } from '@/components/ui/text';
import { isSupabaseConfigured } from '@/config/env';
import { usePlan } from '@/config/plans';
import { useSettings, useUpdateSettings } from '@/data/hooks';
import type { FirstDayOfWeek, ThemePreference } from '@/domain/types';
import { useAuth } from '@/services/auth';
import { useAppStore } from '@/state/app-store';
import { useTheme } from '@/theme/theme';
import { ACCENTS, spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const { colors, scheme } = useTheme();
  const { premium, limits } = usePlan();
  const user = useAuth((s) => s.user);
  const sync = useAppStore((s) => s.sync);

  const syncLabel = !isSupabaseConfigured
    ? 'This device only'
    : !user
      ? 'Sign in'
      : sync.status === 'syncing'
        ? 'Syncing…'
        : sync.status === 'error'
          ? 'Sync problem'
          : sync.status === 'offline'
            ? 'Offline — changes saved'
            : sync.status === 'disabled'
              ? 'Signed in'
              : 'Synced';

  return (
    <Screen headerless>
      <TabHeader title="Settings" />
      {isSupabaseConfigured && !user && (
        <Card style={styles.gap}>
          <View style={styles.signInRow}>
            <Icon name="cloud" size={22} color={colors.accent} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">Back up & sync your habits</Text>
              <Text variant="caption" tone="secondary">
                Sign in or create a free account. Optional — HabitFlow works fully without one.
              </Text>
            </View>
          </View>
          <View style={styles.signInButtons}>
            <Button title="Sign in" size="sm" onPress={() => router.push('/sign-in')} style={styles.flex} />
            <Button
              title="Create account"
              size="sm"
              variant="secondary"
              onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'signup' } })}
              style={styles.flex}
            />
          </View>
        </Card>
      )}
      <SectionHeader title="Appearance" />
      <Card style={styles.gap}>
        <Text variant="captionStrong" tone="secondary">
          Theme
        </Text>
        <SegmentedControl<ThemePreference>
          accessibilityLabel="Theme"
          value={settings.theme}
          onChange={(theme) => void update({ theme })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <Text variant="captionStrong" tone="secondary">
          Accent
        </Text>
        <View style={styles.accents} accessibilityRole="radiogroup" accessibilityLabel="Accent color">
          {ACCENTS.map((a) => {
            const locked = a.premium && !limits.extraThemes;
            const selected = settings.accent === a.id;
            return (
              <Pressable
                key={a.id}
                onPress={() => (locked ? router.push('/premium') : void update({ accent: a.id }))}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${a.name}${locked ? ', premium' : ''}`}
                style={[styles.accent, { backgroundColor: scheme === 'dark' ? a.dark : a.light, borderColor: selected ? colors.text : 'transparent' }]}>
                {locked ? <Icon name="lock" size={14} color="#FFFFFF" /> : selected ? <Icon name="check" size={16} color="#FFFFFF" /> : null}
              </Pressable>
            );
          })}
        </View>
        <AppIconPicker locked={!limits.extraThemes} onLockedPress={() => router.push('/premium')} />
      </Card>

      <SectionHeader title="Calendar" />
      <Card style={styles.gap}>
        <Text variant="captionStrong" tone="secondary">
          Week starts on
        </Text>
        <SegmentedControl<string>
          accessibilityLabel="First day of the week"
          value={String(settings.firstDayOfWeek)}
          onChange={(v) => void update({ firstDayOfWeek: Number(v) as FirstDayOfWeek })}
          options={[
            { value: '1', label: 'Monday' },
            { value: '0', label: 'Sunday' },
            { value: '6', label: 'Saturday' },
          ]}
        />
        <Text variant="caption" tone="tertiary">
          Time zone: {settings.timeZone}. Days are recorded in your local time.
        </Text>
      </Card>

      <SectionHeader title="Reminders" />
      <Card padded={false}>
        <SwitchRow
          icon="bell"
          title="Habit reminders"
          subtitle="Turn off to pause all reminders without deleting them"
          value={settings.remindersEnabled}
          onValueChange={(remindersEnabled) => void update({ remindersEnabled })}
        />
        {isSupabaseConfigured && user && (
          <>
            <Divider inset={spacing.lg} />
            <SwitchRow
              icon="cloud"
              title="Streak protection"
              subtitle={
                limits.cloudSync
                  ? 'A push if a streak is about to break and you haven’t checked in yet'
                  : 'Needs cloud sync (Premium) so the server sees today’s progress'
              }
              value={settings.streakNudges}
              disabled={!limits.cloudSync}
              onValueChange={(streakNudges) => void update({ streakNudges })}
            />
            {settings.streakNudges && limits.cloudSync && (
              <View style={styles.timeRow}>
                <Text style={styles.flex}>Streak check time</Text>
                <TimeField
                  label="Streak protection time"
                  value={settings.streakNudgeTime}
                  onChange={(streakNudgeTime) => void update({ streakNudgeTime })}
                />
              </View>
            )}
          </>
        )}
        <Divider inset={spacing.lg} />
        {(['morning', 'afternoon', 'evening'] as const).map((slot) => (
          <View key={slot} style={styles.timeRow}>
            <Text style={styles.flex}>Default {slot} time</Text>
            <TimeField
              label={`Default ${slot} reminder time`}
              value={settings.defaultReminderTimes[slot]}
              onChange={(t) => void update({ defaultReminderTimes: { ...settings.defaultReminderTimes, [slot]: t } })}
            />
          </View>
        ))}
        <Divider inset={spacing.lg} />
        <Row icon="warning" title="Reminder troubleshooting" subtitle="Permissions, scheduled reminders, test notification" onPress={() => router.push('/settings/reminders')} />
      </Card>

      <SectionHeader title="Planning" />
      <Card padded={false}>
        <Row icon="sparkles" title="Habit planner" subtitle="Turn a goal into a few small habits" onPress={() => router.push('/planner')} />
        <Divider inset={spacing.lg} />
        <Row icon="archive" title="Archived lists & habits" onPress={() => router.push('/lists/archive')} />
      </Card>

      <SectionHeader title="Your data" />
      <Card padded={false}>
        <Row
          icon="person"
          title="Account & sync"
          value={syncLabel}
          onPress={() => router.push(isSupabaseConfigured && !user ? '/sign-in' : '/settings/account')}
        />
        <Divider inset={spacing.lg} />
        <Row icon="download" title="Export, backup & restore" onPress={() => router.push('/settings/data')} />
        <Divider inset={spacing.lg} />
        <Row icon="lock" title="Privacy" onPress={() => router.push('/settings/privacy')} />
      </Card>

      <SectionHeader title="HabitFlow" />
      <Card padded={false}>
        <Row icon="premium" title="Premium" value={premium ? 'Active' : undefined} subtitle={premium ? undefined : 'Plans, restore purchases'} onPress={() => router.push('/premium')} />
        <Divider inset={spacing.lg} />
        <Row icon="restore" title="Show the introduction again" onPress={() => void update({ onboardingCompleted: false }).then(() => router.push('/onboarding'))} />
      </Card>
      <Text variant="caption" tone="tertiary" style={styles.center}>
        HabitFlow {Constants.expoConfig?.version ?? ''} · Your habits are stored on this device first.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  accents: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  accent: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  signInRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  signInButtons: { flexDirection: 'row', gap: spacing.sm },
  timeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 52 },
  center: { textAlign: 'center' },
});
