import { QueryClient } from '@tanstack/react-query';

/**
 * Local SQLite queries must never pause when the device is offline, so the
 * default network mode is `always`. Remote queries opt into `online` explicitly.
 * Local data only changes through our own mutations, which invalidate precisely,
 * so it never goes stale on its own.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'always', staleTime: Infinity, gcTime: Infinity, retry: 1 },
    mutations: { networkMode: 'always' },
  },
});

export const qk = {
  habits: ['habits'] as const,
  completions: ['completions'] as const,
  lists: ['lists'] as const,
  reminders: ['reminders'] as const,
  remoteConfig: ['remote-config'] as const,
};
