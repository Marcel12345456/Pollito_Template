/**
 * The household's data, as kept on this device.
 *
 * The query cache is persisted to localStorage for a week so the app works
 * offline. That copy holds everything - income included - so it has to go when
 * the person using this device stops being entitled to it: on sign-out, and on
 * leaving the household. Otherwise the next person to open the app on a shared
 * device sees it.
 *
 * Kept apart from persist.ts, which touches `window` on import, so this can be
 * tested without a browser.
 */
import type { QueryClient } from '@tanstack/react-query';

export const CACHE_STORAGE_KEY = 'pollito.query-cache';

export function clearLocalData(
  client: QueryClient,
  storage: Pick<Storage, 'removeItem'> = window.localStorage,
): void {
  client.clear();
  storage.removeItem(CACHE_STORAGE_KEY);
}
