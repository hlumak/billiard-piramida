import { Button, FieldError, Input, Label, TextField } from '@heroui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { discountGroszFor, formatPln, tablePriceGrosz, type IsoDate } from '@repo/shared';
import { isValidPhone } from '@repo/shared/phone';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { ApiError, api } from '../../lib/api';
import { formatDayLong, formatHour, intlTag } from '../../lib/format';
import { availabilityQuery, bookingQuery, menuQuery } from '../../lib/queries';
import { rememberBooking } from '../../lib/recent-bookings';
import { profileQuery } from '../../lib/auth';
import { Link } from '@tanstack/react-router';
import { goToStep, resetWizard, wizardStore } from '../../store/booking-wizard';

/** All picks made in earlier steps — non-null by construction (see book.tsx). */
export interface BookingDraft {
  date: IsoDate;
  startHour: number;
  durationHours: number;
  tableId: number;
}

export function DetailsStep({ draft }: { draft: BookingDraft }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const items = useStore(wizardStore, state => state.items);
  const { data: menu } = useQuery(menuQuery(getLocale()));
  const { data: profile } = useQuery(profileQuery());

  const orderLines = Object.entries(items)
    .map(([foodItemId, quantity]) => {
      const item = menu?.find(entry => entry.id === Number(foodItemId));
      return item ? { item, quantity } : null;
    })
    .filter(line => line != null);

  const tableTotal = tablePriceGrosz(draft.durationHours);
  const foodTotal = orderLines.reduce((sum, line) => sum + line.item.priceGrosz * line.quantity, 0);
  // Preview only — the server recomputes and locks the discount in
  const discount = profile ? discountGroszFor(profile, tableTotal) : 0;

  const createBooking = useMutation({
    mutationFn: api.createBooking,
    onSuccess: (booking, input) => {
      rememberBooking(booking.id);
      // Seed the detail page cache (no refetch on landing) and drop the now-stale slot grid
      queryClient.setQueryData(bookingQuery(booking.id).queryKey, booking);
      queryClient.invalidateQueries({ queryKey: availabilityQuery(input.date).queryKey });
      resetWizard();
      navigate({
        to: '/booking/$id',
        params: { id: booking.id },
        search: { new: true }
      });
    }
  });

  const form = useForm({
    defaultValues: { customerName: profile?.name ?? '', customerPhone: profile?.phone ?? '' },
    onSubmit: ({ value }) => {
      createBooking.mutate({
        ...draft,
        customerName: value.customerName.trim(),
        customerPhone: value.customerPhone.trim(),
        items: Object.entries(items).map(([foodItemId, quantity]) => ({
          foodItemId: Number(foodItemId),
          quantity
        }))
      });
    }
  });

  // Errors the user can only fix by returning to the time step and re-picking
  const err = createBooking.error;
  const isTimeError =
    err instanceof ApiError &&
    (err.code === 'slot_taken' ||
      err.code === 'start_in_past' ||
      err.code === 'outside_operating_hours');
  const errorMessage = err
    ? err instanceof ApiError && err.code === 'slot_taken'
      ? m.err_slot_taken()
      : isTimeError
        ? m.err_slot_expired()
        : m.err_generic()
    : null;

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-creme">{m.step_details_title()}</h2>
      {!profile ? (
        <Link to="/profile" className="mb-4 block text-sm text-golden hover:underline">
          {m.auth_promo()}
        </Link>
      ) : null}

      <div className="md:grid md:grid-cols-2 md:items-start md:gap-6">
        <div className="mb-6 rounded-[10px] bg-club-green-light p-4 md:mb-0">
          <h3 className="mb-2 font-semibold text-golden">{m.summary_title()}</h3>
          <dl className="flex flex-col gap-1 text-sm text-creme">
            <div className="flex justify-between">
              <dt className="text-grey-cool">{m.summary_date()}</dt>
              <dd className="capitalize">{formatDayLong(draft.date)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-grey-cool">{m.summary_time()}</dt>
              <dd>
                {formatHour(draft.startHour)}–{formatHour(draft.startHour + draft.durationHours)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-grey-cool">{m.summary_table()}</dt>
              <dd>{m.table_n({ n: draft.tableId })}</dd>
            </div>
          </dl>

          <div className="mt-3 border-t border-deep-cream/30 pt-3 text-sm">
            <div className="flex justify-between text-creme">
              <span className="text-grey-cool">
                {m.table_rental()} · {m.hours_n({ n: draft.durationHours })}
              </span>
              <span>{formatPln(tableTotal, intlTag())}</span>
            </div>
            {orderLines.map(line => (
              <div key={line.item.id} className="flex justify-between text-creme">
                <span className="text-grey-cool">
                  {line.item.name} × {line.quantity}
                </span>
                <span>{formatPln(line.item.priceGrosz * line.quantity, intlTag())}</span>
              </div>
            ))}
            {discount > 0 ? (
              <div className="flex justify-between text-creme">
                <span className="text-grey-cool">{m.discount_label()}</span>
                <span className="text-golden">−{formatPln(discount, intlTag())}</span>
              </div>
            ) : null}
            <div className="mt-2 flex justify-between text-base font-bold text-golden">
              <span>{m.total()}</span>
              <span>{formatPln(tableTotal + foodTotal - discount, intlTag())}</span>
            </div>
          </div>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field
            name="customerName"
            validators={{
              onSubmit: ({ value }) => (value.trim() ? undefined : m.err_name_required())
            }}
          >
            {field => (
              <TextField
                name={field.name}
                value={field.state.value}
                onChange={value => field.handleChange(value)}
                isInvalid={field.state.meta.errors.length > 0}
              >
                <Label>{m.name_label()}</Label>
                <Input placeholder={m.name_placeholder()} onBlur={field.handleBlur} />
                <FieldError>{field.state.meta.errors[0]}</FieldError>
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
              <TextField
                name={field.name}
                type="tel"
                value={field.state.value}
                onChange={value => field.handleChange(value)}
                isInvalid={field.state.meta.errors.length > 0}
              >
                <Label>{m.phone_label()}</Label>
                <Input placeholder={m.phone_placeholder()} onBlur={field.handleBlur} />
                <FieldError>{field.state.meta.errors[0]}</FieldError>
              </TextField>
            )}
          </form.Field>

          {errorMessage ? (
            <div className="rounded-[10px] bg-danger-soft p-3 text-sm text-creme">
              {errorMessage}
              {isTimeError ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full border-golden text-creme"
                  onPress={() => goToStep('time')}
                >
                  {m.btn_back()}
                </Button>
              ) : null}
            </div>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="h-[45px] w-full text-lg font-bold"
            isPending={createBooking.isPending}
          >
            {createBooking.isPending ? m.creating() : m.btn_confirm()}
          </Button>
        </form>
      </div>
    </section>
  );
}
