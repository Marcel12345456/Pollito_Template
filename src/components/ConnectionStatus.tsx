import { useConnectivity } from '../lib/queries';

/**
 * Offline and queued-write indicator.
 *
 * Necessary because optimistic updates make a queued write indistinguishable
 * from a saved one: the item is on screen either way. Without this the app is
 * quietly lying about whether the other person can see it.
 */
export function ConnectionStatus() {
  const { online, pending } = useConnectivity();

  if (online && pending === 0) return null;

  return (
    <div
      className={online ? 'notice' : 'notice notice--warn'}
      style={{ marginBottom: 16 }}
      role="status"
    >
      {!online ? (
        <>
          <strong>Offline</strong>
          {' — changes are saved here and sent when you reconnect.'}
        </>
      ) : (
        <>
          <strong>Syncing</strong>
          {` — ${pending} change${pending === 1 ? '' : 's'} to send.`}
        </>
      )}
    </div>
  );
}
