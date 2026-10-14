import type { IsoDate } from '@repo/shared';
import { dateTileParts } from '../lib/format';

/**
 * A day as a gold tear-off: weekday, number, month — a booking's, a
 * tournament's. A past one goes quiet so what is still ahead stands out.
 */
export function DateBadge({
  date,
  size = 'md',
  muted = false
}: {
  date: IsoDate;
  size?: 'md' | 'lg';
  muted?: boolean;
}) {
  const day = dateTileParts(date);
  const large = size === 'lg';
  return (
    <div
      aria-hidden
      className={`flex flex-none flex-col items-center justify-center ${
        large ? 'h-24 w-22 rounded-2xl' : 'h-18 w-16 rounded-[14px]'
      } ${muted ? 'bg-creme/10 text-cream-soft' : 'bg-golden text-btn-text'}`}
    >
      <span className={`font-bold uppercase ${large ? 'text-xs' : 'text-[11px]'}`}>
        {day.weekday}
      </span>
      <span className={`leading-[1.05] font-bold ${large ? 'text-4xl' : 'text-[26px]'}`}>
        {day.day}
      </span>
      <span
        className={`font-bold tracking-[0.08em] uppercase ${large ? 'text-[11px]' : 'text-[10px]'}`}
      >
        {day.month}
      </span>
    </div>
  );
}
