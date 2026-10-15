import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { MapPin, Navigation, Phone } from 'lucide-react';
import { formatPln, hoursForDate, MAX_BOOKING_HOURS, sizeOf, type BookingDto } from '@repo/shared';
import { useVenueConfig } from '../../lib/venue-config';
import { bookingHours, formatDayLong, intlTag, warsawDate, warsawTime } from '../../lib/format';
import { menuQuery } from '../../lib/queries';
import { gameName, spotName, spotRentalLabel } from '../../lib/spots';
import { VENUE, VENUE_DIRECTIONS_URL } from '../../lib/venue';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { VenueMap } from '../venue/VenueMap';
import { AddFoodModal } from './AddFoodModal';
import { DateBadge } from '../DateBadge';
import { CancelModal } from './CancelModal';
import { ExtendModal } from './ExtendModal';
import { PHASE_LABELS, PHASE_STYLES } from './phase';

const SPARK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * The page a booking lives on: just made, it opens with the confirmation;
 * after that it is where the guest extends, orders from the bar, cancels,
 * and finds the way to the club.
 */
export function BookingDetails({
  booking,
  justCreated
}: {
  booking: BookingDto;
  justCreated: boolean;
}) {
  const { data: menu } = useQuery(menuQuery(getLocale()));
  const nameBySlug = new Map(menu?.map(item => [item.slug, item.name]));

  const date = warsawDate(booking.startsAt);
  const closeHour = hoursForDate(date, useVenueConfig().hours).close;
  const { start, end } = bookingHours(booking);
  // Up to closing time, and never past the longest booking the API accepts
  const maxExtend =
    booking.status === 'confirmed'
      ? Math.max(0, Math.min(closeHour - end, MAX_BOOKING_HOURS - (end - start)))
      : 0;

  const canManage = booking.phase === 'upcoming' || booking.phase === 'active';
  const celebrate = justCreated && booking.phase !== 'cancelled';
  const size = sizeOf(booking.tableId);
  const spot = [
    spotName(booking.kind, booking.tableLabel),
    size,
    // Absent on a dartboard, and on rentals taken before the club began
    // recording it — either way there is nothing truthful to show
    booking.game ? gameName(booking.game) : null
  ]
    .filter(Boolean)
    .join(' · ');
  const money = (grosz: number) => formatPln(grosz, intlTag());

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      {celebrate ? (
        <section
          role="status"
          className="anim-reveal rounded-3xl border-[1.5px] border-golden/55 bg-golden/10 px-5 pt-9 pb-8 text-center md:px-8 md:pt-10 md:pb-9"
        >
          <span aria-hidden className="relative inline-block size-24 md:size-28">
            {SPARK_ANGLES.map(angle => (
              <span
                key={angle}
                className="spark"
                style={{ '--angle': `${angle}deg` } as CSSProperties}
              />
            ))}
            <span className="anim-success-pop absolute inset-0 flex items-center justify-center rounded-full border-[5px] border-golden bg-golden/16 text-golden shadow-[0_0_0_10px_rgb(247_173_30/0.08)]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-12 md:size-14.5"
              >
                <path className="check-draw" pathLength={1} d="M20 6 9 17l-5-5" />
              </svg>
            </span>
          </span>
          <h1 className="mt-5.5 text-[26px] leading-tight font-bold md:text-[32px]">
            {m.success_title()}
          </h1>
          <p className="mx-auto mt-2 max-w-[560px] leading-relaxed text-cream-soft">
            {m.success_hint()}
          </p>
          <Link to="/bookings" className="btn-outline mt-5.5 h-12 px-5.5 text-[15px]">
            {m.nav_my_bookings()}
          </Link>
        </section>
      ) : null}

      <div
        className={`anim-reveal grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:grid-cols-[minmax(0,1fr)_360px] ${
          celebrate ? '[animation-delay:350ms]' : ''
        }`}
      >
        <section aria-label={m.booking_title()} className="card p-5 md:p-7">
          <div className="flex items-center gap-4 md:gap-5.5">
            <DateBadge date={date} size="lg" muted={!canManage} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <p className="text-2xl font-bold tabular-nums md:text-[28px]">
                  {/* The date badge beside it is a picture to a screen reader */}
                  <span className="sr-only">{formatDayLong(date)}, </span>
                  {warsawTime(booking.startsAt)}–{warsawTime(booking.endsAt)}
                </p>
                <span
                  className={`rounded-full px-2.75 py-1 text-xs font-bold ${PHASE_STYLES[booking.phase]}`}
                >
                  {PHASE_LABELS[booking.phase]()}
                </span>
              </div>
              <p className="mt-1.5 text-cream-soft">{spot}</p>
              <p className="mt-1 text-sm text-grey-cool">
                {m.booking_for({ name: booking.customerName })}
              </p>
            </div>
          </div>

          {canManage ? (
            <div className="mt-6.5 grid gap-3 border-t border-line pt-5.5 sm:auto-cols-fr sm:grid-flow-col">
              {maxExtend > 0 ? <ExtendModal booking={booking} maxExtend={maxExtend} /> : null}
              <AddFoodModal booking={booking} />
              {booking.phase === 'upcoming' ? <CancelModal booking={booking} /> : null}
            </div>
          ) : null}
        </section>

        <section className="card p-6">
          <h2 className="text-[17px] font-bold text-golden">{m.order_title()}</h2>
          <dl className="mt-3.5 flex flex-col gap-2.5 text-[15px] text-cream-soft">
            <div className="flex justify-between gap-4">
              <dt>{spotRentalLabel(booking.kind)}</dt>
              <dd className="tabular-nums">{money(booking.tableTotalGrosz)}</dd>
            </div>
            {booking.items.map(item => (
              <div key={item.id} className="flex justify-between gap-4">
                <dt>
                  {nameBySlug.get(item.slug) ?? item.slug} × {item.quantity}
                </dt>
                <dd className="tabular-nums">{money(item.unitPriceGrosz * item.quantity)}</dd>
              </div>
            ))}
            {booking.discountGrosz > 0 ? (
              <div className="flex justify-between gap-4">
                <dt>{m.sport_cards_count({ n: booking.sportCardCount })}</dt>
                <dd className="text-golden-light tabular-nums">−{money(booking.discountGrosz)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-3.5 flex items-baseline justify-between border-t border-line pt-3.5">
            <span className="font-bold">{m.total()}</span>
            <span className="text-2xl font-bold text-golden tabular-nums">
              {money(booking.totalGrosz)}
            </span>
          </div>
        </section>

        {canManage ? (
          <section className="grid gap-7 rounded-[22px] bg-club-green-dark p-5 md:col-span-2 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:p-7">
            <div className="flex flex-col gap-3.5">
              <h2 className="text-xl font-bold">{m.how_to_get_here()}</h2>
              <div className="flex gap-3">
                <MapPin aria-hidden className="mt-0.5 size-5.5 flex-none text-golden" />
                <div>
                  <p className="leading-snug font-bold">
                    {VENUE.street}
                    <br />
                    {VENUE.postalCode} {VENUE.city}
                  </p>
                  <p className="mt-1 text-sm text-grey-cool">{m.club_upstairs()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone aria-hidden className="size-5 flex-none text-golden" />
                <span className="font-semibold">{VENUE.phone}</span>
              </div>
              <div className="mt-auto flex flex-col gap-2.5 pt-2">
                <a
                  href={VENUE_DIRECTIONS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-gold lift h-12.5 text-[15px] whitespace-nowrap"
                >
                  <Navigation aria-hidden className="size-4.5" />
                  {m.map_directions()}
                </a>
                <a
                  href={`tel:${VENUE.phone.replaceAll(' ', '')}`}
                  className="btn-outline h-12.5 text-[15px] whitespace-nowrap"
                >
                  <Phone aria-hidden className="size-4.5" />
                  {m.call_us()}
                </a>
              </div>
            </div>
            <VenueMap className="min-h-70" />
          </section>
        ) : null}
      </div>
    </div>
  );
}
