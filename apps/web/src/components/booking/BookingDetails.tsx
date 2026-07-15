import { useQuery } from '@tanstack/react-query';
import { formatPln, hoursForDate, type BookingDto } from '@repo/shared';
import { formatDayLong, intlTag, warsawDate, warsawHour, warsawTime } from '../../lib/format';
import { menuQuery } from '../../lib/queries';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { m as motion, StaggerGroup, StaggerItem } from '../motion';
import { AddFoodModal } from './AddFoodModal';
import { CancelModal } from './CancelModal';
import { ExtendModal } from './ExtendModal';
import { PHASE_LABELS, PHASE_STYLES } from './phase';

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
  const closeHour = hoursForDate(date).close;
  const maxExtend = booking.status === 'confirmed' ? closeHour - warsawHour(booking.endsAt) : 0;

  const canManage = booking.phase === 'upcoming' || booking.phase === 'active';

  return (
    <StaggerGroup className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
      {justCreated && booking.phase !== 'cancelled' ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="rounded-[10px] bg-golden/15 p-4 text-center md:col-span-2"
        >
          <p className="text-lg font-bold text-golden">{m.success_title()}</p>
          <p className="mt-1 text-sm text-creme/80">{m.success_hint()}</p>
        </motion.div>
      ) : null}

      <StaggerItem className="rounded-[10px] bg-club-green-light p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-creme">{m.booking_title()}</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${PHASE_STYLES[booking.phase]}`}
          >
            {PHASE_LABELS[booking.phase]()}
          </span>
        </div>
        <dl className="flex flex-col gap-1 text-sm text-creme">
          <div className="flex justify-between">
            <dt className="text-grey-cool">{m.summary_date()}</dt>
            <dd className="capitalize">{formatDayLong(date)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-grey-cool">{m.summary_time()}</dt>
            <dd>
              {warsawTime(booking.startsAt)}–{warsawTime(booking.endsAt)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-grey-cool">{m.summary_table()}</dt>
            <dd>{m.table_n({ n: booking.tableId })}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-grey-cool">{m.name_label()}</dt>
            <dd>{booking.customerName}</dd>
          </div>
        </dl>
      </StaggerItem>

      <StaggerItem className="rounded-[10px] bg-club-green-light p-4">
        <h3 className="mb-2 font-semibold text-golden">{m.order_title()}</h3>
        <div className="flex flex-col gap-1 text-sm text-creme">
          <div className="flex justify-between">
            <span className="text-grey-cool">{m.table_rental()}</span>
            <span>{formatPln(booking.tableTotalGrosz, intlTag())}</span>
          </div>
          {booking.items.map(item => (
            <div key={item.id} className="flex justify-between">
              <span className="text-grey-cool">
                {nameBySlug.get(item.slug) ?? item.slug} × {item.quantity}
              </span>
              <span>{formatPln(item.unitPriceGrosz * item.quantity, intlTag())}</span>
            </div>
          ))}
          {booking.discountGrosz > 0 ? (
            <div className="flex justify-between">
              <span className="text-grey-cool">{m.discount_label()}</span>
              <span className="text-golden">−{formatPln(booking.discountGrosz, intlTag())}</span>
            </div>
          ) : null}
          <div className="mt-2 flex justify-between border-t border-deep-cream/30 pt-2 text-base font-bold text-golden">
            <span>{m.total()}</span>
            <span>{formatPln(booking.totalGrosz, intlTag())}</span>
          </div>
        </div>
      </StaggerItem>

      {canManage ? (
        <StaggerItem className="mt-2 flex flex-col gap-3 md:col-span-2 md:flex-row md:[&>*]:flex-1">
          {maxExtend > 0 ? <ExtendModal booking={booking} maxExtend={maxExtend} /> : null}
          <AddFoodModal booking={booking} />
          {booking.phase === 'upcoming' ? <CancelModal booking={booking} /> : null}
        </StaggerItem>
      ) : null}
    </StaggerGroup>
  );
}
