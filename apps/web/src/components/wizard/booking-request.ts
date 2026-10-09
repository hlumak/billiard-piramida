import type {
  ActivityKind,
  BilliardGame,
  CreateBookingInput,
  IsoDate,
  MenuItemDto
} from '@repo/shared';
import { ApiError } from '../../lib/api';

/** All picks made in earlier steps — non-null by construction (see book.tsx). */
export interface BookingDraft {
  date: IsoDate;
  startHour: number;
  durationHours: number;
  tableId: number;
  kind: ActivityKind;
  tableLabel: string;
  /** Null on a dartboard — nothing to rack, nothing to ask */
  game: BilliardGame | null;
}

export interface OrderLine {
  item: MenuItemDto;
  quantity: number;
}

/**
 * The picked quantities as priced lines. A dish that has left the menu since
 * it was picked has no line — it drops out of the total and of the request
 * alike, rather than failing the whole booking with unknown_food_item.
 */
export function orderLinesFrom(
  quantities: Record<number, number>,
  menu: readonly MenuItemDto[] | undefined
): OrderLine[] {
  return Object.entries(quantities).flatMap(([foodItemId, quantity]) => {
    const item = menu?.find(entry => entry.id === Number(foodItemId));
    return item ? [{ item, quantity }] : [];
  });
}

/** Exactly what the guest sees and pays for, as the API takes it. */
export function bookingRequestFrom(
  draft: BookingDraft,
  contact: { customerName: string; customerPhone: string },
  sportCardCount: number,
  orderLines: readonly OrderLine[]
): CreateBookingInput {
  const { game, kind: _kind, tableLabel: _tableLabel, ...picks } = draft;
  return {
    ...picks,
    // Omitted rather than sent as null: on a dartboard the API refuses the key
    // outright, and omitting it is also what "no preference" means
    ...(game === null ? {} : { game }),
    customerName: contact.customerName.trim(),
    customerPhone: contact.customerPhone.trim(),
    sportCardCount,
    items: orderLines.map(line => ({ foodItemId: line.item.id, quantity: line.quantity }))
  };
}

/** Refusals the guest can only fix by going back to the time step and re-picking. */
const NEEDS_NEW_TIME = new Set(['slot_taken', 'start_in_past', 'outside_operating_hours']);

export function needsNewTime(error: unknown): boolean {
  return error instanceof ApiError && NEEDS_NEW_TIME.has(error.code);
}
