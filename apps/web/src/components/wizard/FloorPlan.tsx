import type { KeyboardEvent } from 'react';
import { m as msg } from '../../paraglide/messages.js';
import { m } from '../motion';
import { fadeUpChild, staggerParent } from '../motion/variants';

/**
 * Interactive venue floor plan (owner's blueprint): entrance and reception
 * top-left, WC top-center, five billiard tables in their real positions.
 * Coordinates live in a 1000×580 viewBox; tables are drawn oversized relative
 * to the room so they stay tappable when the plan shrinks to phone width.
 */

interface TableSpot {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const TABLES: TableSpot[] = [
  { id: 1, x: 60, y: 380, w: 190, h: 95 },
  { id: 2, x: 320, y: 375, w: 95, h: 190 },
  { id: 3, x: 700, y: 250, w: 95, h: 190 },
  { id: 4, x: 780, y: 100, w: 190, h: 95 },
  { id: 5, x: 870, y: 290, w: 95, h: 190 }
];

/** Six pockets: four corners + two long-side middles. */
function pocketCenters({ x, y, w, h }: TableSpot): [number, number][] {
  const inset = 10;
  const corners: [number, number][] = [
    [x + inset, y + inset],
    [x + w - inset, y + inset],
    [x + inset, y + h - inset],
    [x + w - inset, y + h - inset]
  ];
  return w >= h
    ? [...corners, [x + w / 2, y + inset], [x + w / 2, y + h - inset]]
    : [...corners, [x + inset, y + h / 2], [x + w - inset, y + h / 2]];
}

function PlanTable({
  spot,
  free,
  onSelect
}: {
  spot: TableSpot;
  free: boolean;
  onSelect: (tableId: number) => void;
}) {
  const { id, x, y, w, h } = spot;
  const label = msg.table_n({ n: id });

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <m.g
      variants={fadeUpChild}
      role="button"
      aria-label={label}
      aria-disabled={!free}
      tabIndex={free ? 0 : -1}
      {...(free
        ? {
            onClick: () => onSelect(id),
            onKeyDown: handleKeyDown,
            whileTap: { scale: 0.94 },
            className: 'group cursor-pointer outline-none'
          }
        : { className: 'opacity-35' })}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      {/* Oversized invisible hit area for fat fingers */}
      <rect x={x - 14} y={y - 14} width={w + 28} height={h + 28} fill="transparent" />
      {/* Frame */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={12}
        fill="var(--color-club-green-light)"
        strokeWidth={5}
        className={
          free
            ? 'stroke-golden transition-colors group-hover:stroke-golden-hover group-focus-visible:stroke-creme'
            : 'stroke-grey-cool'
        }
      />
      {/* Felt */}
      <rect
        x={x + 14}
        y={y + 14}
        width={w - 28}
        height={h - 28}
        rx={6}
        className="fill-club-green transition-colors group-hover:fill-surface-tertiary"
      />
      {pocketCenters(spot).map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={5.5} className="fill-black/60" />
      ))}
      <text
        x={x + w / 2}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className={`text-[34px] font-bold ${free ? 'fill-creme' : 'fill-grey-cool'}`}
      >
        {id}
      </text>
    </m.g>
  );
}

export function FloorPlan({
  freeTableIds,
  onSelect
}: {
  freeTableIds: ReadonlySet<number>;
  onSelect: (tableId: number) => void;
}) {
  return (
    <div>
      <m.svg
        viewBox="0 0 1000 580"
        role="group"
        aria-label={msg.step_table_title()}
        className="w-full"
        variants={staggerParent}
        initial="hidden"
        animate="visible"
      >
        {/* Room walls */}
        <rect
          x={6}
          y={6}
          width={988}
          height={568}
          rx={26}
          fill="none"
          strokeWidth={3}
          className="stroke-deep-cream/50"
        />
        {/* Entrance: gap in the top wall + inward arrow */}
        <rect x={232} y={2} width={96} height={8} fill="var(--background)" />
        <path
          d="M280 14 v46 m0 0 l-12 -14 m12 14 l12 -14"
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          className="stroke-golden"
        />
        <text x={280} y={92} textAnchor="middle" className="fill-creme/80 text-[22px]">
          {msg.plan_entrance()}
        </text>

        {/* Reception */}
        <rect
          x={24}
          y={24}
          width={195}
          height={120}
          rx={16}
          className="fill-club-green-light stroke-deep-cream/30"
          strokeWidth={2}
        />
        <text
          x={121}
          y={84}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-creme/90 text-[24px] font-medium"
        >
          {msg.plan_reception()}
        </text>

        {/* WC */}
        <rect
          x={345}
          y={6}
          width={325}
          height={190}
          rx={10}
          className="fill-club-green-light stroke-deep-cream/30"
          strokeWidth={2}
        />
        <text
          x={507}
          y={101}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-creme/90 text-[24px] font-medium"
        >
          WC
        </text>

        {TABLES.map(spot => (
          <PlanTable
            key={spot.id}
            spot={spot}
            free={freeTableIds.has(spot.id)}
            onSelect={onSelect}
          />
        ))}
      </m.svg>

      <div className="mt-3 flex items-center gap-5 text-xs text-grey-cool">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-[4px] border-2 border-golden bg-club-green-light" />
          {msg.plan_free()}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-[4px] border-2 border-grey-cool bg-club-green-light opacity-40" />
          {msg.plan_taken()}
        </span>
      </div>
    </div>
  );
}
