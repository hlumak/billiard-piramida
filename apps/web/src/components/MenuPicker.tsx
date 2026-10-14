import { useRef } from 'react';
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
    <div className="@container flex flex-col gap-7">
      {groupMenu(items).map(({ category, items: categoryItems }) => (
        <section key={category}>
          <h3 className="text-[13px] font-bold tracking-[0.18em] text-golden-light uppercase">
            {categoryLabel(category)}
          </h3>
          <ul className="mt-3 grid grid-cols-1 gap-3 @xl:grid-cols-2">
            {categoryItems.map(item => {
              const quantity = quantities[item.id] ?? 0;
              return (
                <li
                  key={item.id}
                  className={`anim-stagger-item flex items-center gap-3.5 rounded-2xl border bg-card p-4 transition-colors md:p-4.5 ${
                    quantity > 0 ? 'border-golden/60' : 'border-line'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.name}</p>
                    {item.description ? (
                      <p className="mt-0.5 truncate text-[13px] text-grey-cool">
                        {item.description}
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-[15px] font-bold text-golden-light">
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
    <div className="flex flex-none items-center gap-2.5">
      {quantity > 0 ? (
        <>
          <button
            type="button"
            aria-label={`${m.btn_remove()}: ${name}`}
            className="btn-outline size-10.5 rounded-xl p-0"
            onClick={() => {
              onChange(quantity - 1);
              if (quantity === 1) addRef.current?.focus();
            }}
          >
            <Minus aria-hidden className="size-4.5" />
          </button>
          <output
            aria-live="polite"
            className="min-w-4.5 text-center text-lg font-bold tabular-nums"
          >
            {quantity}
          </output>
        </>
      ) : null}
      <button
        ref={addRef}
        type="button"
        aria-label={`${m.btn_add()}: ${name}`}
        disabled={quantity >= MAX_ORDER_ITEM_QUANTITY}
        onClick={() => onChange(Math.min(quantity + 1, MAX_ORDER_ITEM_QUANTITY))}
        className={
          quantity > 0
            ? 'btn-gold size-10.5 rounded-xl p-0'
            : 'btn-outline h-10.5 gap-1.5 rounded-xl border-golden px-4 text-sm font-bold text-golden-light hover:border-golden'
        }
      >
        <Plus aria-hidden className="size-4" strokeWidth={2.6} />
        {quantity === 0 ? m.btn_add() : null}
      </button>
    </div>
  );
}
