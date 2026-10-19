import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ReminderEditor } from '@/components/habit/reminder-editor';
import { ScheduleEditor } from '@/components/habit/schedule-editor';
import { Button } from '@/components/ui/button';
import { Chip, SegmentedControl, SwitchRow, TextField } from '@/components/ui/controls';
import { Card, LoadingState, Notice, Screen, SectionHeader } from '@/components/ui/layout';
import { ColorPicker, DateField, IconPicker } from '@/components/ui/pickers';
import { HabitIcon } from '@/components/ui/habit-icon';
import { Text } from '@/components/ui/text';
import { iconLabel } from '@/constants/habit-icons';
import { CATEGORY_LABELS, HABIT_COLORS, TIME_OF_DAY_LABELS } from '@/constants/palette';
import { useActions, useHabitData, useSettings } from '@/data/hooks';
import { rulesEqual, versionOn } from '@/domain/schedule';
import type { HabitCategory, HabitContext, TimeOfDay } from '@/domain/types';
import { habitFormSchema, type HabitFormValues } from '@/domain/validation';
import { todayLocal } from '@/lib/clock';
import { useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

export default function HabitEditScreen() {
  const params = useLocalSearchParams<{ id?: string; listId?: string }>();
  const data = useHabitData();
  if (data.isLoading) return <LoadingState />;
  const editing = params.id ? data.contexts.find((c) => c.habit.id === params.id) : undefined;
  // Keyed so the form initialises exactly once per opened habit.
  return <HabitForm key={editing?.habit.id ?? 'new'} editing={editing} initialListId={params.listId} />;
}

function HabitForm({ editing, initialListId }: { editing: HabitContext | undefined; initialListId?: string }) {
  const data = useHabitData();
  const settings = useSettings();
  const actions = useActions();
  const { colors } = useTheme();
  const activeLists = data.lists.filter((l) => !l.archivedOn);
  const today = todayLocal();

  const [defaults] = useState<HabitFormValues>(() => {
    const existingReminders = data.reminders.filter((r) => r.habitId === editing?.habit.id);
    if (editing) {
      const h = editing.habit;
      return {
        name: h.name,
        description: h.description,
        icon: h.icon,
        color: h.color,
        listId: h.listId,
        category: h.category,
        timeOfDay: h.timeOfDay,
        kind: h.kind,
        target: h.target,
        unit: h.unit,
        targetDirection: h.targetDirection,
        rule: versionOn(editing, today < h.startDate ? h.startDate : today).version.rule,
        startDate: h.startDate,
        endDate: h.endDate,
        reminders: existingReminders.map((r) => ({ id: r.id, time: r.time, weekdays: r.weekdays, enabled: r.enabled })),
      };
    }
    return {
      name: '',
      description: '',
      icon: 'check',
      color: HABIT_COLORS[data.contexts.length % HABIT_COLORS.length],
      listId: initialListId ?? activeLists[0]?.id ?? '',
      category: settings.focusAreas[0] ?? 'other',
      timeOfDay: 'anytime',
      kind: 'check',
      target: null,
      unit: '',
      targetDirection: 'atLeast',
      rule: { type: 'daily' },
      startDate: today,
      endDate: null,
      reminders: [],
    };
  });

  const { control, handleSubmit, formState } = useForm<HabitFormValues>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: defaults,
    mode: 'onBlur',
  });

  const kind = useWatch({ control, name: 'kind' });
  const rule = useWatch({ control, name: 'rule' });
  const timeOfDay = useWatch({ control, name: 'timeOfDay' });
  const color = useWatch({ control, name: 'color' });
  const icon = useWatch({ control, name: 'icon' });
  const startDate = useWatch({ control, name: 'startDate' });
  const [applyFrom, setApplyFrom] = useState<'today' | 'start'>('today');
  const [showIcons, setShowIcons] = useState(!editing);
  const [saving, setSaving] = useState(false);

  const ruleChanged = !!editing && !rulesEqual(defaults.rule, rule);
  const hasHistory = !!editing && editing.habit.startDate < today;

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true);
    const result = editing
      ? await actions.updateHabit(editing.habit.id, values, ruleChanged ? applyFrom : 'today')
      : await actions.createHabit(values);
    setSaving(false);
    if (result) router.back();
  });

  const defaultReminderTime =
    timeOfDay === 'anytime' ? settings.defaultReminderTimes.morning : settings.defaultReminderTimes[timeOfDay];

  const confirmDelete = () => {
    if (!editing) return;
    Alert.alert(
      `Delete “${editing.habit.name}”?`,
      'This permanently removes the habit and its entire history. To keep the history, archive it instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive instead', onPress: () => void actions.archiveHabit(editing.habit.id).then(() => router.back()) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void actions.deleteHabit(editing.habit.id).then(() => router.dismissAll()),
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: editing ? 'Edit habit' : 'New habit',
          headerLeft: () => <Button title="Cancel" variant="ghost" size="sm" onPress={() => router.back()} />,
          headerRight: () => <Button title="Save" size="sm" onPress={onSubmit} loading={saving} />,
        }}
      />
      <Screen keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.nameRow}>
            <Pressable
              onPress={() => setShowIcons((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={`Icon: ${iconLabel(icon)}. Tap to change`}>
              <HabitIcon icon={icon} color={color} size={52} />
            </Pressable>
            <View style={styles.flex}>
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Name"
                    placeholder="e.g. Drink a glass of water"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    autoFocus={!editing}
                    maxLength={60}
                    returnKeyType="done"
                  />
                )}
              />
            </View>
          </View>
          {showIcons && (
            <View style={styles.block}>
              <Controller control={control} name="icon" render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} color={color} />} />
            </View>
          )}
          <View style={styles.block}>
            <Controller control={control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
          </View>
        </Card>

        <SectionHeader title="List & time of day" />
        <Card style={styles.gap}>
          <Controller
            control={control}
            name="listId"
            render={({ field, fieldState }) => (
              <View style={styles.chips}>
                {activeLists.map((l) => (
                  <Chip key={l.id} label={l.name} icon={l.icon} selected={field.value === l.id} color={l.color} onPress={() => field.onChange(l.id)} />
                ))}
                {fieldState.error && <Text tone="danger">{fieldState.error.message}</Text>}
              </View>
            )}
          />
          <Controller
            control={control}
            name="timeOfDay"
            render={({ field }) => (
              <SegmentedControl<TimeOfDay>
                accessibilityLabel="Time of day"
                value={field.value}
                onChange={field.onChange}
                options={(Object.keys(TIME_OF_DAY_LABELS) as TimeOfDay[]).map((t) => ({ value: t, label: TIME_OF_DAY_LABELS[t] }))}
              />
            )}
          />
        </Card>

        <SectionHeader title="Goal" />
        <Card style={styles.gap}>
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <SegmentedControl
                accessibilityLabel="Habit type"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'check', label: 'Yes / No' },
                  { value: 'numeric', label: 'Measurable' },
                ]}
              />
            )}
          />
          {kind === 'numeric' && (
            <>
              <Controller
                control={control}
                name="targetDirection"
                render={({ field }) => (
                  <SegmentedControl
                    accessibilityLabel="Target direction"
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: 'atLeast', label: 'At least' },
                      { value: 'atMost', label: 'At most (limit)' },
                    ]}
                  />
                )}
              />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Controller
                    control={control}
                    name="target"
                    render={({ field, fieldState }) => (
                      <TextField
                        label="Target"
                        keyboardType="decimal-pad"
                        placeholder="10"
                        value={field.value == null ? '' : String(field.value)}
                        onChangeText={(t) => {
                          const n = Number(t.replace(',', '.'));
                          field.onChange(t.trim() === '' || !Number.isFinite(n) ? null : n);
                        }}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                </View>
                <View style={styles.flex}>
                  <Controller
                    control={control}
                    name="unit"
                    render={({ field }) => (
                      <TextField label="Unit" placeholder="pages, min, glasses" value={field.value} onChangeText={field.onChange} maxLength={20} />
                    )}
                  />
                </View>
              </View>
            </>
          )}
        </Card>

        <SectionHeader title="Schedule" />
        <Card style={styles.gap}>
          <Controller
            control={control}
            name="rule"
            render={({ field }) => <ScheduleEditor value={field.value} onChange={field.onChange} firstDayOfWeek={settings.firstDayOfWeek} />}
          />
          {ruleChanged && hasHistory && (
            <View style={styles.gap}>
              <Text variant="captionStrong">Apply this schedule change to</Text>
              <SegmentedControl
                accessibilityLabel="Apply schedule change to"
                value={applyFrom}
                onChange={setApplyFrom}
                options={[
                  { value: 'today', label: 'Today onward' },
                  { value: 'start', label: 'All history' },
                ]}
              />
              <Text variant="caption" tone="tertiary">
                {applyFrom === 'today'
                  ? 'Past days keep their original schedule, so your streaks and rates stay exactly as they were.'
                  : 'Past days will be re-evaluated with the new schedule. Your logged completions are never deleted.'}
              </Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.flex}>Starts</Text>
            <Controller control={control} name="startDate" render={({ field }) => <DateField label="Start date" value={field.value} onChange={field.onChange} />} />
          </View>
          <Controller
            control={control}
            name="endDate"
            render={({ field, fieldState }) => (
              <View style={styles.gap}>
                <SwitchRow
                  title="End date"
                  subtitle="For challenges or seasonal habits"
                  value={field.value != null}
                  onValueChange={(on) => field.onChange(on ? startDate : null)}
                />
                {field.value != null && (
                  <View style={styles.row}>
                    <Text style={styles.flex}>Ends</Text>
                    <DateField label="End date" value={field.value} minimumDate={startDate} onChange={field.onChange} />
                  </View>
                )}
                {fieldState.error && <Text tone="danger">{fieldState.error.message}</Text>}
              </View>
            )}
          />
        </Card>

        <SectionHeader title="Reminders" />
        <Card>
          <Controller
            control={control}
            name="reminders"
            render={({ field, fieldState }) => (
              <>
                <ReminderEditor
                  value={field.value}
                  onChange={field.onChange}
                  defaultTime={defaultReminderTime}
                  firstDayOfWeek={settings.firstDayOfWeek}
                />
                {fieldState.error && <Text tone="danger">{fieldState.error.message}</Text>}
              </>
            )}
          />
        </Card>

        <SectionHeader title="Details" />
        <Card style={styles.gap}>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <View style={styles.chips}>
                {(Object.keys(CATEGORY_LABELS) as HabitCategory[]).map((c) => (
                  <Chip key={c} label={CATEGORY_LABELS[c]} selected={field.value === c} onPress={() => field.onChange(c)} />
                ))}
              </View>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState }) => (
              <TextField
                label="Description (optional)"
                placeholder="Why it matters, or how you'll do it"
                multiline
                value={field.value}
                onChangeText={field.onChange}
                maxLength={280}
                error={fieldState.error?.message}
              />
            )}
          />
        </Card>

        {Object.keys(formState.errors).length > 0 && (
          <Notice tone="warning" icon="warning" message="Please fix the highlighted fields above." />
        )}
        <Button title={editing ? 'Save changes' : 'Create habit'} onPress={onSubmit} loading={saving} />

        {editing && (
          <View style={styles.gap}>
            <Text variant="caption" tone="tertiary" style={styles.center}>
              Editing a habit never changes or removes its completion history.
            </Text>
            <Button
              title="Duplicate"
              icon="duplicate"
              variant="secondary"
              onPress={() => void actions.duplicateHabit(editing.habit.id).then(() => router.back())}
            />
            {editing.habit.archivedOn ? (
              <Button title="Restore" icon="unarchive" variant="secondary" onPress={() => void actions.restoreHabit(editing.habit.id).then(() => router.back())} />
            ) : (
              <Button title="Archive" icon="archive" variant="secondary" onPress={() => void actions.archiveHabit(editing.habit.id).then(() => router.back())} />
            )}
            <Button title="Delete habit" icon="delete" variant="danger" onPress={confirmDelete} />
          </View>
        )}
        <View style={{ height: spacing.xl, backgroundColor: colors.background }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  block: { marginTop: spacing.lg },
  nameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  center: { textAlign: 'center' },
});
