/**
 * Public, client-side configuration. Only values that are safe to ship in the
 * app binary belong here (Expo inlines `EXPO_PUBLIC_*` at build time).
 * Service-role keys, AI provider keys and webhook secrets live only in the
 * Supabase Edge Function environment — never in this file or in `.env`.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  revenueCatEntitlement: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT || 'premium',
  aiPlannerEnabled: process.env.EXPO_PUBLIC_AI_PLANNER_ENABLED === 'true',
  privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
/** The AI planner needs the backend (it is proxied by an Edge Function). */
export const isAiConfigured = isSupabaseConfigured && env.aiPlannerEnabled;
