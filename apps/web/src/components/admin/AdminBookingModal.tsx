import { useReducer, useState } from 'react';
import { Button, Input, Label, Modal, Spinner, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAX_BOOKING_HOURS,
  MAX_SPORT_CARDS_PER_BOOKING,
  MIN_BOOKING_HOURS,
  defaultGameFor,
  gamesFor,
  maxDurationAt,
  slotStartsForDate,
  type BilliardGame,
  type BookingDto,
  type IsoDate,
  type TableAvailabilityDto
} from '@repo/shared';
import { isValidPhone } from '@repo/shared/phone';
import { adminApi } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { formatHour, warsawDate, warsawHour, warsawToday } from '../../lib/format';
import { availabilityQuery } from '../../lib/queries';
import { gameName, spotName } from '../../lib/spots';
import { m } from '../../paraglide/messages.js';
import { AdminDatePicker } from './AdminDatePicker';
import { PhoneField } from '../PhoneField';
import { useVenueConfig } from '../../lib/venue-config';

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
  /** Null until a spot is picked, and on dartboards, which rack nothing */
  game: BilliardGame | null;
}

type FormAction =
  | { type: 'date'; date: IsoDate }
  | { type: 'startHour'; startHour: number }
  | { type: 'duration'; duration: number }
  | { type: 'tableId'; tableId: number }
  | { type: 'game'; game: BilliardGame }
  | { type: 'name'; name: string }
  | { type: 'phone'; phone: string }
  | { type: 'sportCards'; sportCards: number }
  | { type: 'created' };

interface FormSeed {
  prefill?: NewBookingPrefill | undefined;
  /** Present in edit mode: the booking whose window the form starts from */
  booking?: BookingDto | undefined;
}

function initialForm({ prefill, booking }: FormSeed): FormState {
  if (booking) {
    return {
      date: warsawDate(booking.startsAt),
      startHour: warsawHour(booking.startsAt),
      duration: Math.round((Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 3_600_000),
      tableId: booking.tableId,
      name: booking.customerName,
      phone: booking.customerPhone,
      sportCards: booking.sportCardCount,
      game: booking.game
    };
  }
  return {
    date: prefill?.date ?? warsawToday(),
    startHour: prefill?.startHour ?? null,
    duration: 1,
    tableId: prefill?.tableId ?? null,
    name: '',
    phone: '',
    sportCards: 0,
    game: prefill ? defaultGameFor(prefill.tableId) : null
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
      return { ...state, date: action.date, startHour: null, tableId: null, game: null };
    case 'startHour':
      return { ...state, startHour: action.startHour, tableId: null, game: null };
    case 'duration':
      return { ...state, duration: action.duration, tableId: null, game: null };
    // The spot decides what can be racked on it, so the game follows it here
    case 'tableId':
      return { ...state, tableId: action.tableId, game: defaultGameFor(action.tableId) };
    case 'game':
      return { ...state, game: action.game };
    case 'name':
      return { ...state, name: action.name };
    case 'phone':
      return { ...state, phone: action.phone };
    case 'sportCards':
      return { ...state, sportCards: action.sportCards };
    // Date and duration survive so staff can log the next walk-in in the same
    // window; everything tied to the booking just created is cleared.
    case 'created':
      return {
        ...state,
        startHour: null,
        tableId: null,
        game: null,
        name: '',
        phone: '',
        sportCards: 0
      };
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
      <AdminBookingModal isOpen={isOpen} onOpenChange={setOpen} />
    </>
  );
}

/** Row action: reopen an existing booking to move, retable or re-price it. */
export function AdminEditBooking({ booking }: { booking: BookingDto }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onPress={() => setOpen(true)}>
        {m.admin_edit_btn()}
      </Button>
      {/* Keyed so reopening after a change starts from the saved window */}
      {isOpen ? (
        <AdminBookingModal
          key={`${booking.startsAt}:${booking.tableId}`}
          isOpen={isOpen}
          onOpenChange={setOpen}
          booking={booking}
        />
      ) : null}
    </>
  );
}

/**
 * One modal for both jobs: `booking` present means edit, absent means create.
 * The two differ only in what submit calls and in which slots count as free —
 * everything else (window rules, spot picker, card stepper) is the same form.
 */
