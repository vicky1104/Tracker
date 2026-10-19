/**
 * Zod schemas shared by forms, backup import and the AI planner response.
 * Anything that crosses a trust boundary (user input, files, network) is parsed
 * through one of these before it reaches the database.
 */
import { z } from 'zod';

import { isValidLocalDate } from './dates';
import { isValidRule } from './schedule';
import type { ScheduleRule } from './types';

export const localDateSchema = z.string().refine(isValidLocalDate, 'Invalid date');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
export const weekdaySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const scheduleRuleSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('daily') }),
    z.object({ type: z.literal('weekdays'), days: z.array(weekdaySchema).min(1, 'Pick at least one day') }),
    z.object({
      type: z.literal('monthDays'),
      days: z.array(z.number().int().min(1).max(31)).min(1, 'Pick at least one day'),
    }),
    z.object({ type: z.literal('interval'), every: z.number().int().min(1).max(365) }),
    z.object({ type: z.literal('timesPerWeek'), count: z.number().int().min(1).max(7) }),
    z.object({ type: z.literal('timesPerMonth'), count: z.number().int().min(1).max(31) }),
  ])
  .refine((r) => isValidRule(r as ScheduleRule), 'Invalid schedule');

export const categorySchema = z.enum([
  'health',
  'fitness',
  'learning',
  'productivity',
  'mindfulness',
  'sleep',
  'personal',
  'other',
]);
export const timeOfDaySchema = z.enum(['morning', 'afternoon', 'evening', 'anytime']);

export const reminderInputSchema = z.object({
  id: z.string().optional(),
  time: timeSchema,
  weekdays: z.array(weekdaySchema).min(1).nullable(),
  enabled: z.boolean(),
});

export const habitFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Give your habit a name').max(60, 'Keep it under 60 characters'),
    description: z.string().trim().max(280, 'Keep it under 280 characters'),
    icon: z.string().min(1).max(32),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    listId: z.string().min(1, 'Choose a list'),
    category: categorySchema,
    timeOfDay: timeOfDaySchema,
    kind: z.enum(['check', 'numeric']),
    target: z.number().positive('Must be greater than 0').max(1_000_000).nullable(),
    unit: z.string().trim().max(20),
    targetDirection: z.enum(['atLeast', 'atMost']),
    rule: scheduleRuleSchema,
    startDate: localDateSchema,
    endDate: localDateSchema.nullable(),
    reminders: z.array(reminderInputSchema).max(5, 'Up to 5 reminders per habit'),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'numeric' && v.target == null) {
      ctx.addIssue({ code: 'custom', path: ['target'], message: 'Numeric habits need a target' });
    }
    if (v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be after the start date' });
    }
  });

export type HabitFormValues = z.infer<typeof habitFormSchema>;

export const listFormSchema = z.object({
  name: z.string().trim().min(1, 'Give your list a name').max(40, 'Keep it under 40 characters'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string().min(1).max(32),
});

export type ListFormValues = z.infer<typeof listFormSchema>;

/** Shape returned by the AI planner endpoint and by local templates. */
export const habitSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(280).default(''),
  icon: z.string().min(1).max(32).default('check'),
  category: categorySchema.default('other'),
  timeOfDay: timeOfDaySchema.default('anytime'),
  kind: z.enum(['check', 'numeric']).default('check'),
  target: z.number().positive().max(100_000).nullable().default(null),
  unit: z.string().trim().max(20).default(''),
  targetDirection: z.enum(['atLeast', 'atMost']).default('atLeast'),
  rule: scheduleRuleSchema,
  reminderTime: timeSchema.nullable().default(null),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('easy'),
  rationale: z.string().trim().max(400).default(''),
});

export type HabitSuggestion = z.infer<typeof habitSuggestionSchema>;

export const aiPlanResponseSchema = z.object({
  suggestions: z.array(habitSuggestionSchema).min(1).max(8),
});
