import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { formatPln } from '@repo/shared';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { intlTag } from '../../lib/format';
import { menuQuery } from '../../lib/queries';
import { MenuPicker } from '../MenuPicker';
import { Reveal } from '../motion';
import { QueryError } from '../QueryError';
import { goToStep, setItemQuantity, wizardStore } from '../../store/booking-wizard';

export function FoodStep() {
  const items = useStore(wizardStore, state => state.items);
  const { data: menu, isPending, isError, refetch } = useQuery(menuQuery(getLocale()));
  // Portal the fixed CTA bar to <body> so the wizard's per-step transform (which
  // otherwise becomes the containing block for position:fixed) can't shift it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isPending || !menu) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  const foodTotal = menu.reduce((sum, item) => sum + (items[item.id] ?? 0) * item.priceGrosz, 0);
  const hasItems = foodTotal > 0;

  const bottomBar = (
    <div className="fixed inset-x-0 bottom-0 bg-club-green/95 pb-6 pt-3 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-md px-6 md:max-w-2xl">
        {hasItems ? (
          <Button
            size="lg"
            className="h-[45px] w-full text-lg font-bold"
            onPress={() => goToStep('details')}
          >
            {m.btn_next()} · {formatPln(foodTotal, intlTag())}
          </Button>
        ) : (
          <Button
            size="lg"
            variant="outline"
            className="h-[45px] w-full border-golden text-lg font-semibold text-creme"
            onPress={() => goToStep('details')}
          >
            {m.btn_skip()}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <section className="pb-28">
      <h2 className="mb-1 text-xl font-semibold text-creme">{m.step_food_title()}</h2>
      <p className="mb-4 text-sm text-grey-cool">{m.food_skip_hint()}</p>

      <Reveal>
        <MenuPicker items={menu} quantities={items} onQuantityChange={setItemQuantity} />
      </Reveal>

      {mounted ? createPortal(bottomBar, document.body) : null}
    </section>
  );
}
