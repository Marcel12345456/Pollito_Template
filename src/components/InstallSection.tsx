import { useState } from 'react';
import { isIos, isStandalone, runInstallPrompt, useInstallPrompt } from '../lib/install';

/**
 * Install, reachable on purpose.
 *
 * The install offer used to exist only as a dismissible banner on the Overview
 * page. Two things made it unfindable:
 *
 * 1. `beforeinstallprompt` fires once per page load. A listener added in a
 *    component's effect misses it unless that component is mounted at that
 *    moment, so landing on any other route lost the event for the whole visit.
 *    That is now captured at module load in `lib/install.ts`.
 * 2. Dismissing the banner set a localStorage flag with no route back. The only
 *    way to see the button again was to clear site data.
 *
 * So this lives in Settings, is never dismissible, and always says something —
 * including "already installed", because a screen that renders nothing looks
 * broken rather than satisfied.
 */
export function InstallSection() {
  const canInstall = useInstallPrompt();
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | 'unavailable' | null>(null);

  if (isStandalone()) {
    return (
      <div className="notice" style={{ marginBottom: 12 }}>
        <strong>Installed.</strong> You are running Pollito as an app.
      </div>
    );
  }

  if (canInstall) {
    return (
      <div className="notice" style={{ marginBottom: 12 }}>
        <strong>Add Pollito to your home screen</strong>
        <p style={{ margin: '4px 0 8px', color: 'inherit', fontSize: 13 }}>
          It then opens without the browser bar, and works offline.
        </p>
        <div className="inline">
          <button
            className="button--primary"
            onClick={() => { void runInstallPrompt().then(setOutcome); }}
          >
            Install
          </button>
        </div>
        {outcome === 'dismissed' ? (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'inherit' }}>
            Cancelled. Reload the page to be offered it again.
          </p>
        ) : null}
      </div>
    );
  }

  // iOS fires no install event at all and offers no prompt, so the only route is
  // an instruction. Safari-only: Chrome and Firefox on iOS cannot install.
  if (isIos()) {
    return (
      <div className="notice" style={{ marginBottom: 12 }}>
        <strong>Add Pollito to your home screen</strong>
        <p style={{ margin: '4px 0 0', color: 'inherit', fontSize: 13 }}>
          In <strong>Safari</strong>, tap <strong>Share</strong> at the bottom,
          then <strong>Add to Home Screen</strong>. Chrome and Firefox on iPhone
          cannot install apps.
        </p>
      </div>
    );
  }

  // Android with no captured event: almost always the service worker was not
  // active yet on this load. Say what to do rather than showing nothing.
  return (
    <div className="notice notice--warn" style={{ marginBottom: 12 }}>
      <strong>Install not offered yet</strong>
      <p style={{ margin: '4px 0 0', color: 'inherit', fontSize: 13 }}>
        Reload this page once — the offer appears after the app has been cached.
        If it still does not, use Chrome's <strong>⋮</strong> menu →
        {' '}<strong>Add to Home screen</strong>. A private tab can never install.
      </p>
    </div>
  );
}
