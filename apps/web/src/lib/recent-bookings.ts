import { useMemo, useSyncExternalStore } from 'react';

/** Bookings created in this browser (no accounts) — newest first. */

const STORAGE_KEY = 'piramida.bookings';
const MAX_STORED = 20;

const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function parse(raw: string): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function recentBookingIds(): string[] {
  if (typeof window === 'undefined') return [];
  return parse(readRaw());
}

export function rememberBooking(id: string): void {
  if (typeof window === 'undefined') return;
  const ids = recentBookingIds().filter(stored => stored !== id);
  ids.unshift(id);
  // Must not throw on the post-create redirect path in storage-blocked browsers;
  // phone lookup already recovers bookings on devices without persistent storage.
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_STORED)));
  } catch {
    /* storage blocked — booking is still reachable via its URL and phone lookup */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab booking or looking up changes the list too
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The stored ids, or null through SSR and hydration (localStorage is
 * browser-only). The snapshot is the raw string, which compares by value, so
 * the store never hands React a fresh array on every read.
 */
export function useRecentBookingIds(): string[] | null {
  const raw = useSyncExternalStore<string | undefined>(subscribe, readRaw, () => undefined);
  return useMemo(() => (raw === undefined ? null : parse(raw)), [raw]);
}
