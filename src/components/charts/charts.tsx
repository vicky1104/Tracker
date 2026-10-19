/**
 * Lightweight charts built from plain Views — no SVG dependency, fast on
 * low-end devices, and each chart exposes a text summary to screen readers.
 */
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/text";
import {
  addDays,
  diffDays,
  endOfMonth,
  formatLocalDate,
  orderedWeekdays,
  parseLocalDate,
  startOfMonth,
  startOfWeek,
  weekdayOf,
  weekdayShortName,
} from "@/domain/dates";
import type { DailyPoint } from "@/domain/stats";
import type { FirstDayOfWeek, LocalDate } from "@/domain/types";
import { useTheme } from "@/theme/theme";
import { radius, spacing, withAlpha } from "@/theme/tokens";

const pctLabel = (p: number | null) =>
  p == null ? "no data" : `${Math.round(p * 100)}%`;

/** Vertical bars with labels; `percent: null` renders an empty slot. */
export function BarChart({
  points,
  labelFor,
  height = 96,
  selected,
  onSelect,
  color,
  summary,
}: {
  points: { key: string; percent: number | null }[];
  labelFor: (key: string, index: number) => string;
  height?: number;
  selected?: string;
  onSelect?: (key: string) => void;
  color?: string;
  summary: string;
}) {
  const { colors } = useTheme();
  const tint = color ?? colors.accent;
  return (
    <View accessible={!onSelect} accessibilityLabel={summary}>
      <View style={[styles.bars, { height }]}>
        {points.map((p, i) => {
          const isSelected = p.key === selected;
          const h =
            p.percent == null
              ? 0
              : Math.max(p.percent > 0 ? 4 : 2, p.percent * height);
          const bar = (
            <View style={styles.barSlot}>
              <View
                style={[
                  styles.barTrack,
                  { height, backgroundColor: colors.surfaceMuted },
                ]}
              >
                <View
                  style={[
                    styles.barFill,
                    {
                      height: h,
                      backgroundColor:
                        p.percent == null
                          ? "transparent"
                          : isSelected || !selected
                            ? tint
                            : withAlpha(tint, 0.55),
                    },
                  ]}
                />
              </View>
            </View>
          );
          return onSelect ? (
            <Pressable
              key={p.key}
              style={styles.barPress}
              onPress={() => onSelect(p.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${labelFor(p.key, i)}: ${pctLabel(p.percent)}`}
            >
              {bar}
            </Pressable>
          ) : (
            <View key={p.key} style={styles.barPress}>
              {bar}
            </View>
          );
        })}
      </View>
      <View
        style={styles.barLabels}
        importantForAccessibility="no-hide-descendants"
      >
        {points.map((p, i) => (
          <View key={p.key} style={styles.barLabelSlot}>
            <Text
              variant="micro"
              tone={p.key === selected ? "primary" : "tertiary"}
              style={styles.barLabel}
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
            >
              {labelFor(p.key, i)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Week-by-week heatmap (columns = weeks, rows = weekdays). */
export function Heatmap({
  points,
  firstDayOfWeek,
  today,
  color,
  summary,
}: {
  points: DailyPoint[];
  firstDayOfWeek: FirstDayOfWeek;
  today: LocalDate;
  color?: string;
  summary: string;
}) {
  const { colors } = useTheme();
  const tint = color ?? colors.accent;
  if (points.length === 0) return null;
  const byDate = new Map(points.map((p) => [p.date, p]));
  const start = startOfWeek(points[0].date, firstDayOfWeek);
  const end = points[points.length - 1].date;
  const weeks = Math.ceil((diffDays(start, end) + 1) / 7);
  const rows = orderedWeekdays(firstDayOfWeek);

  return (
    <View accessible accessibilityLabel={summary} style={styles.heatmap}>
      <View style={styles.heatLabels}>
        {rows.map((w, i) => (
          <Text
            key={w}
            variant="micro"
            tone="tertiary"
            style={styles.heatLabel}
            maxFontSizeMultiplier={1}
          >
            {i % 2 === 0 ? weekdayShortName(w).slice(0, 1) : ""}
          </Text>
        ))}
      </View>
      <View style={styles.heatGrid}>
        {Array.from({ length: weeks }, (_, wi) => (
          <View key={wi} style={styles.heatCol}>
            {rows.map((_, di) => {
              const d = addDays(start, wi * 7 + di);
              const p = byDate.get(d);
              const outside = !p || d > today;
              const bg = outside
                ? "transparent"
                : p.percent == null
                  ? colors.surfaceMuted
                  : p.percent === 0
                    ? withAlpha(colors.danger, 0.18)
                    : withAlpha(tint, 0.25 + 0.75 * p.percent);
              return (
                <View
                  key={d}
                  style={[styles.heatCell, { backgroundColor: bg }]}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export interface DayCellStyle {
  /** 0–1 fill, or null for "no data" */
  percent: number | null;
  /** Short glyph for non-color state (✓, –, ×, ·). */
  glyph?: string;
  label: string;
  muted?: boolean;
}

/** Month calendar grid; each day is rendered from `cellFor`. */
export function MonthGrid({
  month,
  firstDayOfWeek,
  today,
  selected,
  onSelect,
  cellFor,
  color,
}: {
  month: LocalDate;
  firstDayOfWeek: FirstDayOfWeek;
  today: LocalDate;
  selected?: LocalDate | null;
  onSelect?: (d: LocalDate) => void;
  cellFor: (d: LocalDate) => DayCellStyle;
  color?: string;
}) {
  const { colors } = useTheme();
  const tint = color ?? colors.accent;
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const lead = (weekdayOf(first) - firstDayOfWeek + 7) % 7;
  const total = lead + parseLocalDate(last).day;
  const cells = Math.ceil(total / 7) * 7;

  return (
    <View>
      <View
        style={styles.monthHeader}
        importantForAccessibility="no-hide-descendants"
      >
        {orderedWeekdays(firstDayOfWeek).map((w) => (
          <Text
            key={w}
            variant="micro"
            tone="tertiary"
            style={styles.monthHeaderCell}
            maxFontSizeMultiplier={1.2}
          >
            {weekdayShortName(w).slice(0, 2)}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells / 7 }, (_, week) => (
        <View key={week} style={styles.monthRow}>
          {Array.from({ length: 7 }, (_, col) => {
            const i = week * 7 + col;
            const d = addDays(first, i - lead);
            const inMonth = d >= first && d <= last;
            if (!inMonth) return <View key={i} style={styles.monthCell} />;
            const cell = cellFor(d);
            const isSelected = d === selected;
            const isToday = d === today;
            const full = cell.percent != null && cell.percent >= 1;
            const bg =
              cell.percent == null
                ? "transparent"
                : full
                  ? tint
                  : cell.percent > 0
                    ? withAlpha(tint, 0.18 + 0.4 * cell.percent)
                    : colors.surfaceMuted;
            const fg = full
              ? colors.onAccent
              : cell.muted
                ? colors.textTertiary
                : colors.text;
            return (
              <Pressable
                key={d}
                style={styles.monthCell}
                disabled={!onSelect}
                onPress={() => onSelect?.(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${formatLocalDate(d, { weekday: "long", month: "long", day: "numeric" })}${isToday ? ", today" : ""}: ${cell.label}`}
              >
                <View
                  style={[
                    styles.monthDay,
                    {
                      backgroundColor: bg,
                      borderColor: isSelected
                        ? colors.text
                        : isToday
                          ? tint
                          : "transparent",
                    },
                  ]}
                >
                  <Text
                    variant="captionStrong"
                    color={fg}
                    maxFontSizeMultiplier={1.2}
                  >
                    {parseLocalDate(d).day}
                  </Text>
                  {cell.glyph ? (
                    <Text
                      variant="micro"
                      color={fg}
                      style={styles.glyph}
                      maxFontSizeMultiplier={1}
                    >
                      {cell.glyph}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function Legend({
  items,
}: {
  items: { color: string; label: string; glyph?: string; outline?: boolean }[];
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem}>
          <View
            style={[
              styles.legendSwatch,
              {
                backgroundColor: i.outline ? "transparent" : i.color,
                borderColor: i.outline ? colors.borderStrong : i.color,
              },
            ]}
          >
            {i.glyph && (
              <Text
                variant="micro"
                style={styles.legendGlyph}
                maxFontSizeMultiplier={1}
              >
                {i.glyph}
              </Text>
            )}
          </View>
          <Text variant="caption" tone="secondary">
            {i.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      accessible
      accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ""}`}
    >
      <Text variant="micro" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="title" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint && (
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {hint}
        </Text>
      )}
    </View>
  );
}

export function monthTitle(month: LocalDate): string {
  return formatLocalDate(month, { month: "long", year: "numeric" });
}

const styles = StyleSheet.create({
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  barPress: { flex: 1 },
  barSlot: { alignItems: "center" },
  barTrack: {
    width: "100%",
    maxWidth: 28,
    borderRadius: 6,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: { width: "100%", borderRadius: 6 },
  barLabels: { flexDirection: "row", gap: 4, marginTop: spacing.xs },
  barLabelSlot: { flex: 1, alignItems: "center", overflow: "visible" },
  barLabel: { width: 48, textAlign: "center" },
  heatmap: { flexDirection: "row", gap: 4 },
  heatLabels: { gap: 3, paddingTop: 0 },
  heatLabel: { height: 12, lineHeight: 12, fontSize: 9 },
  heatGrid: {
    flex: 1,
    flexDirection: "row",
    gap: 3,
    justifyContent: "flex-end",
  },
  heatCol: { gap: 3 },
  heatCell: { width: 12, height: 12, borderRadius: 3 },
  monthHeader: { flexDirection: "row", marginBottom: spacing.xs },
  monthHeaderCell: { flex: 1, textAlign: "center" },
  monthRow: { flexDirection: "row" },
  monthCell: { flex: 1, aspectRatio: 1, padding: 2 },
  monthDay: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { fontSize: 9, lineHeight: 10, marginTop: -1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendSwatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  legendGlyph: { fontSize: 9, lineHeight: 11 },
  tile: {
    flex: 1,
    minWidth: 140,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
