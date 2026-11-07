import type { AdminTableUtilizationDto } from '@repo/shared';
import { spotName } from '../../../lib/spots';
import { m } from '../../../paraglide/messages.js';

/**
 * Horizontal magnitude bars, one per table. Every bar is direct-labeled
 * (5 rows — labels are the point here), track shows the full open window.
 */
export function UtilizationBars({ tables }: { tables: AdminTableUtilizationDto[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {tables.map(table => {
        const ratio = table.openHours > 0 ? table.bookedHours / table.openHours : 0;
        return (
          <div key={table.tableId} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm whitespace-nowrap text-creme">
              {spotName(table.kind, table.label)}
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded-[4px] bg-club-green">
              <div
                className="h-full rounded-r-[4px] bg-golden"
                style={{ width: `${Math.min(ratio * 100, 100)}%` }}
              />
            </div>
            {/* Hours, said as hours: "5 / 187" left the unit to guesswork */}
            <span className="w-36 shrink-0 text-right text-xs whitespace-nowrap text-grey-cool">
              {m.admin_util_hours({
                booked: Math.round(table.bookedHours),
                open: Math.round(table.openHours)
              })}{' '}
              <span className="font-semibold text-creme">({Math.round(ratio * 100)}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
