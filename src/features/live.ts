/**
 * V5-6 minimal live-state hub.
 *
 * The status-bar chip is the single funnel for outcome changes (build/test/
 * docs/coverage/health/env flows all end in `refreshChip()`). This hub lets
 * every OPEN result panel (health 明细, coverage, cockpit state-dependent
 * sections, …) subscribe so the webview detail stays byte-synced with the
 * chip — no per-flow bespoke refresh calls, no fixed-delay hacks.
 *
 * Pure module (no vscode): unit-testable; the host calls notifyStateChange()
 * once after the model is committed.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let scheduled = false;

/** Subscribe; returns an unsubscribe function (call on panel dispose). */
export function onStateChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Coalesced broadcast: listeners run on the next microtask reading the
 * latest committed module state, so a burst of refreshChip() calls repaints
 * each panel exactly once.
 */
export function notifyStateChange(): void {
  if (scheduled) {
    return;
  }
  scheduled = true;
  void Promise.resolve().then(() => {
    scheduled = false;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        /* a misbehaving panel must never break the hub or other panels */
      }
    }
  });
}

/** Test-only introspection. */
export function liveListenerCount(): number {
  return listeners.size;
}
