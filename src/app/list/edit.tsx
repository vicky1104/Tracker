import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/controls';
import { Card, LoadingState, Screen, SectionHeader } from '@/components/ui/layout';
import { ColorPicker, IconPicker } from '@/components/ui/pickers';
import { LIST_ICON_KEYS } from '@/constants/habit-icons';
import { useActions, useHabitData } from '@/data/hooks';
import { listFormSchema, type ListFormValues } from '@/domain/validation';
import { spacing } from '@/theme/tokens';

const SUGGESTIONS = ['Morning routine', 'Fitness', 'Study plan', 'Work', 'Evening routine'];

export default function ListEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const data = useHabitData();
  const actions = useActions();
  const editing = id ? data.lists.find((l) => l.id === id) : undefined;
  const [saving, setSaving] = useState(false);

  const { control, handleSubmit, reset, setValue } = useForm<ListFormValues>({
    resolver: zodResolver(listFormSchema),
    defaultValues: { name: '', color: '#3B82C4', icon: 'list' },
  });
  useEffect(() => {
    if (editing) reset({ name: editing.name, color: editing.color, icon: editing.icon });
  }, [editing, reset]);

  if (data.isLoading) return <LoadingState />;

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true);
    const ok = editing ? await actions.updateList(editing.id, values) : await actions.createList(values);
    setSaving(false);
    if (ok) router.back();
  });

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: editing ? 'Edit list' : 'New list',
          headerLeft: () => <Button title="Cancel" variant="ghost" size="sm" onPress={() => router.back()} />,
          headerRight: () => <Button title="Save" size="sm" onPress={onSubmit} loading={saving} />,
        }}
      />
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <TextField label="Name" placeholder="e.g. Morning routine" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} autoFocus={!editing} maxLength={40} />
        )}
      />
      {!editing && (
        <View style={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <Button key={s} title={s} size="sm" variant="secondary" onPress={() => setValue('name', s, { shouldValidate: true })} />
          ))}
        </View>
      )}
      <SectionHeader title="Icon" />
      <Card>
        <Controller control={control} name="icon" render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} options={LIST_ICON_KEYS} />} />
      </Card>
      <SectionHeader title="Color" />
      <Card>
        <Controller control={control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
      </Card>
      <Button title={editing ? 'Save changes' : 'Create list'} onPress={onSubmit} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
