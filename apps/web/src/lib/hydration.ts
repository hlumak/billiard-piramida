import { useSyncExternalStore } from 'react';
import { hasFlagCookie } from './api';

/** Values that only exist in the browser (the DOM, flag cookies) must read
 *  `false` during SSR *and* during the hydration render, then pick up the real
 *  value straight after. useSyncExternalStore's getServerSnapshot does exactly
 *  that, so none of this needs an effect writing the initial value into state. */

const noopSubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** False through SSR and hydration, true once the client has taken over. */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
}

export interface FlagCookieStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => boolean;
  getServerSnapshot: () => boolean;
  /** Re-read the cookie, after a response has set it. */
  refresh: () => void;
  /** Report absent immediately: logout clears the cookie asynchronously. */
  clear: () => void;
}

/** Tracks one readable flag cookie as an external store. */
export function createFlagCookieStore(cookieName: string): FlagCookieStore {
  const listeners = new Set<() => void>();
  // `clear()` pins absent until `refresh()`, because the cookie only disappears
  // once the logout request lands; sign-in unpins, the cookie being set by then.
  let cleared = false;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => !cleared && hasFlagCookie(cookieName),
    getServerSnapshot: serverSnapshot,
    refresh: () => {
      cleared = false;
      emit();
    },
    clear: () => {
      cleared = true;
      emit();
    }
  };
}

export function useFlagCookie(store: FlagCookieStore): boolean {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
