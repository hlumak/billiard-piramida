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

/** Map booking-mutation failures to localized copy. */
export function mutationErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'slot_taken') return m.err_slot_taken();
    if (error.code === 'past_closing_time') return m.err_past_closing();
  }
  return m.err_generic();
}
