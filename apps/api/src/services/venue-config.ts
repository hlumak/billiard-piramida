import {
  DEFAULT_HOURLY_RATE_GROSZ,
  DEFAULT_WEEKLY_HOURS,
  type RateTier,
  type VenueConfigDto,
  type WeeklyHours
} from '@repo/shared';
import { venueHours, venueRates } from '../db/schema.ts';
import type { Db } from '../db/client.ts';

const TIERS: RateTier[] = ['9ft', '12ft', 'darts'];

/**
 * Rates and opening hours, read from the database and held in memory.
 *
 * Every availability request and every booking write needs this, so it is
 * cached rather than re-queried per request, and the admin writes drop the
 * cache. In-process only — the same single-node assumption `AvailabilityHub`
 * makes; a second API instance would serve its own copy until the TTL lapses,
 * which is why there is a TTL at all and not just invalidation.
 */
const TTL_MS = 60_000;

export class VenueConfigStore {
  readonly #db: Db;
  #cached: VenueConfigDto | null = null;
  #loadedAt = 0;
  /** In-flight load, shared so a cold burst issues one query, not twenty */
  #pending: Promise<VenueConfigDto> | null = null;

  constructor(db: Db) {
    this.#db = db;
  }

  async get(): Promise<VenueConfigDto> {
    if (this.#cached !== null && Date.now() - this.#loadedAt < TTL_MS) return this.#cached;
    this.#pending ??= this.#load().finally(() => {
      this.#pending = null;
    });
    return this.#pending;
  }

  /** Call after any write to venue_rates or venue_hours. */
  invalidate(): void {
    this.#cached = null;
    this.#loadedAt = 0;
  }

  async #load(): Promise<VenueConfigDto> {
    const [rateRows, hourRows] = await Promise.all([
      this.#db.select().from(venueRates),
      this.#db.select().from(venueHours)
    ]);

    // Missing rows fall back to the values the club opened with rather than
    // throwing: a half-seeded database must still take bookings, and the admin
    // screen shows staff exactly what is in force.
    const rates = { ...DEFAULT_HOURLY_RATE_GROSZ };
    for (const row of rateRows) {
      if ((TIERS as string[]).includes(row.tier)) rates[row.tier as RateTier] = row.hourlyGrosz;
    }

    const hours = DEFAULT_WEEKLY_HOURS.map(day => ({ ...day })) as WeeklyHours;
    for (const row of hourRows) {
      if (row.weekday >= 0 && row.weekday <= 6) {
        hours[row.weekday] = { open: row.opens, close: row.closes };
      }
    }

    const config: VenueConfigDto = { rates, hours };
    this.#cached = config;
    this.#loadedAt = Date.now();
    return config;
  }
}
