import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { menuQuery } from '../../lib/queries';
import { MenuPicker } from '../MenuPicker';
import { QueryError } from '../QueryError';
import { goToStep, setItemQuantity, wizardStore } from '../../store/booking-wizard';
import { StepActions } from './WizardFrame';

/** Step 3, the bar: optional, and the summary adds each line as it is picked. */
export function FoodStep() {
  const items = useStore(wizardStore, state => state.items);
  const { data: menu, isPending, isError, error, refetch } = useQuery(menuQuery(getLocale()));

  return (
    <div>
      <h2 className="text-2xl font-bold md:text-[26px]">{m.step_food_title()}</h2>
      <p className="mt-1 text-sm text-grey-cool md:mt-1.5 md:text-[15px]">{m.food_skip_hint()}</p>

      <div className="mt-6 md:mt-7">
        {isError && !menu ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : isPending || !menu ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : (
          <MenuPicker items={menu} quantities={items} onQuantityChange={setItemQuantity} />
        )}
      </div>

      <StepActions
        action={{
          label: m.next_to_contacts(),
          short: m.btn_next(),
          onPress: () => goToStep('details')
        }}
        note={m.bar_later_note()}
      />
    </div>
  );
}
