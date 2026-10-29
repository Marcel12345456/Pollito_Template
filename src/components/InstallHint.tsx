import { useState } from 'react';
import { isIos, isStandalone, runInstallPrompt, useInstallPrompt } from '../lib/install';

/**
 * The install nudge on the Overview page.
 *
 * Dismissal is remembered, because a banner that returns every visit is worse
 * than no banner — but dismissing it is no longer a one-way door: Settings has a
 * permanent, non-dismissible install section. That separation is the point.
 * This is the *nudge*; Settings is the *route*.
 *
 * The prompt event itself comes from `lib/install.ts`, which captures it at
 * module load. Listening here in an effect used to miss it whenever this page
 * was not the first one mounted.
 */
const DISMISSED_KEY = 'pollito.installHintDismissed';

export function InstallHint() {
  const canInstall = useInstallPrompt();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true',
  );

  const hide = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  if (dismissed || isStandalone()) return null;
  // Nothing to offer: not iOS, and the browser has not said it is installable.
  if (!canInstall && !isIos()) return null;

  return (
    <div className="notice" style={{ marginBottom: 16 }}>
      <strong>Add Pollito to your home screen</strong>
      {canInstall ? (
        <div className="inline" style={{ marginTop: 8 }}>
          <button
            className="button--primary"
            onClick={() => { void runInstallPrompt(); hide(); }}
          >
            Install
          </button>
          <button className="button--quiet" onClick={hide}>Not now</button>
        </div>
      ) : (
        <>
          <p style={{ margin: '8px 0 0', color: 'inherit' }}>
            Tap <strong>Share</strong> at the bottom of Safari, then
            {' '}<strong>Add to Home Screen</strong>. It then opens like a normal app,
            without the browser bar.
          </p>
          <button className="button--quiet" style={{ marginTop: 8 }} onClick={hide}>
            Got it
          </button>
        </>
      )}
    </div>
  );
}
