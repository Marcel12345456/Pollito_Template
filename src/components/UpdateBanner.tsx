import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Service worker update prompt.
 *
 * The plugin is configured with `registerType: 'prompt'`, so a new version is
 * downloaded but not activated until asked. That is the right default for an app
 * holding unsent writes: swapping the running code out from under a queued
 * mutation is a good way to lose it.
 *
 * The cost of that choice is that *something* has to offer the reload, or the app
 * silently runs an old version forever. This is that something.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => {
      // A failed registration means no offline support, which is worth knowing
      // about but not worth blocking the app for.
      console.warn('Service worker registration failed', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="notice" style={{ marginBottom: 16 }}>
      <strong>A new version is ready</strong>
      <div className="inline" style={{ marginTop: 8 }}>
        <button className="button--primary" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
        <button className="button--quiet" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    </div>
  );
}
