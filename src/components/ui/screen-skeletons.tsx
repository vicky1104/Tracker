/**
 * Loading placeholders shaped like the screens they stand in for, so content
 * settles into place instead of popping in behind a spinner.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';

import { useTheme } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

import { Card, Divider, Screen } from './layout';
import { Skeleton, SkeletonChips, SkeletonCircle, SkeletonGroup, SkeletonSectionHeader, SkeletonText } from './skeleton';

const TITLE_WIDTHS: DimensionValue[] = ['58%', '72%', '46%', '64%', '52%'];
const BAR_HEIGHTS = [0.55, 0.8, 0.4, 0.95, 0.65, 0.3, 0.75, 0.5, 0.85, 0.6, 0.35, 0.9, 0.7, 0.45];

function SkeletonScreen({ children, headerless, label }: { children: ReactNode; headerless?: boolean; label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <SkeletonGroup label={label} style={styles.flex}>
        <Screen headerless={headerless} scrollEnabled={false}>
          {children}
        </Screen>
      </SkeletonGroup>
    </View>
  );
}

function HeaderSkeleton({ subtitle, actions = 0 }: { subtitle?: boolean; actions?: number }) {
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        {subtitle && <SkeletonText variant="caption" width="45%" />}
        <SkeletonText variant="display" width="55%" />
      </View>
      {Array.from({ length: actions }, (_, i) => (
        <SkeletonCircle key={i} size={36} style={styles.headerAction} />
      ))}
    </View>
  );
}

/** Card of habit-style rows: icon, name, caption and an optional trailing control. */
function RowsSkeleton({ count = 3, trailing = 'none' }: { count?: number; trailing?: 'check' | 'button' | 'none' }) {
  return (
    <Card padded={false}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i}>
          {i > 0 && <Divider inset={spacing.lg} />}
          <View style={styles.row}>
            <Skeleton width={40} height={40} radius={radius.md} />
            <View style={styles.rowText}>
              <SkeletonText variant="bodyStrong" width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} />
              <SkeletonText variant="caption" width="38%" />
            </View>
            {trailing === 'check' && <SkeletonCircle size={34} />}
            {trailing === 'button' && <Skeleton width={76} height={36} radius={radius.sm} />}
          </View>
        </View>
      ))}
    </Card>
  );
}

function TilesSkeleton({ count, hint }: { count: number; hint?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.tiles}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SkeletonText variant="micro" width="55%" />
          <SkeletonText variant="title" width="45%" />
          {hint && <SkeletonText variant="caption" width="65%" />}
        </View>
      ))}
    </View>
  );
}

function BarsSkeleton({ count = 14, height = 120 }: { count?: number; height?: number }) {
  return (
    <View style={[styles.bars, { height }]}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={`${BAR_HEIGHTS[i % BAR_HEIGHTS.length] * 100}%`} radius={radius.sm / 2} style={styles.flex} />
      ))}
    </View>
  );
}

function ProgressSkeleton({ height = 8 }: { height?: number }) {
  return <Skeleton height={height} radius={radius.pill} />;
}

function FieldSkeleton() {
  return (
    <View style={styles.field}>
      <SkeletonText variant="caption" width={56} />
      <Skeleton height={48} radius={radius.md} />
    </View>
  );
}

/** Generic placeholder for screens without a dedicated skeleton. */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <SkeletonScreen headerless label={label}>
      <HeaderSkeleton />
      <RowsSkeleton count={4} />
    </SkeletonScreen>
  );
}

export function TodaySkeleton() {
  return (
    <SkeletonScreen headerless label="Loading today’s habits">
      <HeaderSkeleton subtitle actions={2} />
      <View style={styles.days}>
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} width={48} height={64} radius={radius.md} />
        ))}
      </View>
      <Card style={styles.gapMd}>
        <View style={styles.progressTop}>
          <View style={styles.flex}>
            <SkeletonText variant="title" width={64} />
            <SkeletonText variant="caption" width="80%" />
          </View>
          <View style={styles.week}>
            <BarsSkeleton count={7} height={40} />
          </View>
        </View>
        <ProgressSkeleton />
      </Card>
      <SkeletonSectionHeader width={72} />
      <RowsSkeleton count={3} trailing="check" />
      <SkeletonSectionHeader width={88} />
      <RowsSkeleton count={2} trailing="check" />
    </SkeletonScreen>
  );
}

