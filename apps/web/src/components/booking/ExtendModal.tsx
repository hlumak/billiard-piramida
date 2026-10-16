import { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EXTEND_STEP_MINUTES, type BookingDto } from '@repo/shared';
import { api } from '../../lib/api';
import { bookingMinutes, formatClock } from '../../lib/format';
import { bookingQuery } from '../../lib/queries';
import { m } from '../../paraglide/messages.js';
import { isStaleBookingError, mutationErrorText } from './phase';

/**
 * Half an hour more per confirmation — the one step the club sells. After it
 * the button is back on the booking page, so the guest extends again while
 * the table stays free (the API refuses the half hour once it is taken).
 */
export function ExtendModal({ booking }: { booking: BookingDto }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const newEnd = formatClock(bookingMinutes(booking).end + EXTEND_STEP_MINUTES);

  const extend = useMutation({
    mutationFn: () => api.extendBooking(booking.id),
    onSuccess: updated => {
      queryClient.setQueryData(bookingQuery(booking.id).queryKey, updated);
      setOpen(false);
    },
    // The booking moved on (finished, cancelled elsewhere): show its real state
    onError: error => {
      if (isStaleBookingError(error)) {
        void queryClient.invalidateQueries({ queryKey: bookingQuery(booking.id).queryKey });
      }
    }
  });

  return (
    <Modal isOpen={isOpen} onOpenChange={setOpen}>
      <Button
        className="btn-gold h-12.5 w-full px-4 text-[15px]"
        onPress={() => {
          extend.reset();
          setOpen(true);
        }}
      >
        {m.extend()}
      </Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-90">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{m.extend_title()}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-[15px] text-cream-soft">{m.extend_until({ time: newEnd })}</p>
              <p className="mt-2 text-xs text-grey-cool">{m.err_past_closing()}</p>
              {extend.error ? (
                <p className="mt-2 text-sm text-danger-soft-foreground">
                  {mutationErrorText(extend.error)}
                </p>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="btn-gold h-12.5 w-full text-[15px]"
                isPending={extend.isPending}
                onPress={() => extend.mutate()}
              >
                {m.extend()} · {m.extend_30m()}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
