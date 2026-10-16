import {
  addDays,
  MAX_CLOSURE_DAYS,
  type ClosureConflictDto,
  type ClosureDto,
  type IsoDate
} from '@repo/shared';
import { and, asc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { bookings, closures } from '../db/schema.ts';
import { warsawDateOf, warsawHourOf } from '../lib/time.ts';

/**
 * One advisory lock keys "the closures": a closure write holds it exclusively
 * while it checks for bookings in its way, and every booking write holds it
 * shared while it checks for closures. Either the booking sees the closure
 * or the closure sees the booking — never neither. Bookings share it, so they
 * still never wait for one another.
 */
const CLOSURES_LOCK_KEY = 0x636c6f73; // "clos"

type Tx = Pick<Db, 'select' | 'execute'>;

export async function lockClosuresShared(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock_shared(${CLOSURES_LOCK_KEY})`);
}

export async function lockClosuresExclusive(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${CLOSURES_LOCK_KEY})`);
}

/** Closures covering this spot: its own and the whole club's. */
function coversTable(tableId: number): SQL | undefined {
  return or(isNull(closures.tableIds), sql`${tableId} = any(${closures.tableIds})`);
}

/**
 * Whether a closure takes any of [startsAt, endsAt) on this spot. Call inside
 * the transaction that writes the booking; it takes the shared lock itself.
 */
export async function isClosedFor(
  tx: Tx,
  tableId: number,
  startsAt: Date,
  endsAt: Date
): Promise<boolean> {
  await lockClosuresShared(tx);
  const [hit] = await tx
    .select({ id: closures.id })
    .from(closures)
    .where(and(lt(closures.startsAt, endsAt), gt(closures.endsAt, startsAt), coversTable(tableId)))
    .limit(1);
  return hit !== undefined;
}

export type ClosureRow = typeof closures.$inferSelect;

export function toClosureDto(row: ClosureRow): ClosureDto {
  return {
    id: row.id,
    startDate: warsawDateOf(row.startsAt),
    startHour: warsawHourOf(row.startsAt),
    endDate: warsawDateOf(row.endsAt),
    endHour: warsawHourOf(row.endsAt),
    tableIds: row.tableIds,
    reason: row.reason
  };
}

/** Closures not over yet, soonest first; `clubOnly` leaves out single spots. */
export async function loadUpcomingClosures(
  db: Pick<Db, 'select'>,
  { clubOnly }: { clubOnly: boolean }
): Promise<ClosureRow[]> {
  return db
    .select()
    .from(closures)
    .where(and(gt(closures.endsAt, new Date()), clubOnly ? isNull(closures.tableIds) : undefined))
    .orderBy(asc(closures.startsAt));
}

/** Closures reaching into [from, to), for one day's grid. */
export async function loadClosuresBetween(
  db: Pick<Db, 'select'>,
  from: Date,
  to: Date
): Promise<ClosureRow[]> {
  return db
    .select()
    .from(closures)
    .where(and(lt(closures.startsAt, to), gt(closures.endsAt, from)));
}

/**
 * Confirmed bookings a closure of [startsAt, endsAt) on these spots (null:
 * all) would land on. Ones already over do not count: closing the rest of an
 * evening must not trip over the games played before it.
 */
export async function findClosureConflicts(
  db: Pick<Db, 'select'>,
  startsAt: Date,
  endsAt: Date,
  tableIds: number[] | null
): Promise<ClosureConflictDto[]> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      tableId: bookings.tableId,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        lt(bookings.startsAt, endsAt),
        gt(bookings.endsAt, startsAt),
        gt(bookings.endsAt, new Date()),
        tableIds === null ? undefined : inArray(bookings.tableId, tableIds)
      )
    )
    .orderBy(asc(bookings.startsAt), asc(bookings.tableId));
  return rows.map(row => ({
    bookingId: row.bookingId,
    tableId: row.tableId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString()
  }));
}

/**
 * The venue dates [startsAt, endsAt) touches, for the live-availability ping.
 * Capped: a closure is at most MAX_CLOSURE_DAYS long, and nobody watches a
 * grid further out than that.
 */
export function datesTouched(startsAt: Date, endsAt: Date): IsoDate[] {
  const last = warsawDateOf(new Date(endsAt.getTime() - 1));
  const dates: IsoDate[] = [];
  // From the day before: a closure in the small hours may fall on its late night
  for (let day = addDays(warsawDateOf(startsAt), -1); day <= last; day = addDays(day, 1)) {
    dates.push(day);
    if (dates.length > MAX_CLOSURE_DAYS + 1) break;
  }
  return dates;
}
