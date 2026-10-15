import { Description, FieldError, Input, Label, TextField } from '@heroui/react';
import { useForm } from '@tanstack/react-form';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { CircleUserRound } from 'lucide-react';
import { MAX_SPORT_CARDS_PER_BOOKING } from '@repo/shared';
import { isValidPhone } from '@repo/shared/phone';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { ApiError, api } from '../../lib/api';
import { profileQuery } from '../../lib/auth';
import { isFullName } from '../../lib/names';
import { availabilityQuery, bookingQuery, menuQuery, venueConfigQuery } from '../../lib/queries';
import { rememberBooking } from '../../lib/recent-bookings';
import { useSubmitOnce } from '../../lib/use-submit-once';
import { BotCheckWidget, useBotCheck } from '../../lib/bot-check';
import { PhoneField } from '../PhoneField';
import { mutationErrorText } from '../booking/phase';
import { goToStep, resetWizard, setSportCardCount, wizardStore } from '../../store/booking-wizard';
import {
  bookingRequestFrom,
  needsNewTime,
  orderLinesFrom,
  type BookingDraft
} from './booking-request';
import { SportCardPicker } from './SportCardPicker';
import { StepActions } from './WizardFrame';
import { WizardSummary } from './WizardSummary';

const FORM_ID = 'booking-details';

