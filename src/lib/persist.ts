/**
 * Query cache persistence.
 *
 * Two jobs, and the second is the one that makes offline actually work:
 *
 *   1. Reads: the last-known data is restored on load, so opening the app in a
 *      shop with no signal shows your list rather than a spinner.
 *   2. Writes: paused mutations are persisted, so an item added offline survives
 *      the app being closed and is sent when you are back online.
 *
 * localStorage rather than IndexedDB: a two-person household's data is kilobytes,
 * the API is synchronous and cannot half-fail, and there is no schema to migrate.
 * IndexedDB would be the right answer at a size this app will never reach.
 */
import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistedClient } from '@tanstack/react-query-persist-client';

const STORAGE_KEY = 'pollito.query-cache';

/**
 * Bumped when the cached shape changes.
 *
 * A stale cache from an older build can contain rows whose columns no longer
 * exist, which surfaces as an inexplicable render error rather than as a cache
 * problem. Changing the buster throws the old cache away instead.
 */
const CACHE_VERSION = 'v1';

export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: STORAGE_KEY,
  // If localStorage is full or unavailable (private browsing on iOS), degrade to
  // an online-only app rather than failing to start.
  throttleTime: 1000,
});

export function createPersistentQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Freshness comes from realtime invalidation, so refetching on focus is
        // noise - and offline it would only produce failed requests.
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        // Keep data long enough to be worth persisting across sessions.
        gcTime: 1000 * 60 * 60 * 24 * 7,
        retry: 1,
        // `offlineFirst` runs the query if cached data exists and only then goes
        // to the network. The default would refuse to run at all while offline.
        networkMode: 'offlineFirst',
      },
      mutations: {
        // Paused rather than failed when offline, which is what makes the write
        // queue possible.
        networkMode: 'offlineFirst',
        retry: 2,
      },
    },
  });
}

export const persistOptions = {
  persister,
  buster: CACHE_VERSION,
  maxAge: 1000 * 60 * 60 * 24 * 7,
  dehydrateOptions: {
    // Persist paused mutations - the offline write queue. Without this the queue
    // exists only in memory and closing the app loses everything unsent.
    shouldDehydrateMutation: (mutation: { state: { isPaused: boolean } }) =>
      mutation.state.isPaused,
  },
} satisfies { persister: typeof persister; buster: string; maxAge: number; dehydrateOptions: unknown };

export type { PersistedClient };
