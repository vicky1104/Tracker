import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '@/components/ui/layout';
import { errorMessage } from '@/lib/errors';
import { completeAuthRedirect, isOAuthInFlight } from '@/services/auth';
import { showToast } from '@/state/app-store';

/**
 * Landing route for `habitflow://auth-callback` — email confirmation links and
 * (on Android) the OAuth redirect. When an in-app OAuth session is open, that
 * flow exchanges the code itself, so this screen only navigates back.
 */
export default function AuthCallbackScreen() {
  const { code, error_description: providerError } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [failure, setFailure] = useState<string | null>(providerError ?? null);

  useEffect(() => {
    if (providerError) return;
    const finish = () => router.replace('/settings');
    if (!code || isOAuthInFlight()) {
      finish();
      return;
    }
    completeAuthRedirect(code)
      .then(() => {
        showToast({ message: 'You’re signed in.' });
        finish();
      })
      .catch((error) => setFailure(errorMessage(error)));
  }, [code, providerError]);

  if (failure) {
    return <ErrorState title="Couldn’t sign you in" message={failure} onRetry={() => router.replace('/sign-in')} />;
  }
  return <LoadingState label="Signing you in…" />;
}
