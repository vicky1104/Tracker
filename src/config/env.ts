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
  /** Local Ollama server for the habit planner (empty → platform default, see services/ai-planner.ts). */
  ollamaUrl: process.env.EXPO_PUBLIC_OLLAMA_URL ?? '',
  ollamaModel: process.env.EXPO_PUBLIC_OLLAMA_MODEL || 'qwen3:4b',
  privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
