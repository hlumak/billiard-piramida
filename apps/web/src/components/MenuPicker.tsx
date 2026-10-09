import { useRef } from 'react';
import { Button } from '@heroui/react';
import { Minus, Plus } from 'lucide-react';
import { formatPln, MAX_ORDER_ITEM_QUANTITY, type MenuItemDto } from '@repo/shared';
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
                    <p className="mt-0.5 text-sm font-semibold text-golden-light">
                      {formatPln(item.priceGrosz, intlTag())}
                    </p>
                  </div>
                  <QuantityStepper
                    name={item.name}
                    quantity={quantity}
                    onChange={next => onQuantityChange(item.id, next)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * "Add" and the "+" of the −/qty/+ stepper are one and the same button, so
 * pressing Add never unmounts the control that has focus (keyboard and
 * screen-reader users used to land on <body>). Taking the quantity back to 0
 * removes "−", so focus moves to "+"; the count is announced as it changes.
 */
function QuantityStepper({
  name,
  quantity,
  onChange
}: {
  name: string;
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  const addRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex items-center gap-2">
      {quantity > 0 ? (
        <>
          <Button
            isIconOnly
            size="sm"
            variant="outline"
            aria-label={`${m.btn_remove()}: ${name}`}
            className="border-golden text-golden-light"
            onPress={() => {
              onChange(quantity - 1);
              if (quantity === 1) addRef.current?.focus();
            }}
          >
            <Minus className="size-4" />
          </Button>
          <output aria-live="polite" className="w-5 text-center font-semibold text-creme">
            {quantity}
          </output>
        </>
      ) : null}
      <Button
        ref={addRef}
        isIconOnly={quantity > 0}
        size="sm"
        variant="outline"
        aria-label={`${m.btn_add()}: ${name}`}
        className="border-golden text-golden-light"
        isDisabled={quantity >= MAX_ORDER_ITEM_QUANTITY}
        onPress={() => onChange(Math.min(quantity + 1, MAX_ORDER_ITEM_QUANTITY))}
      >
        <Plus className="size-4" />
        {quantity === 0 ? m.btn_add() : null}
      </Button>
    </div>
  );
}
