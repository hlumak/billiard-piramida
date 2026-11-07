import { useState } from 'react';
import { Button, Input, Spinner } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminMenuItemDto } from '@repo/shared';
import { adminApi, adminMenuQuery } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { intlTag } from '../../lib/format';
import { categoryLabel } from '../../lib/menu';
import { parseZloty, plnUnit } from '../../lib/money';
import { m } from '../../paraglide/messages.js';
import { AdminSwitch } from './AdminSwitch';
import { getLocale } from '../../paraglide/runtime.js';
import { ConfirmAction } from './ConfirmAction';
import { QueryError } from '../QueryError';
import { StaggerGroup, StaggerItem } from '../motion';
import { AdminDishModal } from './AdminDishModal';

function MenuRow({ item }: { item: AdminMenuItemDto }) {
  const queryClient = useQueryClient();
  // Seeded from the server price; the parent remounts this row (via key) when
  // the server price changes, so the input never shows a stale value.
  const [price, setPrice] = useState(String(item.priceGrosz / 100));
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] });
    queryClient.invalidateQueries({ queryKey: ['menu'] });
  };

  const update = useMutation({
    mutationFn: (patch: { isAvailable?: boolean; priceGrosz?: number }) =>
      adminApi.updateMenuItem(item.id, patch),
    onSuccess: invalidate
  });

  const remove = useMutation({
    mutationFn: () => adminApi.deleteMenuItem(item.id),
    onSuccess: invalidate
  });

  const parsedPrice = parseZloty(price);
  const priceChanged = parsedPrice !== null && parsedPrice !== item.priceGrosz;
  const deleteBlocked = remove.error instanceof ApiError && remove.error.code === 'has_orders';

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className={`min-w-0 flex-1 ${item.isAvailable ? '' : 'opacity-60'}`}>
          {/* The name in the panel's language; the API's own pick is Ukrainian */}
          <p className="font-medium text-creme">
            {item.translations.find(t => t.locale === getLocale())?.name ?? item.name}
          </p>
          <p className="text-xs text-grey-cool">
            {categoryLabel(item.category)}
            {item.isAvailable ? null : <> · {m.admin_hidden()}</>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* A bare number beside the row's buttons read as a count: the
              unit inside the field says it is the price */}
          <div className="relative w-28">
            <Input
              aria-label={m.admin_price_label()}
              aria-invalid={parsedPrice === null}
              value={price}
              onChange={event => setPrice(event.target.value)}
              inputMode="decimal"
              className="w-full pr-12 tabular-nums"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-grey-cool"
            >
              {plnUnit(intlTag())}
            </span>
          </div>
          {priceChanged ? (
            <Button
              size="sm"
              isPending={update.isPending}
              onPress={() => {
                if (parsedPrice !== null) update.mutate({ priceGrosz: parsedPrice });
              }}
            >
              {m.btn_save()}
            </Button>
          ) : null}
          {/* A switch, not a button labelled with the current state: staff
              could not tell whether pressing "In menu" would hide the dish */}
          <AdminSwitch
            isSelected={item.isAvailable}
            isDisabled={update.isPending}
            onChange={isAvailable => update.mutate({ isAvailable })}
            className="px-1"
          >
            {m.admin_in_menu()}
          </AdminSwitch>
          <AdminDishModal item={item} />
          <ConfirmAction
            title={m.admin_delete_confirm()}
            confirmLabel={m.admin_delete_dish_action()}
            onConfirm={() => remove.mutate()}
          >
            {open => (
              <Button size="sm" variant="danger-soft" isPending={remove.isPending} onPress={open}>
                {m.admin_delete_btn()}
              </Button>
            )}
          </ConfirmAction>
        </div>
      </div>
      {deleteBlocked ? (
        <p role="alert" className="mt-2 text-sm text-danger-soft-foreground">
          {m.admin_has_orders()}
        </p>
      ) : update.isError || remove.isError ? (
        <p role="alert" className="mt-2 text-sm text-danger-soft-foreground">
          {m.err_generic()}
        </p>
      ) : null}
    </div>
  );
}

export function AdminMenu() {
  const { data: items, isPending, isError, error, refetch } = useQuery(adminMenuQuery());

  if (isError && !items) return <QueryError error={error} onRetry={() => refetch()} />;
  if (isPending || !items) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <AdminDishModal item={null} />
      </div>
      <StaggerGroup>
        <ul className="flex flex-col gap-2">
          {items.map(item => (
            <StaggerItem key={item.id} as="li">
              {/* Remount the row when the server price changes so its input re-seeds */}
              <MenuRow key={item.priceGrosz} item={item} />
            </StaggerItem>
          ))}
        </ul>
      </StaggerGroup>
    </div>
  );
}
