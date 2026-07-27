import type { KeyboardEvent } from 'react';
import type { TableDto } from '@repo/shared';
import { m as msg } from '../../paraglide/messages.js';
import { spotName } from '../../lib/spots';

/**
 * Interactive venue floor plan (owner's blueprint): entrance and reception
 * top-left, WC top-center, five billiard tables in their real positions.
 * Coordinates live in a 1000×580 viewBox; tables are drawn oversized relative
 * to the room so they stay tappable when the plan shrinks to phone width.
 *
 * NOTE: the dartboard positions are placeholders — they hang on the free left
 * wall below reception, which is a guess. Move them once the owner confirms
 * where the boards actually are.
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

interface DartSpot {
  id: number;
  cx: number;
  cy: number;
  r: number;
}

const DARTBOARDS: DartSpot[] = [
  { id: 6, cx: 90, cy: 210, r: 52 },
  { id: 7, cx: 90, cy: 320, r: 52 }
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

/** Shared shell: hit area, keyboard activation, free/taken styling. */
function PlanSpot({
  id,
  label,
  free,
  onSelect,
  children
}: {
  id: number;
  label: string;
  free: boolean;
  onSelect: (tableId: number) => void;
  children: React.ReactNode;
}) {
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <g
      role="button"
      aria-label={label}
      aria-disabled={!free}
      tabIndex={free ? 0 : -1}
      {...(free
        ? {
            onClick: () => onSelect(id),
            onKeyDown: handleKeyDown,
            className:
              'anim-stagger-item group cursor-pointer outline-none transition-transform active:scale-[0.94]'
          }
        : { className: 'anim-stagger-item opacity-35' })}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      {children}
    </g>
  );
}

function PlanTable({
  spot,
  label,
  free,
  onSelect
}: {
  spot: TableSpot;
  label: string;
  free: boolean;
  onSelect: (tableId: number) => void;
}) {
  const { id, x, y, w, h } = spot;

  return (
    <PlanSpot id={id} label={label} free={free} onSelect={onSelect}>
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
        {spot.id}
      </text>
    </PlanSpot>
  );
}

/** Concentric rings, so a dartboard never reads as a very small pool table. */
function PlanDartboard({
  spot,
  label,
  displayNumber,
  free,
  onSelect
}: {
  spot: DartSpot;
  label: string;
  displayNumber: string;
  free: boolean;
  onSelect: (tableId: number) => void;
}) {
  const { id, cx, cy, r } = spot;
  const ringClass = free
    ? 'stroke-golden transition-colors group-hover:stroke-golden-hover group-focus-visible:stroke-creme'
    : 'stroke-grey-cool';

  return (
    <PlanSpot id={id} label={label} free={free} onSelect={onSelect}>
      <circle cx={cx} cy={cy} r={r + 14} fill="transparent" />
      <circle cx={cx} cy={cy} r={r} fill="var(--color-club-green-light)" />
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={5} className={ringClass} />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.62}
        fill="none"
        strokeWidth={3}
        className={`${ringClass} opacity-70`}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.3}
        className="fill-club-green transition-colors group-hover:fill-surface-tertiary"
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        className={`text-[26px] font-bold ${free ? 'fill-creme' : 'fill-grey-cool'}`}
      >
        {displayNumber}
      </text>
    </PlanSpot>
  );
}

export function FloorPlan({
  spots,
  freeTableIds,
  onSelect
}: {
  /** Every spot in the room, whatever the guest is currently filtering to */
  spots: readonly Pick<TableDto, 'id' | 'label' | 'kind'>[];
  freeTableIds: ReadonlySet<number>;
  onSelect: (tableId: number) => void;
}) {
  const byId = new Map(spots.map(spot => [spot.id, spot]));
  const nameOf = (id: number, fallbackKind: 'billiard' | 'darts') => {
    const spot = byId.get(id);
    return spotName(spot?.kind ?? fallbackKind, spot?.label ?? id);
  };

  return (
    <div>
      <svg
        viewBox="0 0 1000 580"
        role="group"
        aria-label={msg.step_table_title()}
        className="w-full"
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

        {/* Own group: the stagger cascade indexes by sibling position, and the
            tables must not share a parent with the static room shapes above */}
        <g>
          {TABLES.map(spot => (
            <PlanTable
              key={spot.id}
              spot={spot}
              label={nameOf(spot.id, 'billiard')}
              free={freeTableIds.has(spot.id)}
              onSelect={onSelect}
            />
          ))}
          {DARTBOARDS.filter(spot => byId.has(spot.id)).map(spot => (
            <PlanDartboard
              key={spot.id}
              spot={spot}
              label={nameOf(spot.id, 'darts')}
              displayNumber={byId.get(spot.id)?.label ?? String(spot.id)}
              free={freeTableIds.has(spot.id)}
              onSelect={onSelect}
            />
          ))}
        </g>
      </svg>

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
