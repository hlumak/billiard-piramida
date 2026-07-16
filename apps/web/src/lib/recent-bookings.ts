/** Bookings created in this browser (no accounts) — newest first. */

const STORAGE_KEY = 'piramida.bookings';
const MAX_STORED = 20;

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
}

export function recentBookingIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
