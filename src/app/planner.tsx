import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip, ChipRow, SwitchRow, TextField } from '@/components/ui/controls';
import { HabitIcon } from '@/components/ui/habit-icon';
import { Icon } from '@/components/ui/icon';
import { Card, Notice, Screen, SectionHeader } from '@/components/ui/layout';
import { TimeField } from '@/components/ui/pickers';
import { Text } from '@/components/ui/text';
import { isAiConfigured } from '@/config/env';
import { usePlan } from '@/config/plans';
import { resolveIconKey } from '@/constants/habit-icons';
import { HABIT_COLORS } from '@/constants/palette';
import { useActions, useHabitData } from '@/data/hooks';
import { weekdayShortName } from '@/domain/dates';
import { describeRule } from '@/domain/schedule';
import { PLANNER_TEMPLATES } from '@/domain/templates';
import type { HabitSuggestion } from '@/domain/validation';
import { todayLocal } from '@/lib/clock';
import { canUseAi, generatePlan, type PlanResult } from '@/services/ai-planner';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

interface Draft {
  suggestion: HabitSuggestion;
  include: boolean;
  name: string;
  remind: boolean;
  reminderTime: string;
}

const DIFFICULTY = { easy: 'Easy', medium: 'Medium', hard: 'Challenging' } as const;

