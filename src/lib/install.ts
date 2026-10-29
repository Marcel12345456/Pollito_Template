import { useSyncExternalStore } from 'react';

/**
 * Shared capture of the Android install prompt.
 *
 * `beforeinstallprompt` fires **once**, early in page load, and the event is the
 * only handle on Chrome's install flow — there is no way to ask for it again
 * without a full reload. So a component that adds the listener in `useEffect`
 * only catches it if that component happens to be mounted at that instant.
 *
 * That is exactly what went wrong: the install banner lived on the Overview
 * page, so landing on any other route, or navigating away and back, lost the
 * event permanently and the Install button simply never appeared.
 *
 * The listener is therefore registered at module load — before React renders —
 * and the event is kept here for whoever asks later.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let captured: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppressing Chrome's own mini-infobar lets the install happen from our
    // button instead of whenever the browser decides to offer it.
    event.preventDefault();
    captured = event as InstallPromptEvent;
    announce();
  });

  // Once installed the event is spent and must not be offered again.
  window.addEventListener('appinstalled', () => {
    captured = null;
    announce();
  });
}

export function subscribeToInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return captured;
}

/**
 * Runs the install flow. The event is single-use: Chrome rejects a second
 * `prompt()` call on the same event, so it is discarded either way.
 */
export async function runInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = captured;
  if (!event) return 'unavailable';
  await event.prompt();
  const { outcome } = await event.userChoice;
  captured = null;
  announce();
  return outcome;
}

/** True when already running as an installed app, in which case say nothing. */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    // iOS predates the standard and exposes its own flag.
    || (window.navigator as { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Subscribes to the captured prompt. `useSyncExternalStore` rather than
 * `useState` + effect, so a component mounted *after* the event fired still
 * sees it — which is the whole point of hoisting the listener out of React.
 */
export function useInstallPrompt(): boolean {
  return useSyncExternalStore(
    subscribeToInstallPrompt,
    () => captured !== null,
    () => false,
  );
}
