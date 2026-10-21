import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listMenuActions } from '@/components/list/list-actions';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button, IconButton } from '@/components/ui/button';
import { Row } from '@/components/ui/controls';
import { HabitGlyph, HabitIcon } from '@/components/ui/habit-icon';
import { Icon } from '@/components/ui/icon';
import { Card, ErrorState, Screen, SectionHeader } from '@/components/ui/layout';
import { ListsSkeleton } from '@/components/ui/screen-skeletons';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ReorderableList } from '@/components/ui/reorderable-list';
import { TabHeader } from '@/components/ui/tab-header';
import { Text } from '@/components/ui/text';
import { useActions, useHabitData } from '@/data/hooks';
import type { HabitList } from '@/domain/types';
import { useListStats, type ListStats } from '@/hooks/use-list-stats';
import { useToday } from '@/hooks/use-today';
import { errorMessage } from '@/lib/errors';
import { useAppStore } from '@/state/app-store';
import { useTheme } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

const pct = (p: number | null) => (p == null ? '—' : `${Math.round(p * 100)}%`);

function ListCard({ list, stats, onPress, onMore }: { list: HabitList; stats?: ListStats; onPress: () => void; onMore: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      accessibilityRole="button"
      accessibilityLabel={`${list.name}. ${stats?.habitCount ?? 0} habits. Today ${pct(stats?.today.percent ?? null)}. Last 7 days ${pct(stats?.week ?? null)}`}
      accessibilityHint="Opens the list. Long press for options."
      style={({ pressed }) => [styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.listTop}>
        <HabitIcon icon={list.icon} color={list.color} size={44} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {list.name}
          </Text>
          <Text variant="caption" tone="secondary">
            {stats?.habitCount ?? 0} habit{stats?.habitCount === 1 ? '' : 's'} · 7 days {pct(stats?.week ?? null)}
          </Text>
        </View>
        <View style={styles.listPct}>
          <Text variant="heading">{pct(stats?.today.percent ?? null)}</Text>
          <Text variant="micro" tone="tertiary">
            today
          </Text>
        </View>
        <IconButton icon="more" label={`Options for ${list.name}`} onPress={onMore} color={colors.textTertiary} />
      </View>
      <ProgressBar value={stats?.today.percent ?? 0} color={list.color} height={6} label={`${list.name} today`} />
    </Pressable>
  );
}

export default function ListsScreen() {
  const { colors } = useTheme();
  const today = useToday();
  const data = useHabitData();
  const actions = useActions();
  const { byList, overall } = useListStats(today);
  const setSelectedListId = useAppStore((s) => s.setSelectedListId);
  const [reordering, setReordering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [menuFor, setMenuFor] = useState<HabitList | null>(null);

  if (data.isLoading) return <ListsSkeleton />;
  if (data.error) return <ErrorState message={errorMessage(data.error)} onRetry={data.refetch} />;

  const active = data.lists.filter((l) => !l.archivedOn);
  const archivedCount = data.lists.length - active.length + data.contexts.filter((c) => c.habit.archivedOn).length;

  return (
    <>
      <Screen headerless scrollEnabled={!dragging}>
        <TabHeader
          title="My Lists"
          right={
            <>
              {active.length > 1 && (
                <Button title={reordering ? 'Done' : 'Reorder'} variant="ghost" size="sm" onPress={() => setReordering((r) => !r)} />
              )}
              <IconButton icon="add" label="New list" filled onPress={() => router.push('/list/edit')} />
            </>
          }
        />
        <Card>
          <Text variant="micro" tone="secondary">
            All active lists · today
          </Text>
          <View style={styles.overallRow}>
            <Text variant="display">{pct(overall.today.percent)}</Text>
            <Text tone="secondary" style={styles.flex}>
              {overall.today.done} of {overall.today.due} done{'\n'}
              <Text variant="caption" tone="tertiary">
                Last 7 days: {pct(overall.week)}
              </Text>
            </Text>
          </View>
          <ProgressBar value={overall.today.percent ?? 0} label="All lists today" />
        </Card>

        <Card padded={false}>
          <Row icon="search" title="Search & filter habits" onPress={() => router.push('/lists/habits')} />
        </Card>

        <SectionHeader title={reordering ? 'Drag or use arrows to reorder' : 'Your lists'} />
        {reordering ? (
          <Card padded={false}>
            <ReorderableList
              items={active}
              keyOf={(l) => l.id}
              labelOf={(l) => l.name}
              onDragActive={setDragging}
              onReorder={(next) => void actions.reorderLists([...next.map((l) => l.id), ...data.lists.filter((l) => l.archivedOn).map((l) => l.id)])}
              renderItem={(l) => (
                <View style={styles.reorderRow}>
                  <HabitGlyph icon={l.icon} color={l.color} size={20} />
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                    {l.name}
                  </Text>
                </View>
              )}
            />
          </Card>
        ) : (
          active.map((l) => (
            <ListCard
              key={l.id}
              list={l}
              stats={byList.get(l.id)}
              onPress={() => router.push({ pathname: '/lists/[id]', params: { id: l.id } })}
              onMore={() => setMenuFor(l)}
            />
          ))
        )}

        <Button title="New list" icon="add" variant="secondary" onPress={() => router.push('/list/edit')} />

        {archivedCount > 0 && (
          <Card padded={false}>
            <Row icon="archive" title="Archived" value={String(archivedCount)} onPress={() => router.push('/lists/archive')} />
          </Card>
        )}

        <Pressable
          onPress={() => {
            setSelectedListId('all');
            router.navigate('/today');
          }}
          accessibilityRole="button"
          style={styles.footerLink}>
          <Icon name="today" size={16} color={colors.accent} />
          <Text tone="accent" variant="captionStrong">
            Open combined Today view
          </Text>
        </Pressable>
      </Screen>

      <ActionSheet
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={menuFor?.name}
        titleIcon={menuFor ? { icon: menuFor.icon, color: menuFor.color } : undefined}
        actions={menuFor ? listMenuActions(menuFor, data.lists, byList.get(menuFor.id)?.habitCount ?? 0, actions) : []}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overallRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginVertical: spacing.sm },
  listCard: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.md },
  listTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  listPct: { alignItems: 'flex-end' },
  reorderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  footerLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.md },
});
