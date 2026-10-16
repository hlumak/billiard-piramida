import { SLOT_MINUTES, type AvailabilityDto } from '@repo/shared';

/**
 * Spots free for the whole chosen window: every half hour from `startMinute`
 * for `durationMinutes` must be available on the spot, not just the first.
 */
export function freeSpotIds(
  tables: AvailabilityDto['tables'],
  startMinute: number,
  durationMinutes: number
): Set<number> {
  const free = new Set<number>();
  const window = Array.from(
    { length: Math.ceil(durationMinutes / SLOT_MINUTES) },
    (_, i) => startMinute + i * SLOT_MINUTES
  );
  for (const table of tables) {
    const availableSlots = new Set(
      table.slots.filter(slot => slot.available).map(slot => slot.startMinute)
    );
    if (window.every(slot => availableSlots.has(slot))) free.add(table.tableId);
  }
  return free;
}
