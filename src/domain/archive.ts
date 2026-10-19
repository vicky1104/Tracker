import { addDays } from './dates';
import type { InactiveRange, LocalDate } from './types';

/**
 * When an archived habit/list is restored, the archived span becomes a
 * historical inactive range, so those days are neither counted as missed nor
 * break streaks.
 */
export function rangesAfterRestore(
  archivedOn: LocalDate | null,
  ranges: InactiveRange[],
  today: LocalDate,
): InactiveRange[] {
  if (!archivedOn) return ranges;
  const to = addDays(today, -1);
  return to >= archivedOn ? [...ranges, { from: archivedOn, to }] : ranges;
}
