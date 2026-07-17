import { useState } from 'react';
import { Button, Modal, Spinner } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPln, type BookingDto } from '@repo/shared';
import { api } from '../../lib/api';
import { intlTag } from '../../lib/format';
import { bookingQuery, menuQuery } from '../../lib/queries';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { MenuPicker } from '../MenuPicker';
import { QueryError } from '../QueryError';
import { mutationErrorText } from './phase';

export function AddFoodModal({ booking }: { booking: BookingDto }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const { data: menu, isError, refetch } = useQuery(menuQuery(getLocale()));

  const total =
    menu?.reduce((sum, item) => sum + (quantities[item.id] ?? 0) * item.priceGrosz, 0) ?? 0;

  const addItems = useMutation({
    mutationFn: () =>
      api.addItems(
        booking.id,
        Object.entries(quantities).map(([foodItemId, quantity]) => ({
          foodItemId: Number(foodItemId),
          quantity
        }))
      ),
    onSuccess: updated => {
      queryClient.setQueryData(bookingQuery(booking.id).queryKey, updated);
      setQuantities({});
      setOpen(false);
    }
  });

  return (
    <Modal>
      <Button
        size="lg"
        variant="outline"
        className="h-11.25 w-full border-golden text-lg font-semibold text-creme"
        onPress={() => setOpen(true)}
      >
        {m.add_food()}
      </Button>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={setOpen}>
        <Modal.Container scroll="inside">
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{m.add_food()}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {isError ? (
                <QueryError onRetry={() => refetch()} />
              ) : menu ? (
                <MenuPicker
                  items={menu}
                  quantities={quantities}
                  onQuantityChange={(foodItemId, quantity) =>
                    setQuantities(current => {
                      const next = { ...current };
                      if (quantity <= 0) delete next[foodItemId];
                      else next[foodItemId] = quantity;
                      return next;
                    })
                  }
                />
              ) : (
                <div className="flex justify-center py-8">
                  <Spinner aria-label={m.loading()} />
                </div>
              )}
              {addItems.error ? (
                <p className="mt-2 text-sm text-danger-soft-foreground">
                  {mutationErrorText(addItems.error)}
                </p>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="w-full font-bold"
                isDisabled={total === 0}
                isPending={addItems.isPending}
                onPress={() => addItems.mutate()}
              >
                {m.btn_add()} · {formatPln(total, intlTag())}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
