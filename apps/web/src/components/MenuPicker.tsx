import { Button } from '@heroui/react';
import { Minus, Plus } from 'lucide-react';
import { formatPln, type MenuItemDto } from '@repo/shared';
import { intlTag } from '../lib/format';
import { categoryLabel, groupMenu } from '../lib/menu';
import { m } from '../paraglide/messages.js';

export function MenuPicker({
  items,
  quantities,
  onQuantityChange
}: {
  items: MenuItemDto[];
  quantities: Record<number, number>;
  onQuantityChange: (foodItemId: number, quantity: number) => void;
}) {
  return (
    <div className="@container flex flex-col gap-6">
      {groupMenu(items).map(({ category, items: categoryItems }) => (
        <section key={category}>
          <h3 className="mb-2 text-lg font-semibold text-golden">{categoryLabel(category)}</h3>
          <ul className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
            {categoryItems.map(item => {
              const quantity = quantities[item.id] ?? 0;
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-[10px] bg-club-green-light p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-creme">{item.name}</p>
                    {item.description ? (
                      <p className="truncate text-xs text-grey-cool">{item.description}</p>
                    ) : null}
                    <p className="mt-0.5 text-sm font-semibold text-golden">
                      {formatPln(item.priceGrosz, intlTag())}
                    </p>
                  </div>
                  {quantity === 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-golden text-golden"
                      aria-label={`${m.btn_add()}: ${item.name}`}
                      onPress={() => onQuantityChange(item.id, 1)}
                    >
                      <Plus className="size-4" />
                      {m.btn_add()}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="outline"
                        aria-label={`${m.btn_remove()}: ${item.name}`}
                        className="border-golden text-golden"
                        onPress={() => onQuantityChange(item.id, quantity - 1)}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-5 text-center font-semibold text-creme">{quantity}</span>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="outline"
                        aria-label={`${m.btn_add()}: ${item.name}`}
                        className="border-golden text-golden"
                        onPress={() => onQuantityChange(item.id, quantity + 1)}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
