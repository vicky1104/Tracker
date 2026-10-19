import { router, Stack, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { AuthForm, type AuthMode } from '@/components/account/auth-form';
import { Button } from '@/components/ui/button';
import { HabitIcon } from '@/components/ui/habit-icon';
import { EmptyState, Notice, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { isSupabaseConfigured } from '@/config/env';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

/** Sign in / create account, presented as a modal from Settings or onboarding. */
export default function SignInScreen() {
  const { mode } = useLocalSearchParams<{ mode?: AuthMode }>();
  const user = useAuth((s) => s.user);
  const { colors } = useTheme();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/today'));

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerLeft: () => <Button title="Close" variant="ghost" size="sm" onPress={close} /> }} />
      <Screen keyboardShouldPersistTaps="handled">
        {!isSupabaseConfigured ? (
          <Notice
            icon="cloudOff"
            title="Accounts aren’t available in this build"
            message="HabitFlow works fully on this device. You can export a backup any time from Settings."
          />
        ) : user ? (
          <EmptyState
            icon="checkCircle"
            title="You’re signed in"
            message={user.email ?? undefined}
            actionLabel="Done"
            onAction={close}
          />
        ) : (
          <>
            <View style={styles.intro}>
              <HabitIcon icon="plant" color={colors.accent} size={56} />
              <Text variant="title" accessibilityRole="header">
                Your HabitFlow account
              </Text>
              <Text tone="secondary">
                Optional. Sign in to back up and sync your habits across devices and use AI suggestions. Everything keeps working without
                an account.
              </Text>
            </View>
            <AuthForm initialMode={mode === 'signup' ? 'signup' : 'signin'} onSignedIn={close} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { gap: spacing.sm, alignItems: 'flex-start' },
});
