import type { AvailabilityDto } from '@repo/shared';

/**
 * Spots free for the whole chosen window: every hour from `startHour` for
 * `durationHours` hours must be available on the spot, not just the first.
 */
export function freeSpotIds(
  tables: AvailabilityDto['tables'],
  startHour: number,
  durationHours: number
): Set<number> {
  const free = new Set<number>();
  for (const table of tables) {
    const availableHours = new Set(
      table.slots.filter(slot => slot.available).map(slot => slot.hour)
    );
    const window = Array.from({ length: durationHours }, (_, i) => startHour + i);
    if (window.every(hour => availableHours.has(hour))) free.add(table.tableId);
  }
  return free;
}