/** Step 4: who is coming. The confirm button lives with the summary, outside the form. */
export function DetailsStep({ draft }: { draft: BookingDraft }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const items = useStore(wizardStore, state => state.items);
  const sportCardCount = useStore(wizardStore, state => state.sportCardCount);
  const { data: menu } = useQuery(menuQuery(getLocale()));
  const { data: profile } = useQuery(profileQuery());

  const orderLines = orderLinesFrom(items, menu);
  const once = useSubmitOnce();
  const botCheck = useBotCheck('booking');

  const createBooking = useMutation({
    mutationFn: async (input: Parameters<typeof api.createBooking>[0]) =>
      api.createBooking(input, await botCheck.token()),
    onSuccess: async ({ manageToken, ...booking }, input) => {
      // The secret comes back this once: keep it, and put it in the page's
      // link (fragment, never sent to a server) so a bookmark manages it too
      rememberBooking(booking.id, manageToken);
      // Seed the detail page cache (no refetch on landing) and drop the now-stale slot grid
      queryClient.setQueryData(bookingQuery(booking.id).queryKey, booking);
      queryClient.invalidateQueries({ queryKey: availabilityQuery(input.date).queryKey });
      // Navigate first, reset after: resetting renders step 1 synchronously, and
      // it would sit on screen while the booking page's chunk downloads. The
      // mutation stays pending meanwhile, so the button keeps saying "Creating…".
      await navigate({
        to: '/booking/$id',
        params: { id: booking.id },
        search: { new: true },
        hash: `key=${manageToken}`
      });
      resetWizard();
    },
    onError: (error, input) => {
      once.release();
      // The token was spent on this attempt; the next one needs a fresh solve
      botCheck.reset();
      // The menu moved on under the guest: refresh it so the order shows the truth
      if (error instanceof ApiError && error.code === 'unknown_food_item') {
        void queryClient.invalidateQueries({ queryKey: menuQuery(getLocale()).queryKey });
      }
      // Someone else got there first, or staff closed the time: the grid is
      // stale, and the time and table steps should show it when the guest
      // goes back to them
      if (error instanceof ApiError && error.code === 'slot_taken') {
        void queryClient.invalidateQueries({ queryKey: availabilityQuery(input.date).queryKey });
      }
      if (error instanceof ApiError && error.code === 'slot_closed') {
        void queryClient.invalidateQueries({ queryKey: availabilityQuery(input.date).queryKey });
        void queryClient.invalidateQueries({ queryKey: venueConfigQuery().queryKey });
      }
    }
  });

  const form = useForm({
    defaultValues: { customerName: profile?.name ?? '', customerPhone: profile?.phone ?? '' },
    onSubmit: ({ value }) => {
      createBooking.mutate(bookingRequestFrom(draft, value, sportCardCount, orderLines));
    },
    // The confirm button sits away from the fields (beside the summary, or in
    // the phone's bottom bar), so take the guest to what needs fixing
    onSubmitInvalid: () => {
      once.release();
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`#${FORM_ID} [aria-invalid=true]`)?.focus();
      });
    }
  });

  const err = createBooking.error;
  const isTimeError = needsNewTime(err);
  const slotTaken = err instanceof ApiError && err.code === 'slot_taken';
  const errorMessage = err ? mutationErrorText(err) : null;

  // The confirm button sits in the phone's bottom bar, often far below the
  // error: bring the error into view rather than leave it off screen
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (err) alertRef.current?.scrollIntoView({ block: 'center' });
  }, [err]);
  // With food in the order the menu must be known, or the lines can't be priced
  const menuPending = Object.keys(items).length > 0 && menu === undefined;

  return (
    <div>
      <h2 className="text-2xl font-bold md:text-[26px]">{m.step_details_title()}</h2>
      <p className="mt-1 text-sm leading-normal text-grey-cool md:mt-1.5 md:text-[15px]">
        {m.contacts_lead()}
      </p>

      {!profile ? (
        <div className="mt-4.5 flex items-center gap-3 rounded-2xl border border-golden/40 px-4 py-3.5 md:mt-6 md:gap-3.5 md:px-4.5 md:py-4">
          <CircleUserRound aria-hidden className="hidden size-6 flex-none text-golden md:block" />
          <p className="flex-1 text-sm leading-snug md:text-[15px]">{m.auth_promo()}</p>
          <Link
            to="/profile"
            className="btn-outline h-10 flex-none rounded-[10px] border-golden px-3.5 text-sm font-bold text-golden-light hover:border-golden md:px-4.5"
          >
            {m.sign_in()}
          </Link>
        </div>
      ) : null}

      <form
        id={FORM_ID}
        noValidate
        className="fields-roomy mt-5 grid gap-4 md:mt-6 md:grid-cols-2 md:gap-4.5"
        onSubmit={event => {
          event.preventDefault();
          event.stopPropagation();
          // Success leaves the page, so only a refusal reopens the form
          if (once.claim()) form.handleSubmit();
        }}
      >
        <form.Field
          name="customerName"
          validators={{
            onSubmit: ({ value }) => {
              if (!value.trim()) return m.err_name_required();
              return isFullName(value) ? undefined : m.err_full_name();
            }
          }}
        >
          {field => (
            <TextField
              name={field.name}
              value={field.state.value}
              onChange={value => field.handleChange(value)}
              isInvalid={field.state.meta.errors.length > 0}
              isRequired
            >
              <Label>{m.name_full_label()}</Label>
              <Input
                placeholder={m.name_full_placeholder()}
                autoComplete="name"
                onBlur={field.handleBlur}
              />
              {field.state.meta.errors.length > 0 ? (
                <FieldError>{field.state.meta.errors[0]}</FieldError>
              ) : (
                <Description>{m.name_full_hint()}</Description>
              )}
            </TextField>
          )}
        </form.Field>

        <form.Field
          name="customerPhone"
          validators={{
            onSubmit: ({ value }) => (isValidPhone(value) ? undefined : m.err_phone_invalid())
          }}
        >
          {field => (
            <PhoneField
              name={field.name}
              value={field.state.value}
              onChange={value => field.handleChange(value)}
              onBlur={field.handleBlur}
              isInvalid={field.state.meta.errors.length > 0}
              errorMessage={field.state.meta.errors[0]}
              isRequired
            />
          )}
        </form.Field>
        <BotCheckWidget check={botCheck} />
      </form>

      <SportCardPicker
        className="mt-5 md:mt-6"
        count={sportCardCount}
        max={MAX_SPORT_CARDS_PER_BOOKING}
        onChange={setSportCardCount}
      />

      {errorMessage ? (
        <div
          ref={alertRef}
          role="alert"
          className="mt-5 scroll-mt-24 rounded-2xl bg-danger-soft p-4 text-sm text-creme"
        >
          {errorMessage}
          {/* Taken spot: another one at the same time may still be free */}
          {slotTaken ? (
            <button
              type="button"
              onClick={() => goToStep('table')}
              className="btn-outline mt-3 h-10 w-full text-sm"
            >
              ← {m.change_spot()}
            </button>
          ) : null}
          {isTimeError ? (
            <button
              type="button"
              onClick={() => goToStep('when')}
              className="btn-outline mt-3 h-10 w-full text-sm"
            >
              ← {m.change_time()}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* A phone has no summary column: the booking is read back here, above the bar */}
      <section className="mt-5 rounded-[20px] border border-line bg-club-green-dark px-4.5 py-5.5 lg:hidden">
        <WizardSummary />
      </section>

      <StepActions
        bar="total"
        action={{
          label: createBooking.isPending ? m.creating() : m.btn_confirm(),
          short: m.btn_confirm_short(),
          form: FORM_ID,
          disabled: menuPending,
          pending: createBooking.isPending
        }}
        note={m.manage_note()}
      />
    </div>
  );
}
