import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Platform, StyleSheet, View } from 'react-native';

import { PermissionNotice, usePermissionState } from '@/components/habit/reminder-editor';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/controls';
import { Card, Divider, Notice, Screen, SectionHeader } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { useDb } from '@/data/database';
import { useHabitData, useSettings } from '@/data/hooks';
import { errorMessage } from '@/lib/errors';
import { listUpcoming, openSystemSettings, sendTestNotification, syncReminders, type SyncResult, type UpcomingReminder } from '@/services/notifications';
import { isSupabaseConfigured } from '@/config/env';
import { describePushStatus, syncPushRegistration, type PushStatus } from '@/services/push';
import { showToast } from '@/state/app-store';
import { spacing } from '@/theme/tokens';

export default function ReminderTroubleshootingScreen() {
  const db = useDb();
  const settings = useSettings();
  const data = useHabitData();
  const [permission, refreshPermission] = usePermissionState();
  // Checking also re-schedules, so opening this screen fixes most stale states.
  const check = useQuery({
    queryKey: ['reminder-check'],
    queryFn: async (): Promise<{ sync: SyncResult; upcoming: UpcomingReminder[]; push: PushStatus }> => ({
      sync: await syncReminders(db),
      upcoming: await listUpcoming(),
      push: await syncPushRegistration(db),
    }),
    staleTime: 0,
    gcTime: 0,
  });
  const upcoming = check.data?.upcoming ?? [];
  const lastSync = check.data?.sync ?? null;
  const busy = check.isFetching;
  const refresh = async () => {
    await refreshPermission();
    const r = await check.refetch();
    if (r.error) showToast({ message: errorMessage(r.error, 'Could not check reminders.'), tone: 'error' });
  };

  const enabledReminders = data.reminders.filter((r) => r.enabled).length;
  const statusText =
    !settings.remindersEnabled
      ? 'Reminders are paused in Settings.'
      : permission === 'denied'
        ? 'Notifications are blocked for HabitFlow.'
        : permission === 'undetermined'
          ? 'HabitFlow hasn’t been allowed to send notifications yet.'
          : enabledReminders === 0
            ? 'None of your habits have reminders yet.'
            : `${upcoming.length} reminder${upcoming.length === 1 ? '' : 's'} scheduled on this device.`;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Reminders', headerLargeTitle: false }} />
      <Card style={styles.gap}>
        <Text variant="heading">Status</Text>
        <Text tone="secondary" accessibilityLiveRegion="polite">
          {statusText}
        </Text>
        <PermissionNotice state={permission} onChange={refresh} />
        <View style={styles.row}>
          <Button title="Re-schedule now" icon="sync" variant="secondary" size="sm" loading={busy} onPress={refresh} />
          <Button
            title="Send test in 5s"
            icon="bell"
            variant="secondary"
            size="sm"
            disabled={permission !== 'granted' && permission !== 'provisional'}
            onPress={() =>
              void sendTestNotification()
                .then(() => showToast({ message: 'Test notification scheduled — lock your phone to see it.' }))
                .catch((e) => showToast({ message: errorMessage(e), tone: 'error' }))
            }
          />
        </View>
        {check.data && isSupabaseConfigured && (
          <Text variant="caption" tone="secondary">
            Streak protection: {describePushStatus(check.data.push)}
          </Text>
        )}
        {lastSync && (
          <Text variant="caption" tone="tertiary">
            Last check: {lastSync.planned} planned · {lastSync.scheduled} added · {lastSync.cancelled} removed
          </Text>
        )}
      </Card>

      <SectionHeader title="Next reminders" />
      <Card padded={false}>
        {upcoming.length === 0 ? (
          <Row icon="bellOff" title="Nothing scheduled" />
        ) : (
          upcoming.slice(0, 10).map((u, i) => (
            <View key={u.identifier}>
              {i > 0 && <Divider inset={spacing.lg} />}
              <Row
                title={u.title}
                value={u.fireAt ? u.fireAt.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : undefined}
              />
            </View>
          ))
        )}
      </Card>

      <SectionHeader title="If reminders don’t arrive" />
      <Card style={styles.gap}>
        {[
          'Open HabitFlow at least once every couple of weeks. Reminders are planned up to 14 days ahead (iOS allows 64 pending notifications per app), and opening the app extends the window.',
          'Reminders are skipped for days you’ve already completed or skipped, and for archived habits.',
          Platform.OS === 'android'
            ? 'On Android, battery optimisation can delay notifications. In system settings, set HabitFlow’s battery usage to “Unrestricted”, and make sure the “Habit reminders” channel is enabled.'
            : 'On iPhone, check that Focus modes or Scheduled Summary aren’t holding HabitFlow’s notifications.',
          'After restarting your phone, reminders are restored automatically. If you changed time zones, open the app once so reminders follow your new local time.',
        ].map((t) => (
          <Text key={t} variant="caption" tone="secondary">
            • {t}
          </Text>
        ))}
        <Button title="Open system notification settings" variant="ghost" size="sm" onPress={openSystemSettings} />
      </Card>
      {Platform.OS === 'android' && (
        <Notice
          icon="info"
          message="Notifications on Android 12+ may arrive a few minutes late unless exact alarms are allowed. HabitFlow uses standard (battery-friendly) scheduling."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
