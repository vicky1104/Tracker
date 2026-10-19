import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/controls';
import { Card, ErrorState, LoadingState, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { errorMessage } from '@/lib/errors';
import { completeAuthRedirect, updatePassword } from '@/services/auth';
import { showToast } from '@/state/app-store';
import { spacing } from '@/theme/tokens';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' });
type Values = z.infer<typeof schema>;

/** Opened from the password-reset email (`habitflow://reset-password?code=…`). */
export default function ResetPasswordScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [phase, setPhase] = useState<'verifying' | 'ready' | 'error'>(code ? 'verifying' : 'error');
  const [failure, setFailure] = useState<string>(code ? '' : 'This reset link is incomplete. Request a new one from the sign-in screen.');
  const [saving, setSaving] = useState(false);
  const { control, handleSubmit } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  useEffect(() => {
    if (!code) return;
    completeAuthRedirect(code)
      .then(() => setPhase('ready'))
      .catch((error) => {
        setFailure(errorMessage(error));
        setPhase('error');
      });
  }, [code]);

  const submit = handleSubmit(async ({ password }) => {
    setSaving(true);
    try {
      await updatePassword(password);
      showToast({ message: 'Password updated — you’re signed in.' });
      router.replace('/settings');
    } catch (error) {
      showToast({ message: errorMessage(error), tone: 'error' });
    } finally {
      setSaving(false);
    }
  });

  if (phase === 'verifying') return <LoadingState label="Checking your reset link…" />;
  if (phase === 'error') {
    return <ErrorState title="Reset link not valid" message={failure} onRetry={() => router.replace('/sign-in')} />;
  }
  return (
    <Screen keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New password' }} />
      <Text tone="secondary">Choose a new password for your HabitFlow account.</Text>
      <Card style={styles.gap}>
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField label="New password" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          )}
        />
        <Controller
          control={control}
          name="confirm"
          render={({ field, fieldState }) => (
            <TextField label="Confirm password" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          )}
        />
        <Button title="Save password" onPress={submit} loading={saving} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
});
