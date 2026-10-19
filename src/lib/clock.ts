/**
 * Injectable clock. Production code reads time only through here so tests can
 * pin "now" deterministically.
 */
import { today as todayOf } from '@/domain/dates';
import type { LocalDate } from '@/domain/types';

let override: (() => Date) | null = null;

export function now(): Date {
  return override ? override() : new Date();
}

export function nowIso(): string {
  return now().toISOString();
}

export function todayLocal(): LocalDate {
  return todayOf(now());
}

/** Test helper. Pass `null` to restore the real clock. */
export function setClock(fn: (() => Date) | null): void {
  override = fn;
}
