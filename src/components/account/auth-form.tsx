import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type ComponentType } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { SegmentedControl, TextField } from '@/components/ui/controls';
import { Card, Notice } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { errorMessage } from '@/lib/errors';
import { loadAppleAuthentication, sendPasswordReset, signIn, signInWithApple, signInWithGoogle, signUp } from '@/services/auth';
import { showToast } from '@/state/app-store';
import { useTheme } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

const credentialsSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
});
type Credentials = z.infer<typeof credentialsSchema>;

export type AuthMode = 'signin' | 'signup';

type AppleButton = ComponentType<{
  buttonType: number;
  buttonStyle: number;
  cornerRadius: number;
  style: object;
  onPress: () => void;
}>;

/** Google + Apple buttons. Apple is shown only where the native module is available (iOS builds). */
function SocialButtons({ onSignedIn }: { onSignedIn?: () => void }) {
  const { scheme, colors } = useTheme();
  const [apple, setApple] = useState<{ Button: AppleButton; type: number; style: number } | null>(null);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadAppleAuthentication().then((m) => {
      if (!mounted || !m) return;
      setApple({
        Button: m.AppleAuthenticationButton as unknown as AppleButton,
        type: m.AppleAuthenticationButtonType.CONTINUE,
        style: scheme === 'dark' ? m.AppleAuthenticationButtonStyle.WHITE : m.AppleAuthenticationButtonStyle.BLACK,
      });
    });
    return () => {
      mounted = false;
    };
  }, [scheme]);

  const run = async (provider: 'google' | 'apple') => {
    setBusy(provider);
    try {
      const ok = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
      if (ok) {
        showToast({ message: 'Signed in. Your habits on this device are kept.', tone: 'success' });
        onSignedIn?.();
      }
    } catch (error) {
      showToast({ message: errorMessage(error), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.social}>
      {apple && Platform.OS === 'ios' && (
        <apple.Button
          buttonType={apple.type}
          buttonStyle={apple.style}
          cornerRadius={radius.md}
          style={styles.appleButton}
          onPress={() => void run('apple')}
        />
      )}
      <Button title="Continue with Google" variant="secondary" onPress={() => void run('google')} loading={busy === 'google'} />
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text variant="caption" tone="tertiary">
          or use email
        </Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>
    </View>
  );
}

/** Email sign-in / sign-up / password reset. */
export function AuthForm({ initialMode = 'signin', onSignedIn }: { initialMode?: AuthMode; onSignedIn?: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null);
  const { control, handleSubmit, getValues } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        showToast({ message: 'Signed in. Your habits on this device are kept.', tone: 'success' });
        onSignedIn?.();
      } else {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) {
          setAwaitingConfirmation(email.trim());
          setMode('signin');
        } else {
          showToast({ message: 'Account created — you’re signed in.', tone: 'success' });
          onSignedIn?.();
        }
      }
    } catch (error) {
      showToast({ message: errorMessage(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  });

  const reset = async () => {
    const email = getValues('email').trim();
    if (!z.string().email().safeParse(email).success) {
      showToast({ message: 'Enter your email above first.' });
      return;
    }
    try {
      await sendPasswordReset(email);
      showToast({ message: 'If an account exists, a reset link is on its way.' });
    } catch (error) {
      showToast({ message: errorMessage(error), tone: 'error' });
    }
  };

  return (
    <Card style={styles.gap}>
      {awaitingConfirmation && (
        <Notice
          icon="info"
          title="Confirm your email"
          message={`We sent a link to ${awaitingConfirmation}. Open it, then sign in here.`}
        />
      )}
      <SocialButtons onSignedIn={onSignedIn} />
      <SegmentedControl<AuthMode>
        accessibilityLabel="Sign in or create account"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'signin', label: 'Sign in' },
          { value: 'signup', label: 'Create account' },
        ]}
      />
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            label="Email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            label="Password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            secureTextEntry
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            textContentType={mode === 'signin' ? 'password' : 'newPassword'}
            hint={mode === 'signup' ? 'At least 8 characters' : undefined}
          />
        )}
      />
      <Button title={mode === 'signin' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} />
      {mode === 'signin' && <Button title="Forgot password?" variant="ghost" size="sm" onPress={reset} />}
      <Text variant="caption" tone="tertiary">
        Habits you’ve already created on this device are kept and uploaded to your account — nothing is duplicated.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  social: { gap: spacing.sm },
  appleButton: { width: '100%', height: 48 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
});
