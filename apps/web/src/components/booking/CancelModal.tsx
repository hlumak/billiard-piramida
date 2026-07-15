import { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookingDto } from '@repo/shared';
import { api } from '../../lib/api';
import { bookingQuery } from '../../lib/queries';
import { m } from '../../paraglide/messages.js';
import { mutationErrorText } from './phase';

export function CancelModal({ booking }: { booking: BookingDto }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);

  const cancel = useMutation({
    mutationFn: () => api.cancelBooking(booking.id),
    onSuccess: updated => {
      queryClient.setQueryData(bookingQuery(booking.id).queryKey, updated);
      setOpen(false);
    }
  });

  return (
    <Modal>
      <Button variant="danger-soft" className="w-full" onPress={() => setOpen(true)}>
        {m.cancel_booking()}
      </Button>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={setOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[360px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{m.cancel_confirm_title()}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p>{m.cancel_confirm_text()}</p>
              {cancel.error ? (
                <p className="mt-2 text-sm text-danger-soft-foreground">
                  {mutationErrorText(cancel.error)}
                </p>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" slot="close">
                {m.keep_booking()}
              </Button>
              <Button variant="danger" isPending={cancel.isPending} onPress={() => cancel.mutate()}>
                {m.confirm_cancel()}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
