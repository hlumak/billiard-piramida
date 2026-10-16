import { useReducer, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button, Input, Label, Modal, Spinner, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAX_BOOKING_MINUTES,
  MAX_SPORT_CARDS_PER_BOOKING,
  MIN_BOOKING_MINUTES,
  SLOT_MINUTES,
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
import { adminApi, adminBlacklistQuery } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import {
  bookingMinutes,
  formatClock,
  formatDuration,
  warsawDate,
  warsawMinute,
  warsawToday
} from '../../lib/format';
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
  /** Minutes after local midnight */
  startMinute: number;
  tableId: number;
}

interface FormState {
  date: IsoDate;
  /** Minutes after local midnight, on the half-hour grid */
  startMinute: number | null;
  /** In minutes: an hour at least, in half-hour steps */
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
  | { type: 'startMinute'; startMinute: number }
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
      startMinute: warsawMinute(booking.startsAt),
      duration: Math.round((Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 60_000),
      tableId: booking.tableId,
      name: booking.customerName,
      phone: booking.customerPhone,
      sportCards: booking.sportCardCount,
      game: booking.game
    };
  }
  return {
    date: prefill?.date ?? warsawToday(),
    startMinute: prefill?.startMinute ?? null,
    duration: MIN_BOOKING_MINUTES,
    tableId: prefill?.tableId ?? null,
    name: '',
    phone: '',
    sportCards: 0,
    game: prefill ? defaultGameFor(prefill.tableId) : null
  };
}

/**
 * Changing the date, start or duration invalidates the spot picked under the old
 * window — that rule lives here once instead of being re-spelled in three
 * onClick handlers, and clearing up after a create is a single transition.
 */
function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'date':
      return { ...state, date: action.date, startMinute: null, tableId: null, game: null };
    case 'startMinute':
      return { ...state, startMinute: action.startMinute, tableId: null, game: null };
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
        startMinute: null,
        tableId: null,
        game: null,
        name: '',
        phone: '',
        sportCards: 0
      };
  }
}

function submitErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'slot_taken') return m.err_slot_taken();
    if (err.code === 'slot_closed') return m.err_slot_closed();
    if (err.code === 'invalid_phone') return m.err_phone_invalid();
    if (err.code === 'outside_operating_hours') return m.err_past_closing();
  }
  return m.err_generic();
}

interface SlotWindow {
  date: IsoDate;
  startMinute: number;
  duration: number;
}

/**
 * Staff may log games from earlier today, so a table is free for the window
 * when every half hour is a valid slot that isn't already booked — using
 * `booked` (not `available`, which also hides past slots) is what makes
 * past-today walk-ins selectable.
 *
 * In edit mode the booking's own slots read as `booked` — by itself. Holding
 * its current window must not make its own table look unavailable, so those
 * slots count as free for the form editing it.
 */
function isFreeForWindow(
  table: TableAvailabilityDto,
  { date, startMinute, duration }: SlotWindow,
  booking: BookingDto | undefined
): boolean {
  const held =
    booking !== undefined &&
    booking.tableId === table.tableId &&
    warsawDate(booking.startsAt) === date
      ? bookingMinutes(booking)
      : null;
  const slotByStart = new Map(table.slots.map(s => [s.startMinute, s]));
  for (let t = startMinute; t < startMinute + duration; t += SLOT_MINUTES) {
    const slot = slotByStart.get(t);
    if (!slot) return false;
    // A closure binds the desk too: the API refuses it as well
    if (slot.closed) return false;
    if (slot.booked && !(held !== null && t >= held.start && t < held.end)) return false;
  }
  return true;
}

/** Reception desk: create a booking for a walk-in / phone client. */
export function AdminNewBooking() {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-gold h-11 flex-none rounded-xl px-3.5 text-sm sm:px-4.5 sm:text-[15px]"
      >
        <Plus aria-hidden className="size-4.5" strokeWidth={2.4} />
        <span className="sm:hidden">{m.admin_book_short()}</span>
        <span className="hidden sm:inline">{m.admin_new_booking()}</span>
      </button>
      {/* Mounted only while open: the button lives in the panel's header for
          the whole shift, and each booking starts from today with an empty form */}
      {isOpen ? <AdminBookingModal isOpen={isOpen} onOpenChange={setOpen} /> : null}
    </>
  );
}

/** Row action: reopen an existing booking to move, retable or re-price it. */
export function AdminEditBooking({ booking }: { booking: BookingDto }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title={m.admin_edit_tip()}
        onClick={() => setOpen(true)}
        className="btn-outline h-9 rounded-[10px] border-creme/25 px-3 text-[13px]"
      >
        <Pencil aria-hidden className="size-3.5" strokeWidth={2.2} />
        {m.admin_edit_btn()}
      </button>
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
  const { date, startMinute, duration, tableId, name, phone, sportCards, game } = form;

  const { data: availability } = useQuery({ ...availabilityQuery(date), enabled: isOpen });
  // The desk may book a black-listed number; it should know it is doing so
  const { data: blacklist } = useQuery({ ...adminBlacklistQuery(), enabled: isOpen });
  const phoneBlacklisted = blacklist?.some(entry => entry.phone === phone) ?? false;
  const { hours: venueHours } = useVenueConfig();

  // Bounded by closing time rather than a fixed list: a 15:00 start on a day
  // that runs to 23:00 can legitimately be booked for eight hours, and the API
  // accepts exactly that. Picking a new start can leave the stored duration
  // over the limit, so the clamped value — not `duration` — drives the form.
  const maxDuration =
    startMinute === null
      ? MAX_BOOKING_MINUTES
      : Math.min(maxDurationAt(date, startMinute, venueHours), MAX_BOOKING_MINUTES);
  const effectiveDuration = Math.min(duration, Math.max(maxDuration, MIN_BOOKING_MINUTES));
  const lengths: number[] = [];
  for (let n = MIN_BOOKING_MINUTES; n <= maxDuration; n += SLOT_MINUTES) lengths.push(n);

  const create = useMutation({
    mutationFn: () => {
      const values = {
        tableId: tableId!,
        date,
        startMinute: startMinute!,
        durationMinutes: effectiveDuration,
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

  const starts = slotStartsForDate(date, venueHours);
  // No spot can be judged free until a start is picked
  const slotWindow: SlotWindow | null =
    startMinute === null ? null : { date, startMinute, duration: effectiveDuration };

  const canSubmit =
    startMinute !== null && tableId !== null && name.trim().length > 0 && isValidPhone(phone);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
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
                    {starts.map(start => (
                      <button
                        key={start}
                        type="button"
                        aria-pressed={startMinute === start}
                        onClick={() => dispatch({ type: 'startMinute', startMinute: start })}
                        className={chip(startMinute === start)}
                      >
                        {formatClock(start)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm text-grey-cool">{m.time_duration()}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {lengths.map(n => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={effectiveDuration === n}
                        onClick={() => dispatch({ type: 'duration', duration: n })}
                        className={chip(effectiveDuration === n)}
                      >
                        {formatDuration(n)}
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
                        const free =
                          slotWindow !== null && isFreeForWindow(table, slotWindow, booking);
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
                {phoneBlacklisted ? (
                  <p role="status" className="text-sm text-danger-soft-foreground">
                    {m.admin_blacklisted_warning()}
                  </p>
                ) : null}

                {create.error ? (
                  <p className="text-sm text-danger-soft-foreground">
                    {submitErrorMessage(create.error)}
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
