import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { SwitchRow } from '@/components/ui/controls';
import { Icon } from '@/components/ui/icon';
import { Card, Notice, Screen, SectionHeader } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { env } from '@/config/env';
import { errorMessage } from '@/lib/errors';
import { getOffers, isPurchasesConfigured, purchase, restorePurchases, setDeveloperPremium, type PlanOffer } from '@/services/purchases';
import { showToast, useAppStore } from '@/state/app-store';
import { useTheme } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

const FREE = [
  'Unlimited habits and lists',
  'One-tap daily tracking',
  'Edit any past day',
  'Standard reminders',
  'Streaks, 7/30-day stats, heatmap',
  'Light & dark themes',
  'JSON / CSV export and local backups',
];
const PREMIUM = [
  'Long-term trends, weekday insights, all-time stats',
  'Cloud backup & sync across devices',
  'More AI planner suggestions per day',
  'Multi-week planning programs',
  'Extra accent themes',
];

export default function PremiumScreen() {
  const { colors } = useTheme();
  const entitlement = useAppStore((s) => s.entitlement);
  const configured = isPurchasesConfigured();
  const offers = useQuery({ queryKey: ['offers'], queryFn: getOffers, enabled: configured, networkMode: 'online', staleTime: 10 * 60_000 });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  const chosen: PlanOffer | undefined = offers.data?.find((o) => o.id === selected) ?? offers.data?.[0];
  const storeName = Platform.OS === 'ios' ? 'Apple ID' : 'Google Play account';

  const buy = async () => {
    if (!chosen) return;
    setBusy('buy');
    try {
      const outcome = await purchase(chosen);
      if (outcome === 'success') {
        showToast({ message: 'Welcome to Premium — thank you!' });
        router.back();
      } else if (outcome === 'pending') {
        showToast({ message: 'Your purchase is pending approval. Premium unlocks as soon as it completes.' });
      } else if (outcome === 'not-entitled') {
        showToast({ message: 'The purchase finished but Premium isn’t active yet. Try “Restore purchases”.', tone: 'error' });
      }
    } catch (error) {
      showToast({ message: errorMessage(error, 'The purchase couldn’t be completed. You have not been charged.'), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      const e = await restorePurchases();
      showToast({ message: e.premium ? 'Purchases restored — Premium is active.' : 'No active subscription was found for this account.' });
    } catch (error) {
      showToast({ message: errorMessage(error, 'Couldn’t restore purchases. Check your connection and try again.'), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerLeft: () => <Button title="Close" variant="ghost" size="sm" onPress={() => router.back()} /> }} />

      {entitlement.premium ? (
        <Card style={styles.gap}>
          <Text variant="title">Premium is active</Text>
          <Text tone="secondary">
            {entitlement.source === 'developer'
              ? 'Developer override (debug builds only).'
              : entitlement.expiresAt
                ? `${entitlement.willRenew ? 'Renews' : 'Ends'} on ${new Date(entitlement.expiresAt).toLocaleDateString()}.`
                : 'Lifetime access.'}
          </Text>
          {entitlement.managementUrl && (
            <Button title="Manage subscription" variant="secondary" onPress={() => void Linking.openURL(entitlement.managementUrl!)} />
          )}
        </Card>
      ) : (
        <Text tone="secondary">HabitFlow is fully usable for free. Premium adds extras for people who want more insight and sync — it never locks your own data.</Text>
      )}

      <SectionHeader title="Always free" />
      <Card style={styles.gapSm}>
        {FREE.map((f) => (
          <View key={f} style={styles.feature}>
            <Icon name="check" size={16} color={colors.accent} />
            <Text style={styles.flex}>{f}</Text>
          </View>
        ))}
      </Card>
      <SectionHeader title="Premium" />
      <Card style={styles.gapSm}>
        {PREMIUM.map((f) => (
          <View key={f} style={styles.feature}>
            <Icon name="star" size={16} color={colors.warning} />
            <Text style={styles.flex}>{f}</Text>
          </View>
        ))}
      </Card>

      {!entitlement.premium &&
        (!configured ? (
          <Notice icon="info" message="In-app purchases aren’t set up in this build." />
        ) : offers.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : offers.error || !offers.data?.length ? (
          <Notice
            icon="warning"
            tone="warning"
            message="Plans couldn’t be loaded from the store. Check your connection and try again."
            action={<Button title="Retry" variant="ghost" size="sm" onPress={() => void offers.refetch()} />}
          />
        ) : (
          <>
            <View style={styles.gapSm} accessibilityRole="radiogroup" accessibilityLabel="Plans">
              {offers.data.map((o) => {
                const isSel = chosen?.id === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => setSelected(o.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSel }}
                    accessibilityLabel={`${o.title}, ${o.price} per ${o.periodLabel}${o.intro ? `, intro offer ${o.intro}` : ''}`}
                    style={[styles.offer, { borderColor: isSel ? colors.accent : colors.border, backgroundColor: colors.surface }]}>
                    <View style={styles.flex}>
                      <Text variant="bodyStrong">{o.title}</Text>
                      {o.intro && (
                        <Text variant="caption" tone="accent">
                          Intro: {o.intro}
                        </Text>
                      )}
                    </View>
                    <Text variant="bodyStrong">
                      {o.price}
                      <Text variant="caption" tone="secondary">
                        {' '}
                        / {o.periodLabel}
                      </Text>
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button title={chosen ? `Continue — ${chosen.price} / ${chosen.periodLabel}` : 'Continue'} onPress={() => void buy()} loading={busy === 'buy'} disabled={!chosen} />
            <Text variant="caption" tone="tertiary">
              Payment is charged to your {storeName} when you confirm. {chosen?.periodLabel !== 'one-time'
                ? `The subscription renews automatically every ${chosen?.periodLabel ?? 'period'} at the price shown unless cancelled at least 24 hours before the end of the current period. ${
                    chosen?.intro ? 'Any unused part of a free trial ends when you subscribe. ' : ''
                  }Manage or cancel any time in your ${storeName} subscription settings.`
                : ''}
            </Text>
          </>
        ))}

      {configured && <Button title="Restore purchases" variant="ghost" onPress={() => void restore()} loading={busy === 'restore'} />}

      <View style={styles.links}>
        {env.termsUrl ? <Button title="Terms" variant="ghost" size="sm" onPress={() => void WebBrowser.openBrowserAsync(env.termsUrl)} /> : null}
        {env.privacyPolicyUrl ? <Button title="Privacy" variant="ghost" size="sm" onPress={() => void WebBrowser.openBrowserAsync(env.privacyPolicyUrl)} /> : null}
      </View>

      {__DEV__ && (
        <Card padded={false} style={{ borderRadius: radius.md }}>
          <SwitchRow title="Developer: simulate Premium" subtitle="Debug builds only — not available in release" value={entitlement.source === 'developer'} onValueChange={setDeveloperPremium} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  gapSm: { gap: spacing.sm },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  offer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 2 },
  links: { flexDirection: 'row', justifyContent: 'center' },
});
