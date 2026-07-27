import { useReducer, useState } from 'react';
import { Button, Input, Label, Modal, Spinner, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAX_SPORT_CARDS_PER_BOOKING,
  slotStartsForDate,
  type IsoDate,
  type TableAvailabilityDto
} from '@repo/shared';
import { isValidPhone } from '@repo/shared/phone';
import { adminApi } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { warsawToday, formatHour } from '../../lib/format';
import { availabilityQuery } from '../../lib/queries';
import { spotName } from '../../lib/spots';
import { m } from '../../paraglide/messages.js';
import { AdminDatePicker } from './AdminDatePicker';

const chip = (selected: boolean, disabled = false) =>
  `h-9 min-w-14 rounded-[10px] px-2.5 text-sm font-semibold transition-colors ${
    selected
      ? 'bg-golden text-btn-text'
      : disabled
        ? 'bg-club-green text-grey-cool opacity-40'
        : 'bg-club-green text-creme hover:bg-surface-hover'
  }`;

/** A slot picked elsewhere (e.g. the schedule grid) that seeds the form. */
export interface NewBookingPrefill {
  date: IsoDate;
  startHour: number;
  tableId: number;
}

interface FormState {
  date: IsoDate;
  startHour: number | null;
  duration: number;
  tableId: number | null;
  name: string;
  phone: string;
  sportCards: number;
}

type FormAction =
  | { type: 'date'; date: IsoDate }
  | { type: 'startHour'; startHour: number }
  | { type: 'duration'; duration: number }
  | { type: 'tableId'; tableId: number }
  | { type: 'name'; name: string }
  | { type: 'phone'; phone: string }
  | { type: 'sportCards'; sportCards: number }
  | { type: 'created' };

function initialForm(prefill: NewBookingPrefill | undefined): FormState {
  return {
    date: prefill?.date ?? warsawToday(),
    startHour: prefill?.startHour ?? null,
    duration: 1,
    tableId: prefill?.tableId ?? null,
    name: '',
    phone: '',
    sportCards: 0
  };
}

/**
 * Changing the date, hour or duration invalidates the spot picked under the old
 * window — that rule lives here once instead of being re-spelled in three
 * onClick handlers, and clearing up after a create is a single transition.
 */
function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'date':
      return { ...state, date: action.date, startHour: null, tableId: null };
    case 'startHour':
      return { ...state, startHour: action.startHour, tableId: null };
    case 'duration':
      return { ...state, duration: action.duration, tableId: null };
    case 'tableId':
      return { ...state, tableId: action.tableId };
    case 'name':
      return { ...state, name: action.name };
    case 'phone':
      return { ...state, phone: action.phone };
    case 'sportCards':
      return { ...state, sportCards: action.sportCards };
    // Date and duration survive so staff can log the next walk-in in the same
    // window; everything tied to the booking just created is cleared.
    case 'created':
      return { ...state, startHour: null, tableId: null, name: '', phone: '', sportCards: 0 };
  }
}

/** Reception desk: create a booking for a walk-in / phone client. */
export function AdminNewBooking() {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" className="font-semibold" onPress={() => setOpen(true)}>
        {m.admin_new_booking()}
      </Button>
      <AdminNewBookingModal isOpen={isOpen} onOpenChange={setOpen} />
    </>
  );
}

export function AdminNewBookingModal({
  isOpen,
  onOpenChange,
  prefill
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: NewBookingPrefill;
}) {
  const queryClient = useQueryClient();
  // Remounted by the caller on a prefill change (keyed), so the initial state
  // never needs syncing back from props.
  const [form, dispatch] = useReducer(formReducer, prefill, initialForm);
  const { date, startHour, duration, tableId, name, phone, sportCards } = form;

  const { data: availability } = useQuery({ ...availabilityQuery(date), enabled: isOpen });

  const create = useMutation({
    mutationFn: () =>
      adminApi.createBooking({
        tableId: tableId!,
        date,
        startHour: startHour!,
        durationHours: duration,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        sportCardCount: sportCards
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: availabilityQuery(date).queryKey });
      onOpenChange(false);
      dispatch({ type: 'created' });
    }
  });

  // Staff may log games from earlier today, so a table is free for the window
  // when every hour is a valid slot that isn't already booked — using `booked`
  // (not `available`, which also hides past hours) is what makes past-today
  // walk-ins selectable.
  const hours = slotStartsForDate(date);
  const freeForWindow = (candidateTable: TableAvailabilityDto) => {
    if (startHour === null) return false;
    const slotByHour = new Map(candidateTable.slots.map(s => [s.hour, s]));
    for (let h = startHour; h < startHour + duration; h++) {
      const slot = slotByHour.get(h);
      if (!slot || slot.booked) return false;
    }
    return true;
  };

  const canSubmit =
    startHour !== null && tableId !== null && name.trim().length > 0 && isValidPhone(phone);

  return (
    <Modal>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container scroll="inside">
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{m.admin_new_booking()}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                <AdminDatePicker
                  value={date}
                  onChange={next => dispatch({ type: 'date', date: next ?? warsawToday() })}
                />

                <div>
                  <p className="mb-2 text-sm text-grey-cool">{m.admin_start_time()}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {hours.map(hour => (
                      <button
                        key={hour}
                        type="button"
                        aria-pressed={startHour === hour}
                        onClick={() => dispatch({ type: 'startHour', startHour: hour })}
                        className={chip(startHour === hour)}
                      >
                        {formatHour(hour)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm text-grey-cool">{m.time_duration()}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4].map(h => (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={duration === h}
                        onClick={() => dispatch({ type: 'duration', duration: h })}
                        className={chip(duration === h)}
                      >
                        {m.hours_n({ n: h })}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm text-grey-cool">{m.admin_pick_table()}</p>
                  {!availability ? (
                    <Spinner size="sm" aria-label={m.loading()} />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {availability.tables.map(table => {
                        const free = freeForWindow(table);
                        return (
                          <button
                            key={table.tableId}
                            type="button"
                            disabled={!free}
                            aria-pressed={tableId === table.tableId}
                            onClick={() => dispatch({ type: 'tableId', tableId: table.tableId })}
                            className={chip(tableId === table.tableId, !free)}
                          >
                            {spotName(table.kind, table.label)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm text-grey-cool">{m.admin_sport_cards()}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: MAX_SPORT_CARDS_PER_BOOKING + 1 }, (_, n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={sportCards === n}
                        onClick={() => dispatch({ type: 'sportCards', sportCards: n })}
                        className={chip(sportCards === n, false)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <TextField
                  name="customerName"
                  value={name}
                  onChange={value => dispatch({ type: 'name', name: value })}
                >
                  <Label>{m.name_label()}</Label>
                  <Input placeholder={m.name_placeholder()} />
                </TextField>
                <TextField
                  name="customerPhone"
                  type="tel"
                  value={phone}
                  onChange={value => dispatch({ type: 'phone', phone: value })}
                >
                  <Label>{m.phone_label()}</Label>
                  <Input placeholder={m.phone_placeholder()} />
                </TextField>

                {create.error ? (
                  <p className="text-sm text-danger-soft-foreground">
                    {create.error instanceof ApiError && create.error.code === 'slot_taken'
                      ? m.err_slot_taken()
                      : m.err_generic()}
                  </p>
                ) : null}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="w-full font-bold"
                isDisabled={!canSubmit}
                isPending={create.isPending}
                onPress={() => create.mutate()}
              >
                {m.admin_create_btn()}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
