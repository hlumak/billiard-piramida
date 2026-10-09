import type { BookingPhase } from '@repo/shared';
import { ApiError } from '../../lib/api';
import { m } from '../../paraglide/messages.js';

export const PHASE_LABELS: Record<BookingPhase, () => string> = {
  upcoming: m.phase_upcoming,
  active: m.phase_active,
  finished: m.phase_finished,
  cancelled: m.phase_cancelled
};

export const PHASE_STYLES: Record<BookingPhase, string> = {
  upcoming: 'bg-golden/15 text-golden',
  active: 'bg-golden text-btn-text',
  finished: 'bg-deep-cream/20 text-deep-cream',
  cancelled: 'bg-danger-soft text-danger-soft-foreground'
};

/** Booking API error codes → localized copy; anything unknown is generic. */
const BOOKING_ERRORS: Record<string, () => string> = {
  slot_taken: m.err_slot_taken,
  past_closing_time: m.err_past_closing,
  start_in_past: m.err_slot_expired,
  outside_operating_hours: m.err_outside_hours,
  unknown_food_item: m.err_food_unavailable,
  booking_too_long: m.err_booking_too_long,
  booking_finished: m.err_booking_changed,
  booking_cancelled: m.err_booking_changed,
  only_upcoming_can_be_cancelled: m.err_booking_changed,
  invalid_phone: m.err_phone_invalid,
  invalid_name: m.err_name_required,
  rate_limited: m.err_rate_limited
};

/** Map booking-mutation failures to localized copy. */
export function mutationErrorText(error: unknown): string {
  const text = error instanceof ApiError ? BOOKING_ERRORS[error.code] : undefined;
  return text ? text() : m.err_generic();
}

/** The booking changed under the guest (finished, cancelled elsewhere): refetch it. */
export function isStaleBookingError(error: unknown): boolean {
  return error instanceof ApiError && BOOKING_ERRORS[error.code] === m.err_booking_changed;
}
