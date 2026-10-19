import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { LocalDate } from '@/domain/types';
import { now, todayLocal } from '@/lib/clock';

/**
 * The current local date. Updates at midnight and whenever the app returns to
 * the foreground (covers time-zone changes while travelling and long suspends).
 */
export function useToday(): LocalDate {
  const [today, setToday] = useState(todayLocal);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const n = now();
      const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        setToday(todayLocal());
        schedule();
      }, next.getTime() - n.getTime());
    };
    schedule();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(todayLocal());
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return today;
}
