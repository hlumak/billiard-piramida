import { useMemo, useSyncExternalStore } from 'react';

/**
 * Bookings made in this browser — newest first — with the secret that manages
 * each one (returned once, at creation; see CreatedBookingDto). Entries from
 * before the secret existed are bare ids, which the API still accepts for the
 * bookings of that time.
 */

export interface RecentBooking {
  id: string;
  token?: string;
}

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

function parse(raw: string): RecentBooking[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): RecentBooking[] => {
      if (typeof entry === 'string') return [{ id: entry }];
      if (typeof entry === 'object' && entry !== null && typeof entry.id === 'string') {
        return [
          typeof entry.token === 'string' ? { id: entry.id, token: entry.token } : { id: entry.id }
        ];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function write(entries: RecentBooking[]): void {
  // Must not throw on the post-create redirect path in storage-blocked browsers:
  // the booking's own link (which carries the secret) still manages it
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_STORED)));
  } catch {
    /* storage blocked */
  }
  for (const listener of listeners) listener();
}

export function recentBookings(): RecentBooking[] {
  if (typeof window === 'undefined') return [];
  return parse(readRaw());
}

/** Remember (or move to the top) a booking; a known secret is never dropped. */
export function rememberBooking(id: string, token?: string): void {
  if (typeof window === 'undefined') return;
  const existing = recentBookings();
  const known = token ?? existing.find(entry => entry.id === id)?.token;
  const rest = existing.filter(entry => entry.id !== id);
  write([known ? { id, token: known } : { id }, ...rest]);
}

/** Drop a booking the API no longer shows to us (deleted, or not ours). */
export function forgetBooking(id: string): void {
  if (typeof window === 'undefined') return;
  const existing = recentBookings();
  if (existing.some(entry => entry.id === id)) write(existing.filter(entry => entry.id !== id));
}

/** The secret that manages booking `id`, if this browser has it. */
export function manageTokenFor(id: string): string | undefined {
  return recentBookings().find(entry => entry.id === id)?.token;
}

/**
 * The booking page's link carries the secret in its fragment (#key=…), which
 * browsers never send to a server: opening that link on another device is
 * how a guest manages a booking from there. Adopt it into this browser.
 *
 * Only on that booking's own page, and only when this browser holds no secret
 * for it yet. The fragment used to be taken for whichever booking was being
 * fetched: a link to /bookings#key=x replaced the secret of every stored
 * booking with "x", the API then answered 404 for each, and the list forgot
 * them all — the guest could no longer manage any of them here.
 */
export function adoptTokenFromLocation(id: string): void {
  if (typeof window === 'undefined') return;
  const [page, pageId] = window.location.pathname.split('/').filter(Boolean).slice(-2);
  if (page !== 'booking' || pageId !== id) return;
  if (manageTokenFor(id) !== undefined) return;
  const key = new URLSearchParams(window.location.hash.slice(1)).get('key');
  if (key) rememberBooking(id, key);
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
 * The stored bookings, or null through SSR and hydration (localStorage is
 * browser-only). The snapshot is the raw string, which compares by value, so
 * the store never hands React a fresh array on every read.
 */
export function useRecentBookings(): RecentBooking[] | null {
  const raw = useSyncExternalStore<string | undefined>(subscribe, readRaw, () => undefined);
  return useMemo(() => (raw === undefined ? null : parse(raw)), [raw]);
}
