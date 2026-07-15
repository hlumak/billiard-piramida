import type { Locale } from './locales.ts';
import type { IsoDate } from './schedule.ts';

export type BookingStatus = 'confirmed' | 'cancelled';

/** Derived from status + current time; never stored. */
export type BookingPhase = 'upcoming' | 'active' | 'finished' | 'cancelled';

export interface TableDto {
  id: number;
  label: string;
}

export interface SlotDto {
  /** Local Warsaw hour, e.g. 16 for 16:00 */
  hour: number;
  available: boolean;
}

export interface TableAvailabilityDto {
  tableId: TableDto['id'];
  slots: SlotDto[];
}

export interface AvailabilityDto {
  date: IsoDate;
  open: number;
  close: number;
  tables: TableAvailabilityDto[];
}

export interface MenuItemDto {
  id: number;
  slug: string;
  category: string;
  priceGrosz: number;
  name: string;
  description: string | null;
}

export interface OrderItemDto {
  id: string;
  foodItemId: MenuItemDto['id'];
  slug: MenuItemDto['slug'];
  quantity: number;
  unitPriceGrosz: number;
}

export interface BookingDto {
  id: string;
  tableId: TableDto['id'];
  customerName: string;
  customerPhone: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  phase: BookingPhase;
  items: OrderItemDto[];
  tableTotalGrosz: number;
  foodTotalGrosz: number;
  totalGrosz: number;
}

/** Derived from the DTOs (Pick, not re-declared) so drift breaks the build. */
export interface NewOrderItem extends Pick<OrderItemDto, 'foodItemId' | 'quantity'> {}

/** A customer aggregated from their bookings — there are no accounts, phone is the key. */
export interface AdminCustomerDto {
  phone: BookingDto['customerPhone'];
  /** Name from the most recent booking */
  name: BookingDto['customerName'];
  bookingsCount: number;
  cancelledCount: number;
  firstSeen: string;
  lastSeen: string;
  /** Table rental + food across confirmed bookings */
  totalSpentGrosz: number;
}

export interface AdminTopItemDto {
  foodItemId: MenuItemDto['id'];
  slug: MenuItemDto['slug'];
  totalQuantity: number;
}

export interface AdminStatsDto {
  date: IsoDate;
  todayBookings: number;
  activeNow: number;
  upcomingToday: number;
  todayRevenueGrosz: number;
  /** Rolling 7 days ending today (venue timezone) */
  weekRevenueGrosz: number;
  /** Most ordered food over the last 30 days */
  topItems: AdminTopItemDto[];
}

export interface CreateBookingInput {
  tableId: TableDto['id'];
  date: IsoDate;
  startHour: number;
  durationHours: number;
  customerName: BookingDto['customerName'];
  customerPhone: BookingDto['customerPhone'];
  items?: NewOrderItem[];
  locale?: Locale;
}
