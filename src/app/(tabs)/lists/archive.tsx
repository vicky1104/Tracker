import { Stack } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { HabitGlyph } from '@/components/ui/habit-icon';
import { Card, Divider, EmptyState, LoadingState, Screen, SectionHeader } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { useActions, useHabitData } from '@/data/hooks';
import { formatLocalDate } from '@/domain/dates';
import { spacing } from '@/theme/tokens';

export default function ArchiveScreen() {
  const data = useHabitData();
  const actions = useActions();
  if (data.isLoading) return <LoadingState />;

  const lists = data.lists.filter((l) => l.archivedOn);
  const habits = data.contexts.filter((c) => c.habit.archivedOn);
  const listName = new Map(data.lists.map((l) => [l.id, l]));
  const since = (d: string) => `Archived ${formatLocalDate(d, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const confirmDeleteHabit = (id: string, name: string) =>
    Alert.alert(`Delete “${name}” permanently?`, 'Its history will be removed from statistics and cannot be recovered.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void actions.deleteHabit(id) },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Archived', headerLargeTitle: false }} />
      <Text tone="secondary">
        Archived items are hidden from Today and send no reminders. Their history stays in your statistics up to the day they were archived. Restoring
        doesn’t count the archived days as missed.
      </Text>
      {lists.length === 0 && habits.length === 0 && <EmptyState icon="archive" title="Nothing archived" />}

      {lists.length > 0 && (
        <>
          <SectionHeader title="Lists" />
          <Card padded={false}>
            {lists.map((l, i) => (
              <View key={l.id}>
                {i > 0 && <Divider inset={spacing.lg} />}
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <View style={styles.titleRow}>
                      <HabitGlyph icon={l.icon} color={l.color} size={18} />
                      <Text variant="bodyStrong" style={styles.flex}>
                        {l.name}
                      </Text>
                    </View>
                    <Text variant="caption" tone="secondary">
                      {since(l.archivedOn!)}
                    </Text>
                  </View>
                  <Button title="Restore" size="sm" variant="secondary" onPress={() => void actions.restoreList(l.id)} />
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      {habits.length > 0 && (
        <>
          <SectionHeader title="Habits" />
          <Card padded={false}>
            {habits.map((c, i) => {
              const list = listName.get(c.habit.listId);
              return (
                <View key={c.habit.id}>
                  {i > 0 && <Divider inset={spacing.lg} />}
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <View style={styles.titleRow}>
                        <HabitGlyph icon={c.habit.icon} color={c.habit.color} size={18} />
                        <Text variant="bodyStrong" style={styles.flex}>
                          {c.habit.name}
                        </Text>
                      </View>
                      <Text variant="caption" tone="secondary">
                        {since(c.habit.archivedOn!)}
                        {list ? ` · ${list.name}` : ''}
                      </Text>
                    </View>
                    <Button title="Restore" size="sm" variant="secondary" onPress={() => void actions.restoreHabit(c.habit.id)} />
                    <Button title="Delete" size="sm" variant="danger" onPress={() => confirmDeleteHabit(c.habit.id, c.habit.name)} />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, paddingLeft: spacing.lg },
});
