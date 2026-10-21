/**
 * Lightweight app state (Zustand). Persistent data lives in SQLite; this store
 * only holds the loaded settings snapshot and ephemeral UI/session state.
 */
import { create } from 'zustand';

import { DEFAULT_SETTINGS } from '@/db/settings';
import type { LocalDate, UserSettings } from '@/domain/types';

export type SyncStatus = 'disabled' | 'idle' | 'syncing' | 'error' | 'offline';

export interface Toast {
  id: number;
  message: string;
  tone?: 'default' | 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

export interface Entitlement {
  premium: boolean;
  source: 'none' | 'store' | 'developer';
  expiresAt: string | null;
  willRenew: boolean | null;
  managementUrl: string | null;
}

interface AppState {
  settings: UserSettings;
  /** `null` means "follow today". */
  selectedDate: LocalDate | null;
  /** `'all'` shows the combined dashboard across active lists. */
  selectedListId: string;
  entitlement: Entitlement;
  sync: { status: SyncStatus; lastSyncedAt: string | null; pending: number; error: string | null };
  toast: Toast | null;

  setSettings: (s: UserSettings) => void;
  setSelectedDate: (d: LocalDate | null) => void;
  setSelectedListId: (id: string) => void;
  setEntitlement: (e: Entitlement) => void;
  setSync: (patch: Partial<AppState['sync']>) => void;
  showToast: (t: Omit<Toast, 'id'>) => void;
  hideToast: () => void;
}

let toastId = 0;

export const FREE_ENTITLEMENT: Entitlement = {
  premium: false,
  source: 'none',
  expiresAt: null,
  willRenew: null,
  managementUrl: null,
};

export const useAppStore = create<AppState>((set) => ({
  settings: DEFAULT_SETTINGS,
  selectedDate: null,
  selectedListId: 'all',
  entitlement: FREE_ENTITLEMENT,
  sync: { status: 'disabled', lastSyncedAt: null, pending: 0, error: null },
  toast: null,

  setSettings: (settings) => set({ settings }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedListId: (selectedListId) => set({ selectedListId }),
  setEntitlement: (entitlement) => set({ entitlement }),
  setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),
  showToast: (t) => set({ toast: { ...t, id: ++toastId } }),
  hideToast: () => set({ toast: null }),
}));

export const showToast = (t: Omit<Toast, 'id'>) => useAppStore.getState().showToast(t);
