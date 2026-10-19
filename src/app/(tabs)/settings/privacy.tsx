import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet } from 'react-native';

import { Row } from '@/components/ui/controls';
import { Card, Divider, Screen, SectionHeader } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { env } from '@/config/env';
import { spacing } from '@/theme/tokens';

const POINTS = [
  ['On your device first', 'Habits, history and settings are stored locally in an on-device database. HabitFlow works fully without an account or internet connection.'],
  ['No ads, no tracking', 'HabitFlow does not include advertising or third-party analytics SDKs.'],
  ['Cloud sync is optional', 'If you sign in and enable sync, your data is stored in a database where each record is only readable by your account (row-level security).'],
  ['AI planner', 'When you use the AI planner, only the goal text you type (and the names of your existing habits, to avoid duplicates) is sent to generate suggestions. Nothing is added until you confirm.'],
  ['Purchases', 'Subscriptions are processed by Apple or Google and managed through RevenueCat. HabitFlow receives your subscription status, never your payment details.'],
  ['Your control', 'Export everything as JSON or CSV at any time, erase all data on this device, or delete your account and cloud data from Account & sync.'],
];

export default function PrivacyScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Privacy', headerLargeTitle: false }} />
      {POINTS.map(([title, body]) => (
        <Card key={title} style={styles.gap}>
          <Text variant="bodyStrong">{title}</Text>
          <Text tone="secondary">{body}</Text>
        </Card>
      ))}
      <SectionHeader title="More" />
      <Card padded={false}>
        <Row icon="download" title="Export your data" onPress={() => router.push('/settings/data')} />
        <Divider inset={spacing.lg} />
        <Row icon="person" title="Delete account or device data" onPress={() => router.push('/settings/account')} />
        {env.privacyPolicyUrl ? (
          <>
            <Divider inset={spacing.lg} />
            <Row icon="info" title="Full privacy policy" onPress={() => void WebBrowser.openBrowserAsync(env.privacyPolicyUrl)} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.xs },
});
