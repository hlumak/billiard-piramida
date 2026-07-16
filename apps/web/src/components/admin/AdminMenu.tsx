import { useState } from 'react';
import { Button, Input, Spinner } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPln, type AdminMenuItemDto } from '@repo/shared';
import { adminApi, adminMenuQuery } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { intlTag } from '../../lib/format';
import { categoryLabel } from '../../lib/menu';
import { m } from '../../paraglide/messages.js';
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

  const parsedPrice = Math.round(Number(price.replace(',', '.')) * 100);
  const priceChanged =
    Number.isFinite(parsedPrice) && parsedPrice >= 0 && parsedPrice !== item.priceGrosz;
  const deleteBlocked = remove.error instanceof ApiError && remove.error.code === 'has_orders';

  return (
    <li
      className={`rounded-[10px] bg-club-green-light p-3 ${item.isAvailable ? '' : 'opacity-60'}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-creme">{item.name}</p>
          <p className="text-xs text-grey-cool">
            {categoryLabel(item.category)} · {formatPln(item.priceGrosz, intlTag())}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={m.admin_price_label()}
            value={price}
            onChange={event => setPrice(event.target.value)}
            inputMode="decimal"
            className="w-20"
          />
          {priceChanged ? (
            <Button
              size="sm"
              isPending={update.isPending}
              onPress={() => update.mutate({ priceGrosz: parsedPrice })}
            >
              {m.btn_save()}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={item.isAvailable ? 'outline' : 'primary'}
            className={item.isAvailable ? 'border-golden text-creme' : ''}
            isPending={update.isPending}
            onPress={() => update.mutate({ isAvailable: !item.isAvailable })}
          >
            {item.isAvailable ? m.admin_in_menu() : m.admin_hidden()}
          </Button>
          <AdminDishModal item={item} />
          <Button
            size="sm"
            variant="danger-soft"
            isPending={remove.isPending}
            onPress={() => {
              if (window.confirm(m.admin_delete_confirm())) remove.mutate();
            }}
          >
            {m.admin_delete_btn()}
          </Button>
        </div>
      </div>
      {deleteBlocked ? (
        <p className="mt-2 text-xs text-danger-soft-foreground">{m.admin_has_orders()}</p>
      ) : null}
    </li>
  );
}

export function AdminMenu() {
  const { data: items, isPending, isError, refetch } = useQuery(adminMenuQuery());

  if (isError) return <QueryError onRetry={() => refetch()} />;
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
            <StaggerItem key={item.id}>
              {/* Remount the row when the server price changes so its input re-seeds */}
              <MenuRow key={item.priceGrosz} item={item} />
            </StaggerItem>
          ))}
        </ul>
      </StaggerGroup>
    </div>
  );
}
