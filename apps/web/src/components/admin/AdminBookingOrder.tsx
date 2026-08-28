import { useState } from 'react';
import { Button, Modal, Spinner } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MAX_ORDER_ITEM_QUANTITY, formatPln, type BookingDto } from '@repo/shared';
import { adminApi } from '../../lib/admin-api';
import { intlTag } from '../../lib/format';
import { menuQuery } from '../../lib/queries';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { MenuPicker } from '../MenuPicker';
import { QueryError } from '../QueryError';

/**
 * The food tab, staff side. Guests can only ever add to their order; the desk
 * also has to fix a quantity someone misheard over the phone and strike a line
 * that never left the kitchen, which is what the two extra controls here are.
 */
export function AdminBookingOrder({ booking }: { booking: BookingDto }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const {
    data: menu,
    isError,
    refetch
  } = useQuery({
    ...menuQuery(getLocale()),
    enabled: isOpen
  });

  const nameBySlug = new Map(menu?.map(item => [item.slug, item.name]));
  const pending =
    menu?.reduce((sum, item) => sum + (quantities[item.id] ?? 0) * item.priceGrosz, 0) ?? 0;

  // Every write returns the whole booking, so the lists refresh from one payload
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  const addItems = useMutation({
    mutationFn: () =>
      adminApi.addBookingItems(
        booking.id,
        Object.entries(quantities).flatMap(([foodItemId, quantity]) =>
          quantity > 0 ? [{ foodItemId: Number(foodItemId), quantity }] : []
        )
      ),
    onSuccess: () => {
      setQuantities({});
      invalidate();
    }
  });

  const setQuantity = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      adminApi.setBookingItemQuantity(booking.id, itemId, quantity),
    onSuccess: invalidate
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => adminApi.removeBookingItem(booking.id, itemId),
    onSuccess: invalidate
  });

  const busy = addItems.isPending || setQuantity.isPending || removeItem.isPending;
  const failed = addItems.isError || setQuantity.isError || removeItem.isError;

  return (
    <Modal>
      <Button
        size="sm"
        variant="outline"
        className="border-golden text-creme"
        onPress={() => setOpen(true)}
      >
        {m.admin_order_btn()}
      </Button>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={setOpen}>
        <Modal.Container scroll="inside">
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{m.admin_order_title()}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                {booking.items.length === 0 ? (
                  <p className="text-sm text-grey-cool">{m.admin_order_empty()}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {booking.items.map(item => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-2 rounded-[10px] bg-club-green p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-creme">
                            {nameBySlug.get(item.slug) ?? item.slug}
                          </p>
                          {/* The locked unit price, not today's menu price */}
                          <p className="text-xs text-grey-cool">
                            {formatPln(item.unitPriceGrosz, intlTag())} ×{item.quantity} ={' '}
                            {formatPln(item.unitPriceGrosz * item.quantity, intlTag())}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="−"
                            isDisabled={busy || item.quantity <= 1}
                            onPress={() =>
                              setQuantity.mutate({ itemId: item.id, quantity: item.quantity - 1 })
                            }
                          >
                            −
                          </Button>
                          <span className="min-w-6 text-center text-sm text-creme">
                            {item.quantity}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="+"
                            isDisabled={busy || item.quantity >= MAX_ORDER_ITEM_QUANTITY}
                            onPress={() =>
                              setQuantity.mutate({ itemId: item.id, quantity: item.quantity + 1 })
                            }
                          >
                            +
                          </Button>
                          <Button
                            size="sm"
                            variant="danger-soft"
                            isDisabled={busy}
                            onPress={() => removeItem.mutate(item.id)}
                          >
                            {m.btn_remove()}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex justify-between border-t border-deep-cream/20 pt-3 font-bold text-golden">
                  <span>{m.total()}</span>
                  <span>{formatPln(booking.totalGrosz, intlTag())}</span>
                </div>

                <p className="text-sm font-semibold text-golden">{m.admin_order_add()}</p>
                {isError ? (
                  <QueryError onRetry={() => refetch()} />
                ) : !menu ? (
                  <div className="flex justify-center py-6">
                    <Spinner aria-label={m.loading()} />
                  </div>
                ) : (
                  <MenuPicker
                    items={menu}
                    quantities={quantities}
                    onQuantityChange={(foodItemId, quantity) =>
                      setQuantities(current => ({ ...current, [foodItemId]: quantity }))
                    }
                  />
                )}

                {failed ? (
                  <p className="text-sm text-danger-soft-foreground">{m.err_generic()}</p>
                ) : null}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="w-full font-bold"
                isDisabled={pending === 0}
                isPending={addItems.isPending}
                onPress={() => addItems.mutate()}
              >
                {m.btn_add()} · {formatPln(pending, intlTag())}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