export function CalendarSkeleton() {
  return (
    <SkeletonScreen headerless label="Loading calendar">
      <HeaderSkeleton />
      <Skeleton height={40} radius={radius.md} />
      <Card style={styles.gapMd}>
        <View style={styles.nav}>
          <SkeletonCircle size={28} />
          <SkeletonText variant="heading" width={140} />
          <SkeletonCircle size={28} />
        </View>
        <View style={styles.grid}>
          {Array.from({ length: 35 }, (_, i) => (
            <View key={i} style={styles.cell}>
              <Skeleton height="100%" radius={radius.pill} />
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          <SkeletonText variant="caption" width={64} />
          <SkeletonText variant="caption" width={76} />
          <SkeletonText variant="caption" width={68} />
        </View>
      </Card>
      <SkeletonSectionHeader />
      <RowsSkeleton count={2} />
    </SkeletonScreen>
  );
}

export function StatsSkeleton() {
  return (
    <SkeletonScreen headerless label="Loading statistics">
      <HeaderSkeleton />
      <SkeletonChips widths={[52, 60, 60, 68, 44]} />
      <TilesSkeleton count={2} hint />
      <SkeletonSectionHeader width={104} />
      <Card style={styles.gapMd}>
        <Skeleton height={112} radius={radius.md} />
        <SkeletonText variant="caption" width="85%" />
      </Card>
      <SkeletonSectionHeader width={120} />
      <Card>
        <BarsSkeleton />
      </Card>
    </SkeletonScreen>
  );
}

export function ListsSkeleton() {
  const { colors } = useTheme();
  return (
    <SkeletonScreen headerless label="Loading lists">
      <HeaderSkeleton actions={1} />
      <Card style={styles.gapSm}>
        <SkeletonText variant="micro" width={140} />
        <View style={styles.overallRow}>
          <SkeletonText variant="display" width={72} />
          <View style={styles.flex}>
            <SkeletonText width="55%" />
            <SkeletonText variant="caption" width="40%" />
          </View>
        </View>
        <ProgressSkeleton />
      </Card>
      <Card padded={false}>
        <View style={styles.row}>
          <SkeletonCircle size={22} />
          <View style={styles.flex}>
            <SkeletonText width="50%" />
          </View>
        </View>
      </Card>
      <SkeletonSectionHeader width={72} />
      {Array.from({ length: 3 }, (_, i) => (
        <View key={i} style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.listTop}>
            <Skeleton width={44} height={44} radius={radius.md} />
            <View style={styles.flex}>
              <SkeletonText variant="bodyStrong" width={TITLE_WIDTHS[i]} />
              <SkeletonText variant="caption" width="50%" />
            </View>
            <SkeletonText variant="heading" width={40} />
          </View>
          <ProgressSkeleton height={6} />
        </View>
      ))}
    </SkeletonScreen>
  );
}

export function ListDetailSkeleton() {
  return (
    <SkeletonScreen label="Loading list">
      <TilesSkeleton count={3} hint />
      <ProgressSkeleton />
      <View style={styles.buttons}>
        <Skeleton width={132} height={36} radius={radius.sm} />
        <Skeleton width={96} height={36} radius={radius.sm} />
      </View>
      <SkeletonSectionHeader width={80} />
      <RowsSkeleton count={4} />
    </SkeletonScreen>
  );
}

export function HabitSearchSkeleton() {
  return (
    <SkeletonScreen label="Loading habits">
      <FieldSkeleton />
      <SkeletonChips widths={[64, 80, 44, 64, 96]} />
      <SkeletonText variant="caption" width={64} />
      <RowsSkeleton count={5} />
    </SkeletonScreen>
  );
}

export function ArchiveSkeleton() {
  return (
    <SkeletonScreen label="Loading archive">
      <View>
        <SkeletonText width="100%" />
        <SkeletonText width="95%" />
        <SkeletonText width="60%" />
      </View>
      <SkeletonSectionHeader width={56} />
      <RowsSkeleton count={3} trailing="button" />
    </SkeletonScreen>
  );
}

export function HabitDetailSkeleton() {
  return (
    <SkeletonScreen label="Loading habit">
      <View style={styles.hero}>
        <Skeleton width={64} height={64} radius={radius.lg + 2} />
        <View style={styles.flex}>
          <SkeletonText variant="title" width="70%" />
          <SkeletonText variant="caption" width="85%" />
        </View>
      </View>
      <TilesSkeleton count={2} />
      <TilesSkeleton count={2} hint />
      <SkeletonSectionHeader width={64} />
      <Card>
        <Skeleton height={220} radius={radius.md} />
      </Card>
      <SkeletonSectionHeader width={88} />
      <Card>
        <BarsSkeleton height={100} />
      </Card>
    </SkeletonScreen>
  );
}

/** Habit and list editors: name field, swatches and option cards. */
export function FormSkeleton() {
  return (
    <SkeletonScreen label="Loading form">
      <Card style={styles.gapLg}>
        <View style={styles.nameRow}>
          <Skeleton width={52} height={52} radius={radius.md} />
          <View style={styles.flex}>
            <FieldSkeleton />
          </View>
        </View>
        <View style={styles.swatches}>
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonCircle key={i} size={32} />
          ))}
        </View>
      </Card>
      <SkeletonSectionHeader width={120} />
      <Card style={styles.gapMd}>
        <SkeletonChips widths={[88, 72, 96]} />
        <Skeleton height={40} radius={radius.md} />
      </Card>
      <SkeletonSectionHeader width={48} />
      <Card style={styles.gapMd}>
        <Skeleton height={40} radius={radius.md} />
        <SkeletonText width="75%" />
      </Card>
    </SkeletonScreen>
  );
}

/** Inline placeholder for the store's plan options on the Premium screen. */
export function PlanOptionsSkeleton() {
  const { colors } = useTheme();
  return (
    <SkeletonGroup label="Loading plans" style={styles.gapSm}>
      {Array.from({ length: 2 }, (_, i) => (
        <View key={i} style={[styles.offer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.flex}>
            <SkeletonText variant="bodyStrong" width="40%" />
          </View>
          <SkeletonText variant="bodyStrong" width={88} />
        </View>
      ))}
      <Skeleton height={48} radius={radius.md} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapSm: { gap: spacing.sm },
  gapMd: { gap: spacing.md },
  gapLg: { gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerAction: { margin: (44 - 36) / 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowText: { flex: 1, gap: 2 },
  tiles: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  tile: { flex: 1, minWidth: 100, padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  days: { flexDirection: 'row', gap: 6, overflow: 'hidden' },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  week: { width: 128 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 4 },
  legend: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  overallRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginVertical: spacing.sm },
  listCard: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.md },
  listTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  hero: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  field: { gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  offer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 2 },
});