export function AdminBookingModal({
  isOpen,
  onOpenChange,
  prefill,
  booking
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: NewBookingPrefill;
  booking?: BookingDto;
}) {
  const queryClient = useQueryClient();
  // Remounted by the caller on a prefill/booking change (keyed), so the initial
  // state never needs syncing back from props.
  const [form, dispatch] = useReducer(formReducer, { prefill, booking }, initialForm);
  const { date, startHour, duration, tableId, name, phone, sportCards, game } = form;

  const { data: availability } = useQuery({ ...availabilityQuery(date), enabled: isOpen });
  const { hours: venueHours } = useVenueConfig();

  // Bounded by closing time rather than a fixed list: a 15:00 start on a day
  // that runs to 23:00 can legitimately be booked for eight hours, and the API
  // accepts exactly that. Picking a new start can leave the stored duration
  // over the limit, so the clamped value — not `duration` — drives the form.
  const maxDuration =
    startHour === null
      ? MAX_BOOKING_HOURS
      : Math.min(maxDurationAt(date, startHour, venueHours), MAX_BOOKING_HOURS);
  const effectiveDuration = Math.min(duration, Math.max(maxDuration, MIN_BOOKING_HOURS));

  const create = useMutation({
    mutationFn: () => {
      const values = {
        tableId: tableId!,
        date,
        startHour: startHour!,
        durationHours: effectiveDuration,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        sportCardCount: sportCards,
        // Left out on a dartboard, which the API refuses a game for
        ...(game === null ? {} : { game })
      };
      return booking ? adminApi.updateBooking(booking.id, values) : adminApi.createBooking(values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: availabilityQuery(date).queryKey });
      // An edit can move a booking off its old day, leaving that grid stale
      if (booking) {
        queryClient.invalidateQueries({
          queryKey: availabilityQuery(warsawDate(booking.startsAt)).queryKey
        });
      }
      onOpenChange(false);
      dispatch({ type: 'created' });
    }
  });

  // Staff may log games from earlier today, so a table is free for the window
  // when every hour is a valid slot that isn't already booked — using `booked`
  // (not `available`, which also hides past hours) is what makes past-today
  // walk-ins selectable.
  const hours = slotStartsForDate(date, venueHours);
  // In edit mode the booking's own hours read as `booked` — by itself. Holding
  // its current slot must not make its own table look unavailable, so those
  // hours count as free for this form only.
  const ownDate = booking ? warsawDate(booking.startsAt) : null;
  const ownStart = booking ? warsawHour(booking.startsAt) : 0;
  const ownEnd = booking ? warsawHour(booking.endsAt) : 0;
  const heldByThisBooking = (spotId: number, hour: number) =>
    booking !== undefined &&
    spotId === booking.tableId &&
    date === ownDate &&
    hour >= ownStart &&
    hour < ownEnd;

  const freeForWindow = (candidateTable: TableAvailabilityDto) => {
    if (startHour === null) return false;
    const slotByHour = new Map(candidateTable.slots.map(s => [s.hour, s]));
    for (let h = startHour; h < startHour + effectiveDuration; h++) {
      const slot = slotByHour.get(h);
      if (!slot) return false;
      if (slot.booked && !heldByThisBooking(candidateTable.tableId, h)) return false;
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
              <Modal.Heading>
                {booking ? m.admin_edit_booking() : m.admin_new_booking()}
              </Modal.Heading>
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
                    {Array.from({ length: maxDuration }, (_, i) => i + 1).map(h => (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={effectiveDuration === h}
                        onClick={() => dispatch({ type: 'duration', duration: h })}
                        className={chip(effectiveDuration === h)}
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

                {/* Only where the room actually offers a choice — hall 2's 12ft
                    cloth and the dartboards have nothing to pick between. */}
                {tableId !== null && gamesFor(tableId).length > 1 ? (
                  <div>
                    <p className="mb-2 text-sm text-grey-cool">{m.game_label()}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {gamesFor(tableId).map(option => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={game === option}
                          onClick={() => dispatch({ type: 'game', game: option })}
                          className={chip(game === option, false)}
                        >
                          {gameName(option)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

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
                <PhoneField
                  name="customerPhone"
                  value={phone}
                  onChange={value => dispatch({ type: 'phone', phone: value })}
                />

                {create.error ? (
                  <p className="text-sm text-danger-soft-foreground">
                    {create.error instanceof ApiError
                      ? create.error.code === 'slot_taken'
                        ? m.err_slot_taken()
                        : create.error.code === 'invalid_phone'
                          ? m.err_phone_invalid()
                          : create.error.code === 'outside_operating_hours'
                            ? m.err_past_closing()
                            : m.err_generic()
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
                {booking ? m.btn_save() : m.admin_create_btn()}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
