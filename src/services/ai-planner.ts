/**
 * Habit planner client. Uses the AI Edge Function when configured and the user
 * is signed in; otherwise (or on any failure) falls back to local templates so
 * the planner is always useful. Responses are validated before use, and nothing
 * is created until the user reviews and confirms.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';

import { isAiConfigured } from '@/config/env';
import { matchTemplates } from '@/domain/templates';
import { aiPlanResponseSchema, type HabitSuggestion } from '@/domain/validation';

import { useAuth } from './auth';
import { getSupabase } from './supabase';

export interface PlanResult {
  suggestions: HabitSuggestion[];
  source: 'ai' | 'templates';
  /** Explains why templates were used instead of AI, if relevant. */
  notice: string | null;
  remaining: number | null;
}

function fromTemplates(goal: string, includeAdvanced: boolean, notice: string | null): PlanResult {
  const templates = matchTemplates(goal, includeAdvanced);
  const seen = new Set<string>();
  const suggestions = templates
    .flatMap((t) => t.suggestions)
    .filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)))
    .slice(0, 6);
  return { suggestions, source: 'templates', notice, remaining: null };
}

export function canUseAi(): boolean {
  return isAiConfigured && !!useAuth.getState().user;
}

export async function generatePlan(
  goal: string,
  opts: { includeAdvancedTemplates: boolean; existingHabits: string[]; preferAi: boolean },
): Promise<PlanResult> {
  const trimmed = goal.trim();
  if (!opts.preferAi || !canUseAi()) {
    return fromTemplates(trimmed, opts.includeAdvancedTemplates, null);
  }
  const supabase = getSupabase()!;
  try {
    const { data, error } = await supabase.functions.invoke('ai-plan', {
      body: { goal: trimmed.slice(0, 300), existingHabits: opts.existingHabits.slice(0, 30) },
    });
    if (error) {
      let code = '';
      if (error instanceof FunctionsHttpError) {
        try {
          code = ((await error.context.json()) as { error?: string }).error ?? '';
        } catch {
          // Body was not JSON; fall through with a generic notice.
        }
      }
      const notice =
        code === 'limit_reached'
          ? 'You’ve used today’s AI suggestions. Here are curated suggestions instead.'
          : code === 'declined'
            ? 'AI couldn’t plan this goal. Here are curated suggestions instead.'
            : 'AI is unavailable right now. Here are curated suggestions instead.';
      return fromTemplates(trimmed, opts.includeAdvancedTemplates, notice);
    }
    const parsed = aiPlanResponseSchema.safeParse(data);
    if (!parsed.success) {
      return fromTemplates(trimmed, opts.includeAdvancedTemplates, 'AI returned an unexpected answer. Here are curated suggestions instead.');
    }
    const remaining = typeof (data as { remaining?: unknown }).remaining === 'number' ? (data as { remaining: number }).remaining : null;
    return { suggestions: parsed.data.suggestions, source: 'ai', notice: null, remaining };
  } catch {
    return fromTemplates(trimmed, opts.includeAdvancedTemplates, 'You appear to be offline. Here are curated suggestions instead.');
  }
}
