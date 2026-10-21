import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HabitSummaryRow } from '@/components/habit/habit-summary-row';
import { Chip, ChipRow, TextField } from '@/components/ui/controls';
import { HabitGlyph } from '@/components/ui/habit-icon';
import { Card, Divider, EmptyState, Screen } from '@/components/ui/layout';
import { HabitSearchSkeleton } from '@/components/ui/screen-skeletons';
import { Text } from '@/components/ui/text';
import { CATEGORY_LABELS } from '@/constants/palette';
import { useHabitData } from '@/data/hooks';
import type { HabitCategory } from '@/domain/types';
import { useToday } from '@/hooks/use-today';
import { spacing } from '@/theme/tokens';

type StatusFilter = 'active' | 'archived' | 'all';

export default function HabitSearchScreen() {
  const data = useHabitData();
  const today = useToday();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [listId, setListId] = useState<string | null>(null);
  const [category, setCategory] = useState<HabitCategory | null>(null);
  const [kind, setKind] = useState<'check' | 'numeric' | null>(null);

  const lists = new Map(data.lists.map((l) => [l.id, l]));
  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return data.contexts.filter((c) => {
      const h = c.habit;
      if (status === 'active' && h.archivedOn) return false;
      if (status === 'archived' && !h.archivedOn) return false;
      if (listId && h.listId !== listId) return false;
      if (category && h.category !== category) return false;
      if (kind && h.kind !== kind) return false;
      if (q && !`${h.name} ${h.description}`.toLocaleLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.contexts, query, status, listId, category, kind]);

  if (data.isLoading) return <HabitSearchSkeleton />;
  const usedCategories = [...new Set(data.contexts.map((c) => c.habit.category))];

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'All habits', headerLargeTitle: false }} />
      <TextField label="Search" placeholder="Name or description" value={query} onChangeText={setQuery} autoCorrect={false} clearButtonMode="while-editing" returnKeyType="search" />
      <View style={styles.filters}>
        <ChipRow>
          {(['active', 'archived', 'all'] as const).map((s) => (
            <Chip key={s} label={s === 'active' ? 'Active' : s === 'archived' ? 'Archived' : 'All'} selected={status === s} onPress={() => setStatus(s)} />
          ))}
          <Chip label="Yes/No" selected={kind === 'check'} onPress={() => setKind(kind === 'check' ? null : 'check')} />
          <Chip label="Measurable" selected={kind === 'numeric'} onPress={() => setKind(kind === 'numeric' ? null : 'numeric')} />
        </ChipRow>
        {data.lists.length > 1 && (
          <ChipRow>
            <Chip label="Any list" selected={listId == null} onPress={() => setListId(null)} />
            {data.lists.map((l) => (
              <Chip key={l.id} label={l.name} icon={l.icon} color={l.color} selected={listId === l.id} onPress={() => setListId(l.id)} />
            ))}
          </ChipRow>
        )}
        {usedCategories.length > 1 && (
          <ChipRow>
            <Chip label="Any category" selected={category == null} onPress={() => setCategory(null)} />
            {usedCategories.map((c) => (
              <Chip key={c} label={CATEGORY_LABELS[c]} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </ChipRow>
        )}
      </View>
      <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
        {results.length} habit{results.length === 1 ? '' : 's'}
      </Text>
      {results.length === 0 ? (
        <EmptyState icon="search" title="No matching habits" message="Try a different search or clear a filter." />
      ) : (
        <Card padded={false}>
          {results.map((c, i) => (
            <View key={c.habit.id}>
              {i > 0 && <Divider inset={spacing.lg} />}
              <HabitSummaryRow
                ctx={c}
                today={today}
                trailingNode={(() => {
                  const l = lists.get(c.habit.listId);
                  return l ? <HabitGlyph icon={l.icon} color={l.color} size={16} /> : undefined;
                })()}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
});
