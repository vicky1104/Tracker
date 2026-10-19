import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BarChart, Heatmap, StatTile } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/controls';
import { Icon } from '@/components/ui/icon';
import { HabitGlyph, HabitIcon } from '@/components/ui/habit-icon';
import { Card, Divider, EmptyState, ErrorState, LoadingState, Notice, Screen, SectionHeader } from '@/components/ui/layout';
import { ProgressBar } from '@/components/ui/progress-bar';
import { TabHeader } from '@/components/ui/tab-header';
import { Text } from '@/components/ui/text';
import { usePlan } from '@/config/plans';
import { useHabitData, useSettings } from '@/data/hooks';
import { addDays, diffDays, formatLocalDate, minDate, weekdayShortName } from '@/domain/dates';
import { aggregateRate, bucketSeries, dailySeries, evaluateHabit, weekdayBreakdown } from '@/domain/stats';
import { useToday } from '@/hooks/use-today';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

type Range = 7 | 30 | 90 | 365 | 'all';
const RANGES: { value: Range; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
  { value: 'all', label: 'All time' },
];
const pct = (p: number | null) => (p == null ? '—' : `${Math.round(p * 100)}%`);

export default function StatsScreen() {
  const { colors } = useTheme();
  const today = useToday();
  const settings = useSettings();
  const data = useHabitData();
  const { limits } = usePlan();
  const [range, setRange] = useState<Range>(30);
  const [listId, setListId] = useState<string | null>(null);
  const [lockedTapped, setLockedTapped] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const fdw = settings.firstDayOfWeek;

  const contexts = useMemo(
    () => (listId ? data.contexts.filter((c) => c.habit.listId === listId) : data.contexts),
    [data.contexts, listId],
  );
  const earliest = useMemo(
    () => contexts.reduce((min, c) => minDate(min, c.habit.startDate), today),
    [contexts, today],
  );
  const from = range === 'all' ? earliest : addDays(today, -(range - 1));
  const days = diffDays(from, today) + 1;

  const series = useMemo(() => dailySeries(contexts, data.records, from, today, today, fdw), [contexts, data.records, from, today, fdw]);
  const heat = useMemo(
    () => dailySeries(contexts, data.records, addDays(today, -7 * 16 + 1), today, today, fdw),
    [contexts, data.records, today, fdw],
  );
  const overall = aggregateRate(series);
  const prevSeries = useMemo(
    () => (range === 'all' ? [] : dailySeries(contexts, data.records, addDays(from, -days), addDays(from, -1), today, fdw)),
    [contexts, data.records, from, days, range, today, fdw],
  );
  const prev = aggregateRate(prevSeries).rate;

  const perHabit = useMemo(
    () =>
      contexts
        .map((c) => ({
          ctx: c,
          stats: evaluateHabit(c, data.records.get(c.habit.id) ?? new Map(), { from, to: today, today, firstDayOfWeek: fdw }),
        }))
        .filter((x) => x.stats.opportunities > 0 || !x.ctx.habit.archivedOn)
        .sort((a, b) => (b.stats.rate ?? -1) - (a.stats.rate ?? -1)),
    [contexts, data.records, from, today, fdw],
  );
  const perList = useMemo(
    () =>
      data.lists
        .filter((l) => !l.archivedOn)
        .map((l) => ({
          list: l,
          rate: aggregateRate(dailySeries(data.contexts.filter((c) => c.habit.listId === l.id), data.records, from, today, today, fdw)).rate,
        })),
    [data.lists, data.contexts, data.records, from, today, fdw],
  );

  if (data.isLoading) return <LoadingState />;
  if (data.error) return <ErrorState message={errorMessage(data.error)} onRetry={data.refetch} />;
  if (data.contexts.length === 0) {
    return (
      <Screen headerless>
        <TabHeader title="Statistics" />
        <EmptyState icon="stats" title="No statistics yet" message="Create a habit and check it off — your progress will show up here." actionLabel="Create a habit" onAction={() => router.push('/habit/edit')} />
      </Screen>
    );
  }

  const rangeAllowed = (r: Range) => (r === 'all' ? limits.maxStatsRangeDays >= 100000 : r <= limits.maxStatsRangeDays);
  const bestCurrent = perHabit.reduce((m, x) => Math.max(m, x.stats.streakUnit === 'day' ? x.stats.currentStreak : 0), 0);
  const trend = days <= 31 ? series : bucketSeries(series, 7);
  const delta = overall.rate != null && prev != null ? Math.round((overall.rate - prev) * 100) : null;

  return (
    <Screen headerless>
      <TabHeader title="Statistics" />
      <ChipRow>
        {RANGES.map((r) => {
          const allowed = rangeAllowed(r.value);
          return (
            <Chip
              key={String(r.value)}
              label={r.label}
              selected={range === r.value}
              leading={allowed ? undefined : <Icon name="lock" size={12} color={colors.textTertiary} />}
              accessibilityLabel={allowed ? r.label : `${r.label}, premium`}
              onPress={() => (allowed ? (setRange(r.value), setLockedTapped(false)) : setLockedTapped(true))}
            />
          );
        })}
      </ChipRow>
      {lockedTapped && (
        <Notice
          icon="premium"
          title="Longer ranges are part of Premium"
          message="Free includes 7- and 30-day statistics, streaks, per-habit and per-list stats, and the heatmap."
          action={<Button title="See Premium" variant="ghost" size="sm" onPress={() => router.push('/premium')} />}
        />
      )}
      {data.lists.length > 1 && (
        <ChipRow>
          <Chip label="All lists" selected={listId == null} onPress={() => setListId(null)} />
          {data.lists.map((l) => (
            <Chip key={l.id} label={l.name} icon={l.icon} color={l.color} selected={listId === l.id} onPress={() => setListId(l.id)} />
          ))}
        </ChipRow>
      )}

      <View style={styles.tiles}>
        <StatTile
          label="Completion"
          value={pct(overall.rate)}
          hint={delta == null ? `${overall.done} of ${overall.due}` : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} pts vs previous`}
        />
        <StatTile label="Best current streak" value={`${bestCurrent} day${bestCurrent === 1 ? '' : 's'}`} />
      </View>

      <SectionHeader title="Last 16 weeks" />
      <Card>
        <Heatmap
          points={heat}
          firstDayOfWeek={fdw}
          today={today}
          summary={`Heatmap of daily completion for the last 16 weeks. Average ${pct(aggregateRate(heat).rate)}.`}
        />
        <Text variant="caption" tone="tertiary" style={styles.caption}>
          Darker = more of the day’s habits completed. Grey = nothing scheduled.
        </Text>
      </Card>

      <SectionHeader title={days <= 31 ? 'Daily completion' : 'Weekly completion'} />
      <Card>
        {days > 31 && !limits.advancedAnalytics ? (
          <Text tone="secondary">Trends for long ranges are part of Premium.</Text>
        ) : (
          <BarChart
            points={trend.map((p) => ({ key: p.date, percent: p.percent }))}
            labelFor={(d, i) => {
              const step = Math.ceil(trend.length / 7);
              return i % step === 0 ? formatLocalDate(d, { day: 'numeric', month: days > 31 ? 'short' : undefined }) : '';
            }}
            summary={`Completion trend over the selected range, average ${pct(overall.rate)}`}
          />
        )}
      </Card>

      {limits.advancedAnalytics ? (
        <>
          <SectionHeader title="By weekday" />
          <Card>
            <BarChart
              points={weekdayBreakdown(series).map((w) => ({ key: String(w.weekday), percent: w.rate }))}
              labelFor={(k) => weekdayShortName(Number(k) as 0).slice(0, 2)}
              summary="Completion rate by day of the week"
            />
          </Card>
        </>
      ) : (
        <Pressable onPress={() => router.push('/premium')} accessibilityRole="button" accessibilityHint="Opens Premium details">
          <Notice icon="insights" title="Weekday insights & long-term trends" message="See which days work best for you with Premium." />
        </Pressable>
      )}

      {!listId && perList.length > 1 && (
        <>
          <SectionHeader title="Lists" />
          <Card style={styles.gap}>
            {perList.map(({ list, rate }) => (
              <View key={list.id} style={styles.gapSm}>
                <View style={styles.row}>
                  <HabitGlyph icon={list.icon} color={list.color} size={16} />
                  <Text style={styles.flex} numberOfLines={1}>
                    {list.name}
                  </Text>
                  <Text variant="bodyStrong">{pct(rate)}</Text>
                </View>
                <ProgressBar value={rate ?? 0} color={list.color} height={6} label={`${list.name} completion`} />
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionHeader title="Habits" />
      <Card padded={false}>
        {perHabit.map(({ ctx, stats }, i) => (
          <View key={ctx.habit.id}>
            {i > 0 && <Divider inset={spacing.lg} />}
            <Pressable
              onPress={() => router.push({ pathname: '/habit/[id]', params: { id: ctx.habit.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${ctx.habit.name}: ${pct(stats.rate)}, current streak ${stats.currentStreak} ${stats.streakUnit}s, best ${stats.bestStreak}`}
              style={({ pressed }) => [styles.habitRow, pressed && { backgroundColor: colors.surfaceMuted }]}>
              <HabitIcon icon={ctx.habit.icon} color={ctx.habit.color} size={32} />
              <View style={styles.flex}>
                <Text numberOfLines={1}>
                  {ctx.habit.name}
                  {ctx.habit.archivedOn ? ' (archived)' : ''}
                </Text>
                <Text variant="caption" tone="secondary">
                  Streak {stats.currentStreak} · best {stats.bestStreak} {stats.streakUnit === 'day' ? '' : `${stats.streakUnit}s`}
                </Text>
              </View>
              <Text variant="bodyStrong">{pct(stats.rate)}</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      <Pressable onPress={() => setShowRules((s) => !s)} accessibilityRole="button" accessibilityState={{ expanded: showRules }} style={styles.rulesToggle}>
        <Icon name="info" size={16} color={colors.accent} />
        <Text tone="accent" variant="captionStrong">
          How statistics are calculated
        </Text>
      </Pressable>
      {showRules && (
        <Card style={styles.gapSm}>
          {[
            'Only scheduled days count. Days a habit isn’t scheduled, or was archived, never lower your rate.',
            'Skipped days are neutral: they don’t count as done or missed, and don’t break streaks.',
            'Today counts once you complete it or mark it missed — an unfinished day isn’t a failure yet.',
            '“N times per week/month” habits are judged per period; their streaks count weeks or months.',
            'Partial progress on a measurable habit isn’t counted as done.',
            'Editing a past day updates every statistic immediately. Schedule changes apply from the day you make them, unless you choose to apply them to all history.',
          ].map((t) => (
            <Text key={t} variant="caption" tone="secondary">
              • {t}
            </Text>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  caption: { marginTop: spacing.sm },
  gap: { gap: spacing.md },
  gapSm: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rulesToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'center', padding: spacing.sm },
});
