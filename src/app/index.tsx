import { Redirect } from 'expo-router';

import { useAppStore } from '@/state/app-store';

/** Entry point: first launch goes to onboarding (skippable), otherwise Today. */
export default function Index() {
  const onboarded = useAppStore((s) => s.settings.onboardingCompleted);
  return <Redirect href={onboarded ? '/today' : '/onboarding'} />;
}
