import assert from 'node:assert';
import type { BookingDto, BookingPhase, BookingStatus, NewOrderItem } from '@repo/shared';
import { HOURLY_RATE_GROSZ } from '@repo/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { bookings, foodItems, orderItems } from '../db/schema.ts';
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

export async function loadBookingDto(db: Db, id: string): Promise<BookingDto | null> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!booking) return null;

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

  const durationHours = Math.round(
    (booking.endsAt.getTime() - booking.startsAt.getTime()) / HOUR_MS
  );
  const tableTotalGrosz = durationHours * HOURLY_RATE_GROSZ;
  const foodTotalGrosz = items.reduce((sum, i) => sum + i.quantity * i.unitPriceGrosz, 0);

  return {
    id: booking.id,
    tableId: booking.tableId,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    status: booking.status,
    phase: phaseOf(booking.status, booking.startsAt, booking.endsAt, new Date()),
    items,
    tableTotalGrosz,
    foodTotalGrosz,
    discountGrosz: booking.discountGrosz,
    totalGrosz: tableTotalGrosz + foodTotalGrosz - booking.discountGrosz
  };
}

/** Validates food ids and inserts order rows; returns an error code or null. */
export async function insertOrderItems(
  tx: Pick<Db, 'select' | 'insert'>,
  bookingId: string,
  items: NewOrderItem[]
): Promise<'unknown_food_item' | null> {
  if (items.length === 0) return null;
  const ids = [...new Set(items.map(i => i.foodItemId))];
  const found = await tx
    .select({ id: foodItems.id, priceGrosz: foodItems.priceGrosz })
    .from(foodItems)
    .where(inArray(foodItems.id, ids));
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