export default function PlannerScreen() {
  const { colors } = useTheme();
  const data = useHabitData();
  const actions = useActions();
  const { limits } = usePlan();
  const user = useAuth((s) => s.user);
  const [goal, setGoal] = useState('');
  const [useAi, setUseAi] = useState(canUseAi());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const activeLists = data.lists.filter((l) => !l.archivedOn);
  const [listId, setListId] = useState<string | null>(null);
  const targetList = listId ?? activeLists[0]?.id ?? null;
  const [adding, setAdding] = useState(false);

  const generate = async (text = goal) => {
    if (text.trim().length < 3) return;
    setLoading(true);
    const r = await generatePlan(text, {
      includeAdvancedTemplates: limits.advancedTemplates,
      existingHabits: data.contexts.filter((c) => !c.habit.archivedOn).map((c) => c.habit.name),
      preferAi: useAi,
    });
    setResult(r);
    setDrafts(
      r.suggestions.map((s) => ({ suggestion: s, include: true, name: s.name, remind: false, reminderTime: s.reminderTime ?? '09:00' })),
    );
    setLoading(false);
  };

  const selected = drafts.filter((d) => d.include && d.name.trim());
  const add = async () => {
    if (!targetList || selected.length === 0) return;
    setAdding(true);
    let i = 0;
    for (const d of selected) {
      const s = d.suggestion;
      await actions.createHabit({
        name: d.name.trim().slice(0, 60),
        description: s.description,
        icon: resolveIconKey(s.icon),
        color: HABIT_COLORS[i++ % HABIT_COLORS.length],
        listId: targetList,
        category: s.category,
        timeOfDay: s.timeOfDay,
        kind: s.kind,
        target: s.kind === 'numeric' ? s.target : null,
        unit: s.unit,
        targetDirection: s.targetDirection,
        rule: s.rule,
        startDate: todayLocal(),
        endDate: null,
        reminders: d.remind ? [{ time: d.reminderTime, weekdays: null, enabled: true }] : [],
      });
    }
    setAdding(false);
    router.dismissTo('/today');
  };

  const aiNote = !isAiConfigured
    ? 'Suggestions come from curated templates and work offline.'
    : !user
      ? 'Sign in to use AI suggestions. Curated templates work without an account.'
      : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerLeft: () => <Button title="Close" variant="ghost" size="sm" onPress={() => router.back()} /> }} />
      <Screen keyboardShouldPersistTaps="handled">
        <Text tone="secondary">Describe a goal and get a few small, realistic habits. You review and edit everything before anything is added.</Text>
        <TextField
          label="Your goal"
          placeholder="e.g. Sleep better, read more, get fit"
          value={goal}
          onChangeText={setGoal}
          maxLength={300}
          returnKeyType="go"
          onSubmitEditing={() => void generate()}
        />
        <ChipRow>
          {PLANNER_TEMPLATES.filter((t) => !t.advanced || limits.advancedTemplates).map((t) => (
            <Chip
              key={t.id}
              label={t.title}
              selected={false}
              onPress={() => {
                setGoal(t.title);
                void generate(t.title);
              }}
            />
          ))}
        </ChipRow>
        {!limits.advancedTemplates && (
          <Pressable onPress={() => router.push('/premium')} accessibilityRole="button" style={styles.inline}>
            <Icon name="lock" size={14} color={colors.textTertiary} />
            <Text variant="caption" tone="tertiary">
              Multi-week programs like Couch to 5K are included with Premium
            </Text>
          </Pressable>
        )}
        {canUseAi() && (
          <Card padded={false}>
            <SwitchRow icon="sparkles" title="Use AI suggestions" subtitle={`Up to ${limits.aiGenerationsPerDay} per day on your plan`} value={useAi} onValueChange={setUseAi} />
          </Card>
        )}
        {aiNote && <Notice icon="info" message={aiNote} />}
        <Button title="Suggest habits" icon="sparkles" onPress={() => void generate()} loading={loading} disabled={goal.trim().length < 3} />

        {result && (
          <>
            {result.notice && <Notice icon="info" tone="warning" message={result.notice} />}
            <SectionHeader
              title={`${result.source === 'ai' ? 'AI suggestions' : 'Suggestions'}${result.remaining != null ? ` · ${result.remaining} AI left today` : ''}`}
            />
            {drafts.map((d, idx) => {
              const s = d.suggestion;
              const set = (patch: Partial<Draft>) => setDrafts(drafts.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
              return (
                <Card key={`${s.name}-${idx}`} style={[styles.gap, !d.include && styles.excluded]}>
                  <View style={styles.headerRow}>
                    <HabitIcon icon={s.icon} color={HABIT_COLORS[idx % HABIT_COLORS.length]} size={40} />
                    <View style={styles.flex}>
                      <TextField label="Habit" value={d.name} onChangeText={(name) => set({ name })} maxLength={60} />
                    </View>
                    <Pressable
                      onPress={() => set({ include: !d.include })}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: d.include }}
                      accessibilityLabel={`Include ${d.name}`}
                      hitSlop={8}
                      style={[styles.check, { borderColor: d.include ? colors.accent : colors.borderStrong, backgroundColor: d.include ? colors.accent : 'transparent' }]}>
                      {d.include && <Icon name="check" size={16} color={colors.onAccent} />}
                    </Pressable>
                  </View>
                  <Text variant="caption" tone="secondary">
                    {describeRule(s.rule, (w) => weekdayShortName(w as 0))}
                    {s.kind === 'numeric' && s.target != null ? ` · ${s.targetDirection === 'atMost' ? '≤ ' : ''}${s.target} ${s.unit}` : ''} · {DIFFICULTY[s.difficulty]}
                  </Text>
                  {s.description ? <Text variant="caption">{s.description}</Text> : null}
                  {s.rationale ? (
                    <Text variant="caption" tone="tertiary">
                      Why: {s.rationale}
                    </Text>
                  ) : null}
                  <View style={styles.headerRow}>
                    <View style={styles.flex}>
                      <SwitchRow title="Reminder" value={d.remind} onValueChange={(remind) => set({ remind })} />
                    </View>
                    {d.remind && <TimeField label={`Reminder time for ${d.name}`} value={d.reminderTime} onChange={(reminderTime) => set({ reminderTime })} />}
                  </View>
                </Card>
              );
            })}

            {activeLists.length > 1 && (
              <>
                <SectionHeader title="Add to list" />
                <ChipRow>
                  {activeLists.map((l) => (
                    <Chip key={l.id} label={l.name} icon={l.icon} color={l.color} selected={targetList === l.id} onPress={() => setListId(l.id)} />
                  ))}
                </ChipRow>
              </>
            )}
            <Button
              title={selected.length ? `Add ${selected.length} habit${selected.length === 1 ? '' : 's'}` : 'Select habits to add'}
              onPress={() => void add()}
              loading={adding}
              disabled={selected.length === 0 || !targetList}
            />
            <Text variant="caption" tone="tertiary" style={styles.center}>
              Suggestions are general guidance, not medical advice.
            </Text>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.sm },
  excluded: { opacity: 0.55 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  check: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
