import {
  DEFAULT_HOURLY_RATE_GROSZ,
  DEFAULT_WEEKLY_HOURS,
  type RateTier,
  type VenueConfigDto,
  type WeeklyHours
} from '@repo/shared';
import { venueHours, venueRates } from '../db/schema.ts';
import type { Db } from '../db/client.ts';
import { loadUpcomingClosures, toClosureDto, type ClosureRow } from './closures.ts';

const TIERS: RateTier[] = ['9ft', '12ft', 'darts'];

/**
 * Rates, opening hours and the whole club's upcoming closures, read from the
 * database and held in memory.
 *
 * Every availability request and every booking write needs this, so it is
 * cached rather than re-queried per request, and the admin writes drop the
 * cache. In-process only — the same single-node assumption `AvailabilityHub`
 * makes; a second API instance would serve its own copy until the TTL lapses,
 * which is why there is a TTL at all and not just invalidation.
 */
const TTL_MS = 60_000;

/** Closures stay rows (with their instants) so expired ones drop out per read */
interface Loaded {
  config: Omit<VenueConfigDto, 'closures'>;
  closures: ClosureRow[];
}

export class VenueConfigStore {
  readonly #db: Db;
  #cached: Loaded | null = null;
  #loadedAt = 0;
  /** In-flight load, shared so a cold burst issues one query, not twenty */
  #pending: Promise<Loaded> | null = null;

  constructor(db: Db) {
    this.#db = db;
  }

  async get(): Promise<VenueConfigDto> {
    let cached = this.#cached;
    if (cached === null || Date.now() - this.#loadedAt >= TTL_MS) {
      this.#pending ??= this.#load().finally(() => {
        this.#pending = null;
      });
      cached = await this.#pending;
    }
    // A closure that ended since the load drops out now, not at the next one
    const now = Date.now();
    return {
      ...cached.config,
      closures: cached.closures.filter(row => row.endsAt.getTime() > now).map(toClosureDto)
    };
  }

  /** Call after any write to venue_rates, venue_hours or closures. */
  invalidate(): void {
    this.#cached = null;
    this.#loadedAt = 0;
  }

  async #load(): Promise<Loaded> {
    const [rateRows, hourRows, closureRows] = await Promise.all([
      this.#db.select().from(venueRates),
      this.#db.select().from(venueHours),
      loadUpcomingClosures(this.#db, { clubOnly: true })
    ]);

    // Missing rows fall back to the values the club opened with rather than
    // throwing: a half-seeded database must still take bookings, and the admin
    // screen shows staff exactly what is in force.
    const rates = { ...DEFAULT_HOURLY_RATE_GROSZ };
    for (const row of rateRows) {
      if ((TIERS as string[]).includes(row.tier)) rates[row.tier as RateTier] = row.hourlyGrosz;
    }

    const hours = DEFAULT_WEEKLY_HOURS.map(({ open, close }) => ({ open, close })) as WeeklyHours;
    for (const row of hourRows) {
      if (row.weekday >= 0 && row.weekday <= 6) {
        hours[row.weekday] = { open: row.opens, close: row.closes };
      }
    }

    const loaded = { config: { rates, hours }, closures: closureRows };
    this.#cached = loaded;
    this.#loadedAt = Date.now();
    return loaded;
  }
}
