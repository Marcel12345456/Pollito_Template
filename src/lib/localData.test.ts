import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { CACHE_STORAGE_KEY, clearLocalData } from './localData';

/** Just enough of `Storage` to observe what was removed. */
function memoryStorage(entries: Record<string, string>) {
  const items = new Map(Object.entries(entries));
  return {
    items,
    removeItem: (key: string) => void items.delete(key),
  };
}

describe('clearLocalData', () => {
  it('removes the persisted cache and leaves unrelated keys alone', () => {
    const storage = memoryStorage({
      [CACHE_STORAGE_KEY]: '{"clientState":{"queries":[{"income":300000}]}}',
      'pollito.install-dismissed': 'true',
    });

    clearLocalData(new QueryClient(), storage);

    expect(storage.items.has(CACHE_STORAGE_KEY)).toBe(false);
    expect(storage.items.get('pollito.install-dismissed')).toBe('true');
  });

  it('empties the in-memory query cache', () => {
    const client = new QueryClient();
    client.setQueryData(['income'], [{ amount_cents: 300000 }]);
    client.setQueryData(['auth-user'], 'someone-else');

    clearLocalData(client, memoryStorage({}));

    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
