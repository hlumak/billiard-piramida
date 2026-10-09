import { useSyncExternalStore } from 'react';

const MINUTE_MS = 60_000;

/** Current time floored to the minute: stable between ticks, so renders agree. */
const currentMinute = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;

function subscribe(onChange: () => void): () => void {
  // Polled more often than it changes; React only re-renders when the minute does
  const timer = setInterval(onChange, 15_000);
  return () => clearInterval(timer);
}

/**
 * "Now" for views that show the current hour (the staff schedule): reading
 * the clock during render is impure — and never re-rendered on its own, so a
 * page left open kept highlighting an hour long gone.
 */
export function useNowMinute(): number {
  return useSyncExternalStore(subscribe, currentMinute, currentMinute);
}
