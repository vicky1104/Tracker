/**
 * Free vs premium limits. Defaults ship with the app; when the backend is
 * configured they can be overridden remotely (table `app_config`, key
 * `plan_limits`) without an app update. Core tracking, history editing,
 * multiple lists, standard reminders, basic stats and export are never gated.
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { qk } from '@/data/query-client';
import { getSupabase } from '@/services/supabase';
import { useAppStore } from '@/state/app-store';

const limitsSchema = z.object({
  /** AI planner generations per rolling day (enforced server-side too). */
  aiGenerationsPerDay: z.number().int().min(0).max(1000),
  advancedTemplates: z.boolean(),
  /** Trends, long ranges, list comparison, weekday insights. */
  advancedAnalytics: z.boolean(),
  extraThemes: z.boolean(),
  cloudSync: z.boolean(),
  /** Longest stats range in days available on this tier. */
  maxStatsRangeDays: z.number().int().min(7).max(100000),
});

export type PlanLimits = z.infer<typeof limitsSchema>;

export const DEFAULT_PLAN_LIMITS: { free: PlanLimits; premium: PlanLimits } = {
  free: {
    aiGenerationsPerDay: 3,
    advancedTemplates: false,
    advancedAnalytics: false,
    extraThemes: false,
    cloudSync: false,
    maxStatsRangeDays: 30,
  },
  premium: {
    aiGenerationsPerDay: 30,
    advancedTemplates: true,
    advancedAnalytics: true,
    extraThemes: true,
    cloudSync: true,
    maxStatsRangeDays: 100000,
  },
};

const remoteSchema = z.object({ free: limitsSchema.partial(), premium: limitsSchema.partial() }).partial();

async function fetchRemoteLimits(): Promise<typeof DEFAULT_PLAN_LIMITS> {
  const supabase = getSupabase();
  if (!supabase) return DEFAULT_PLAN_LIMITS;
  const { data, error } = await supabase.from('app_config').select('value').eq('key', 'plan_limits').maybeSingle();
  if (error || !data) return DEFAULT_PLAN_LIMITS;
  const parsed = remoteSchema.safeParse(data.value);
  if (!parsed.success) return DEFAULT_PLAN_LIMITS;
  return {
    free: { ...DEFAULT_PLAN_LIMITS.free, ...parsed.data.free },
    premium: { ...DEFAULT_PLAN_LIMITS.premium, ...parsed.data.premium },
  };
}

export function usePlan(): { premium: boolean; limits: PlanLimits; all: typeof DEFAULT_PLAN_LIMITS } {
  const premium = useAppStore((s) => s.entitlement.premium);
  const { data } = useQuery({
    queryKey: qk.remoteConfig,
    queryFn: fetchRemoteLimits,
    networkMode: 'online',
    staleTime: 6 * 60 * 60 * 1000,
    retry: 0,
  });
  const all = data ?? DEFAULT_PLAN_LIMITS;
  return { premium, limits: premium ? all.premium : all.free, all };
}
