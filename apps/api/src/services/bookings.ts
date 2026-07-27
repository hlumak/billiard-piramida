import assert from 'node:assert';
import type { BookingDto, BookingPhase, BookingStatus, NewOrderItem } from '@repo/shared';
import { spotPriceGrosz } from '@repo/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { bookings, foodItems, orderItems, tables } from '../db/schema.ts';
import { HOUR_MS } from '../lib/time.ts';

export function phaseOf(
  status: BookingStatus,
  startsAt: Date,
  endsAt: Date,
  now: Date
): BookingPhase {
  if (status === 'cancelled') return 'cancelled';
  if (now < startsAt) return 'upcoming';
  if (now < endsAt) return 'active';
  return 'finished';
}

/** For handlers that just verified/created the booking — null is impossible. */
export async function mustLoadBookingDto(db: Db, id: string): Promise<BookingDto> {
  const dto = await loadBookingDto(db, id);
  if (!dto) throw new Error(`booking ${id} vanished mid-request`);
  return dto;
}

/** The spot a booking sits on — its kind picks the hourly rate. */
type Spot = Pick<typeof tables.$inferSelect, 'id' | 'label' | 'kind'>;

function composeDto(
  booking: typeof bookings.$inferSelect,
  spot: Spot,
  items: BookingDto['items'],
  now: Date
): BookingDto {
  const durationHours = Math.round(
    (booking.endsAt.getTime() - booking.startsAt.getTime()) / HOUR_MS
  );
  const tableTotalGrosz = spotPriceGrosz(spot.kind, durationHours);
  const foodTotalGrosz = items.reduce((sum, i) => sum + i.quantity * i.unitPriceGrosz, 0);
  return {
    id: booking.id,
    tableId: booking.tableId,
    kind: spot.kind,
    tableLabel: spot.label,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    status: booking.status,
    phase: phaseOf(booking.status, booking.startsAt, booking.endsAt, now),
    items,
    tableTotalGrosz,
    foodTotalGrosz,
    sportCardCount: booking.sportCardCount,
    discountGrosz: booking.discountGrosz,
    totalGrosz: tableTotalGrosz + foodTotalGrosz - booking.discountGrosz
  };
}

/** Compose BookingDto[] for many rows with a single order-items query (no N+1). */
export async function toBookingDtos(
  db: Db,
  rows: (typeof bookings.$inferSelect)[]
): Promise<BookingDto[]> {
  const ids = rows.map(b => b.id);
  if (ids.length === 0) return [];

  // Spot table is tiny (single digits) — one unfiltered read beats a join per row
  const [items, spots] = await Promise.all([
    db
      .select({
        id: orderItems.id,
        bookingId: orderItems.bookingId,
        foodItemId: orderItems.foodItemId,
        slug: foodItems.slug,
        quantity: orderItems.quantity,
        unitPriceGrosz: orderItems.unitPriceGrosz
      })
      .from(orderItems)
      .innerJoin(foodItems, eq(orderItems.foodItemId, foodItems.id))
      .where(inArray(orderItems.bookingId, ids)),
    db.select({ id: tables.id, label: tables.label, kind: tables.kind }).from(tables)
  ]);

  const spotById = new Map(spots.map(s => [s.id, s]));
  const now = new Date();
  return rows.map(booking => {
    const bookingItems = items
      .filter(item => item.bookingId === booking.id)
      .map(({ bookingId: _bookingId, ...item }) => item);
    const spot = spotById.get(booking.tableId);
    assert(spot, `booking ${booking.id} references missing spot ${booking.tableId}`);
    return composeDto(booking, spot, bookingItems, now);
  });
}

export async function loadBookingDto(db: Db, id: string): Promise<BookingDto | null> {
  const [row] = await db
    .select({
      booking: bookings,
      spot: { id: tables.id, label: tables.label, kind: tables.kind }
    })
    .from(bookings)
    .innerJoin(tables, eq(bookings.tableId, tables.id))
    .where(eq(bookings.id, id));
  if (!row) return null;

  const items = await db
    .select({
      id: orderItems.id,
      foodItemId: orderItems.foodItemId,
      slug: foodItems.slug,
      quantity: orderItems.quantity,
      unitPriceGrosz: orderItems.unitPriceGrosz
    })
    .from(orderItems)
    .innerJoin(foodItems, eq(orderItems.foodItemId, foodItems.id))
    .where(eq(orderItems.bookingId, id));

  return composeDto(row.booking, row.spot, items, new Date());
}

/** Validates food ids and inserts order rows; returns an error code or null. */
export async function insertOrderItems(
  tx: Pick<Db, 'select' | 'insert'>,
  bookingId: string,
  items: NewOrderItem[]
): Promise<'unknown_food_item' | null> {
  if (items.length === 0) return null;
  const ids = [...new Set(items.map(i => i.foodItemId))];
  // Only available dishes are orderable — a hidden item's id must not slip
  // through, so unavailable ids fall out here and hit the unknown_food_item path.
  const found = await tx
    .select({ id: foodItems.id, priceGrosz: foodItems.priceGrosz })
    .from(foodItems)
    .where(and(inArray(foodItems.id, ids), eq(foodItems.isAvailable, true)));
  const priceById = new Map(found.map(f => [f.id, f.priceGrosz]));
  if (ids.some(id => !priceById.has(id))) return 'unknown_food_item';

  await tx.insert(orderItems).values(
    items.map(i => {
      const unitPriceGrosz = priceById.get(i.foodItemId);
      assert(unitPriceGrosz !== undefined);
      return {
        bookingId,
        foodItemId: i.foodItemId,
        quantity: i.quantity,
        unitPriceGrosz
      };
    })
  );
  return null;
}
