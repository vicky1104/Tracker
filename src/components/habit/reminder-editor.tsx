import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/controls';
import { Notice } from '@/components/ui/layout';
import { TimeField, WeekdayPicker } from '@/components/ui/pickers';
import { Text } from '@/components/ui/text';
import type { FirstDayOfWeek, Weekday } from '@/domain/types';
import type { HabitFormValues } from '@/domain/validation';
import { getPermissionState, openSystemSettings, requestPermission, type PermissionState } from '@/services/notifications';
import { useTheme } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

type ReminderValue = HabitFormValues['reminders'][number];

export function usePermissionState(): [PermissionState | null, () => Promise<void>] {
  const query = useQuery({
    queryKey: ['notification-permission'],
    queryFn: () => getPermissionState().catch(() => 'undetermined' as const),
    staleTime: 0,
  });
  const { refetch } = query;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refetch();
    });
    return () => sub.remove();
  }, [refetch]);
  return [query.data ?? null, async () => void (await refetch())];
}

/** Explains why permission is needed before the system prompt, and handles denial. */
export function PermissionNotice({ state, onChange }: { state: PermissionState | null; onChange: () => void }) {
  if (state === 'granted' || state === 'provisional' || state == null) return null;
  if (state === 'denied') {
    return (
      <Notice
        tone="warning"
        icon="bellOff"
        title="Notifications are turned off"
        message="Reminders are saved, but your phone won’t show them until you allow notifications for HabitFlow in Settings."
        action={<Button title="Open Settings" variant="ghost" size="sm" onPress={openSystemSettings} style={styles.noticeButton} />}
      />
    );
  }
  return (
    <Notice
      icon="bell"
      title="Allow reminders?"
      message="HabitFlow only sends the reminders you set here — no marketing. You can change this any time."
      action={
        <Button
          title="Allow notifications"
          variant="ghost"
          size="sm"
          style={styles.noticeButton}
          onPress={async () => {
            await requestPermission();
            onChange();
          }}
        />
      }
    />
  );
}

export function ReminderEditor({
  value,
  onChange,
  defaultTime,
  firstDayOfWeek,
}: {
  value: ReminderValue[];
  onChange: (v: ReminderValue[]) => void;
  defaultTime: string;
  firstDayOfWeek: FirstDayOfWeek;
}) {
  const { colors } = useTheme();
  const [permission, refresh] = usePermissionState();
  const update = (i: number, patch: Partial<ReminderValue>) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <View style={styles.wrap}>
      {value.length > 0 && <PermissionNotice state={permission} onChange={refresh} />}
      {value.map((r, i) => (
        <View key={r.id ?? `new-${i}`} style={[styles.reminder, { backgroundColor: colors.surfaceMuted }]}>
          <View style={styles.row}>
            <TimeField value={r.time} onChange={(time) => update(i, { time })} label={`Reminder ${i + 1} time`} />
            <View style={styles.flex} />
            <Chip
              label={r.enabled ? 'On' : 'Off'}
              selected={r.enabled}
              onPress={() => update(i, { enabled: !r.enabled })}
              accessibilityLabel={`Reminder ${i + 1} ${r.enabled ? 'enabled' : 'disabled'}`}
            />
            <IconButton icon="delete" label={`Remove reminder ${i + 1}`} color={colors.danger} onPress={() => onChange(value.filter((_, idx) => idx !== i))} />
          </View>
          <View style={styles.row}>
            <Chip label="When scheduled" selected={r.weekdays == null} onPress={() => update(i, { weekdays: null })} />
            <Chip
              label="Only on…"
              selected={r.weekdays != null}
              onPress={() => update(i, { weekdays: r.weekdays ?? ([1, 2, 3, 4, 5] as Weekday[]) })}
            />
          </View>
          {r.weekdays && (
            <WeekdayPicker value={r.weekdays} onChange={(weekdays) => update(i, { weekdays })} firstDayOfWeek={firstDayOfWeek} />
          )}
        </View>
      ))}
      {value.length < 5 && (
        <Button
          title={value.length === 0 ? 'Add a reminder' : 'Add another reminder'}
          icon="bell"
          variant="secondary"
          onPress={() => onChange([...value, { time: defaultTime, weekdays: null, enabled: true }])}
        />
      )}
      {value.length > 0 && (
        <Text variant="caption" tone="tertiary">
          Reminders follow the habit’s schedule and are skipped on days you’ve already completed or skipped.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  reminder: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  flex: { flex: 1 },
  noticeButton: { alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: spacing.xs },
});
