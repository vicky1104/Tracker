import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/controls';
import { AuthForm } from '@/components/account/auth-form';
import { Card, Divider, Notice, Screen, SectionHeader } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { isSupabaseConfigured } from '@/config/env';
import { usePlan } from '@/config/plans';
import { useDb } from '@/data/database';
import { useActions } from '@/data/hooks';
import { getSettings } from '@/db/settings';
import { wipeLocalData } from '@/db/maintenance';
import { errorMessage } from '@/lib/errors';
import { deleteAccount, signOut, useAuth } from '@/services/auth';
import { syncNow } from '@/services/sync';
import { showToast, useAppStore } from '@/state/app-store';
import { spacing } from '@/theme/tokens';

export default function AccountScreen() {
  const db = useDb();
  const actions = useActions();
  const user = useAuth((s) => s.user);
  const sync = useAppStore((s) => s.sync);
  const { limits } = usePlan();
  const [busy, setBusy] = useState(false);

  const wipeDevice = () =>
    Alert.alert('Delete all data on this device?', 'All lists, habits, history and settings on this device will be permanently erased. Export a backup first if you might want them later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Erase everything',
        style: 'destructive',
        onPress: async () => {
          await wipeLocalData(db);
          await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
          useAppStore.getState().setSettings(await getSettings(db));
          await actions.reloadAll();
          showToast({ message: 'All data on this device was erased.' });
          router.replace('/onboarding');
        },
      },
    ]);

  const confirmDeleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      'Your account and all data stored in the cloud will be permanently deleted. Data on this device stays unless you also erase it.\n\nSubscriptions are billed by Apple or Google — cancel them in your store account settings to stop renewals.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteAccount();
              showToast({ message: 'Your account was deleted.' });
            } catch (error) {
              showToast({ message: errorMessage(error), tone: 'error' });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Account & sync', headerLargeTitle: false }} />

      {!isSupabaseConfigured ? (
        <Notice
          icon="cloudOff"
          title="Using HabitFlow on this device"
          message="Accounts and cloud sync aren’t set up in this build. Everything works offline, and you can export a full backup at any time."
          action={<Button title="Export & backup" variant="ghost" size="sm" onPress={() => router.push('/settings/data')} />}
        />
      ) : !user ? (
        <>
          <Text tone="secondary">
            An account is optional. It enables cloud backup & sync across devices (Premium) and the AI planner. You can keep using HabitFlow without one.
          </Text>
          <AuthForm />
        </>
      ) : (
        <>
          <Card padded={false}>
            <Row icon="person" title={user.email ?? 'Signed in'} subtitle="Signed in" />
            <Divider inset={spacing.lg} />
            <Row
              icon={sync.status === 'offline' ? 'cloudOff' : 'cloud'}
              title="Cloud sync"
              subtitle={
                !limits.cloudSync
                  ? 'Included with Premium'
                  : sync.status === 'syncing'
                    ? 'Syncing…'
                    : sync.status === 'offline'
                      ? 'Offline — changes are saved on this device and will sync later'
                      : sync.status === 'error'
                        ? `Will retry automatically${sync.error ? ` (${sync.error})` : ''}`
                        : sync.lastSyncedAt
                          ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString()}`
                          : 'Not synced yet'
              }
              value={sync.pending > 0 ? `${sync.pending} pending` : undefined}
            />
          </Card>
          {limits.cloudSync ? (
            <Button title="Sync now" icon="sync" variant="secondary" loading={sync.status === 'syncing'} onPress={() => void syncNow(db)} />
          ) : (
            <Button title="Learn about Premium sync" icon="premium" variant="secondary" onPress={() => router.push('/premium')} />
          )}
          <Button
            title="Sign out"
            variant="secondary"
            onPress={() =>
              Alert.alert('Sign out?', 'Your habits stay on this device. Changes made while signed out sync the next time you sign in.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', onPress: () => void signOut().catch((e) => showToast({ message: errorMessage(e), tone: 'error' })) },
              ])
            }
          />
          <SectionHeader title="Delete account" />
          <Button title="Delete account and cloud data" variant="danger" loading={busy} onPress={confirmDeleteAccount} />
        </>
      )}

      <SectionHeader title="This device" />
      <Button title="Erase all data on this device" variant="danger" onPress={wipeDevice} />
      <View style={styles.spacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  spacer: { height: spacing.xl },
});
