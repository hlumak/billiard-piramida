import { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookingDto } from '@repo/shared';
import { api } from '../../lib/api';
import { bookingQuery } from '../../lib/queries';
import { m } from '../../paraglide/messages.js';
import { mutationErrorText } from './phase';

export function ExtendModal({ booking, maxExtend }: { booking: BookingDto; maxExtend: number }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [hours, setHours] = useState(1);

  // Clamp against the current remaining window: after a prior extend, maxExtend
  // shrinks, and a stale `hours` would otherwise submit more than fits and 422.
  const effectiveHours = Math.min(hours, maxExtend);

  const extend = useMutation({
    mutationFn: () => api.extendBooking(booking.id, effectiveHours),
    onSuccess: updated => {
      queryClient.setQueryData(bookingQuery(booking.id).queryKey, updated);
      setOpen(false);
    }
  });

  return (
    <Modal>
      <Button
        size="lg"
        className="h-11.25 w-full text-lg font-bold"
        onPress={() => {
          setHours(1);
          extend.reset();
          setOpen(true);
        }}
      >
        {m.extend()}
      </Button>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={setOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-90">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{m.extend_by()}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: maxExtend }, (_, i) => i + 1).map(count => (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={effectiveHours === count}
                    onClick={() => setHours(count)}
                    className={`h-10 min-w-16 rounded-[10px] px-3 font-semibold transition-colors ${
                      effectiveHours === count
                        ? 'bg-golden text-btn-text'
                        : 'bg-club-green text-creme hover:bg-surface-hover'
                    }`}
                  >
                    {m.hours_n({ n: count })}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-grey-cool">{m.err_past_closing()}</p>
              {extend.error ? (
                <p className="mt-2 text-sm text-danger-soft-foreground">
                  {mutationErrorText(extend.error)}
                </p>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="w-full font-bold"
                isPending={extend.isPending}
                onPress={() => extend.mutate()}
              >
                {m.extend()} · {m.hours_n({ n: effectiveHours })}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
