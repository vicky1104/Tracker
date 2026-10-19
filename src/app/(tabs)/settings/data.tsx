import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/controls';
import { Card, Divider, Notice, Screen, SectionHeader } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { useDb } from '@/data/database';
import { useActions } from '@/data/hooks';
import { formatLocalDate } from '@/domain/dates';
import { errorMessage } from '@/lib/errors';
import { listAutoBackups, pickBackupFile, restoreFromAutoBackup, shareCsvExport, shareJsonBackup } from '@/services/backup-files';
import { showToast } from '@/state/app-store';
import { spacing } from '@/theme/tokens';

export default function DataScreen() {
  const db = useDb();
  const actions = useActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [backups, setBackups] = useState(listAutoBackups);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      showToast({ message: errorMessage(error, 'That didn’t work. Your data is unchanged.'), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const restoreFrom = (load: () => Promise<unknown | null>) =>
    run('restore', async () => {
      const raw = await load();
      if (raw == null) return;
      const result = await actions.restoreBackup(raw);
      if (result && typeof result === 'object') {
        showToast({ message: `Restored ${result.written} records. ${result.skipped} were already up to date.` });
      }
    });

  const confirmRestore = (label: string, load: () => Promise<unknown | null>) =>
    Alert.alert(
      'Restore from backup?',
      `${label}\n\nRestoring merges the backup with your current data: missing records are added and older ones updated. Nothing newer on this device is overwritten.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => void restoreFrom(load) },
      ],
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Export & backup', headerLargeTitle: false }} />
      <Text tone="secondary">
        Your data belongs to you. Exports are free, include everything, and use open formats.
      </Text>

      <SectionHeader title="Export" />
      <Card padded={false}>
        <Row
          icon="upload"
          title="Full backup (JSON)"
          subtitle="Lists, habits, schedules, reminders, history and settings. Can be restored on any device."
          onPress={() => void run('json', () => shareJsonBackup(db))}
          disabled={busy != null}
        />
        <Divider inset={spacing.lg} />
        <Row
          icon="upload"
          title="History spreadsheet (CSV)"
          subtitle="One row per logged day — opens in Excel, Numbers or Google Sheets."
          onPress={() => void run('csv', () => shareCsvExport(db))}
          disabled={busy != null}
        />
      </Card>

      <SectionHeader title="Restore" />
      <Card padded={false}>
        <Row
          icon="download"
          title="Restore from a backup file"
          onPress={() => confirmRestore('Choose a HabitFlow JSON backup file.', pickBackupFile)}
          disabled={busy != null}
        />
      </Card>

      <SectionHeader title="Automatic backups on this device" />
      <Card padded={false}>
        {backups.length === 0 ? (
          <Row icon="history" title="No automatic backups yet" subtitle="One is saved each day you open the app (last 7 kept)." />
        ) : (
          backups.map((b, i) => (
            <View key={b.uri}>
              {i > 0 && <Divider inset={spacing.lg} />}
              <Row
                icon="history"
                title={formatLocalDate(b.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                value={`${Math.max(1, Math.round(b.size / 1024))} KB`}
                onPress={() => confirmRestore(`Backup from ${b.date}.`, async () => {
                  const result = await restoreFromAutoBackup(db, b.uri);
                  await actions.reloadAll();
                  showToast({ message: `Restored ${result.written} records. ${result.skipped} were already up to date.` });
                  return null;
                })}
              />
            </View>
          ))
        )}
      </Card>
      <Button title="Refresh list" variant="ghost" size="sm" onPress={() => setBackups(listAutoBackups())} />
      <Notice
        icon="info"
        message="Automatic backups stay on this device and are removed if you uninstall the app. For off-device safety, export a backup or turn on cloud sync."
      />
    </Screen>
  );
}
