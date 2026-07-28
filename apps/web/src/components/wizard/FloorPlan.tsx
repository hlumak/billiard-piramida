import type { KeyboardEvent } from 'react';
import type { TableDto } from '@repo/shared';
import { m as msg } from '../../paraglide/messages.js';
import { spotName } from '../../lib/spots';

/**
 * Interactive venue floor plan, drawn from the owner's blueprint.
 *
 * Hall 1 (top) is the bar side: entrance and reception top-left, bar and two
 * WCs along the top wall, tables 1-5 and both dartboards. A wall with a single
 * passage separates it from hall 2 (bottom), which holds tables 6-9 down the
 * window wall, with the cloakroom and two more WCs opposite.
 *
 * Coordinates live in a 1000×1180 viewBox. Tables are drawn oversized relative
 * to the room so they stay tappable when the plan shrinks to phone width, so
 * this is a wayfinding diagram — arrangement is faithful, scale is not.
 */

const HALL_DIVIDER_Y = 545;
/** Gap in the dividing wall — the way through, on the entrance side. */
const PASSAGE = { x: 40, w: 140 };

interface TableSpot {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const TABLES: TableSpot[] = [
  // Hall 1: 1 and 2 sit under the bar; 3, 4 and 5 carry on down the hall past
  // the WCs, which is where the blueprint puts them.
  { id: 1, x: 45, y: 300, w: 175, h: 88 },
  { id: 2, x: 265, y: 300, w: 175, h: 88 },
  { id: 3, x: 570, y: 230, w: 85, h: 170 },
  { id: 4, x: 690, y: 270, w: 160, h: 85 },
  { id: 5, x: 885, y: 230, w: 85, h: 170 },
  // Hall 2 — ids 8-11 read as tables 6-9, see SPOTS in @repo/shared.
  // 140px pitch on a 90px table keeps a 50px gap — wider than the 28px the
  // oversized tap areas add, so neighbouring targets never overlap.
  { id: 8, x: 150, y: 600, w: 190, h: 90 },
  { id: 9, x: 150, y: 740, w: 190, h: 90 },
  { id: 10, x: 150, y: 880, w: 190, h: 90 },
  { id: 11, x: 150, y: 1020, w: 190, h: 90 }
];

interface DartSpot {
  id: number;
  cx: number;
  cy: number;
  r: number;
}

/** Mounted on the wall directly opposite the WCs, as drawn. */
const DARTBOARDS: DartSpot[] = [
  { id: 6, cx: 480, cy: 470, r: 32 },
  { id: 7, cx: 575, cy: 470, r: 32 }
];

/** Fixed rooms along the walls: [x, y, w, h, label]. */
const ROOMS: { x: number; y: number; w: number; h: number; label: () => string }[] = [
  // Hall 1 top wall: reception by the door, then bar, then the two WCs. The
  // wall right of the WCs is open — that stretch of hall holds tables 3-5.
  { x: 30, y: 130, w: 195, h: 110, label: () => msg.plan_reception() },
  { x: 256, y: 30, w: 175, h: 120, label: () => msg.plan_bar() },
  { x: 445, y: 30, w: 88, h: 120, label: () => 'WC' },
  { x: 540, y: 30, w: 88, h: 120, label: () => 'WC' },
  // Hall 2
  { x: 430, y: 600, w: 250, h: 190, label: () => msg.plan_cloakroom() },
  { x: 730, y: 600, w: 210, h: 130, label: () => 'WC' },
  { x: 730, y: 750, w: 210, h: 130, label: () => 'WC' }
];

/** Windows down the exterior wall of hall 2, as on the blueprint. */
const WINDOWS = [620, 760, 900, 1040];

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
  displayNumber,
  free,
  onSelect
}: {
  spot: TableSpot;
  label: string;
  displayNumber: string;
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
        {displayNumber}
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

function Room({
  x,
  y,
  w,
  h,
  label
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        className="fill-club-green-light stroke-deep-cream/30"
        strokeWidth={2}
      />
      <text
        x={x + w / 2}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-creme/90 text-[24px] font-medium"
      >
        {label}
      </text>
    </g>
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
  // Only draw spots the venue actually has, so the plan degrades gracefully if
  // a hall is taken out of service.
  const tables = TABLES.filter(spot => byId.has(spot.id));
  const dartboards = DARTBOARDS.filter(spot => byId.has(spot.id));

  return (
    <div>
      <svg
        viewBox="0 0 1000 1180"
        role="group"
        aria-label={msg.step_table_title()}
        className="w-full"
      >
        {/* Outer walls */}
        <rect
          x={6}
          y={6}
          width={988}
          height={1168}
          rx={26}
          fill="none"
          strokeWidth={3}
          className="stroke-deep-cream/50"
        />

        {/* Entrance: gap in the top wall + inward arrow */}
        <rect x={55} y={2} width={100} height={8} fill="var(--background)" />
        <path
          d="M105 14 v46 m0 0 l-12 -14 m12 14 l12 -14"
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          className="stroke-golden"
        />
        <text x={105} y={95} textAnchor="middle" className="fill-creme/80 text-[22px]">
          {msg.plan_entrance()}
        </text>

        {ROOMS.map(room => (
          <Room key={`${room.x}-${room.y}`} {...room} label={room.label()} />
        ))}

        {/* Wall between the halls, broken by the passage */}
        <line
          x1={6}
          y1={HALL_DIVIDER_Y}
          x2={PASSAGE.x}
          y2={HALL_DIVIDER_Y}
          strokeWidth={3}
          className="stroke-deep-cream/50"
        />
        <line
          x1={PASSAGE.x + PASSAGE.w}
          y1={HALL_DIVIDER_Y}
          x2={994}
          y2={HALL_DIVIDER_Y}
          strokeWidth={3}
          className="stroke-deep-cream/50"
        />

        {/* Windows down the hall-2 exterior wall */}
        {WINDOWS.map(y => (
          <line
            key={y}
            x1={6}
            y1={y}
            x2={6}
            y2={y + 70}
            strokeWidth={9}
            strokeLinecap="round"
            className="stroke-creme/45"
          />
        ))}

        <text x={700} y={185} className="fill-creme/45 text-[22px] font-semibold">
          {msg.plan_hall({ n: 1 })}
        </text>
        <text x={40} y={583} className="fill-creme/45 text-[22px] font-semibold">
          {msg.plan_hall({ n: 2 })}
        </text>

        {/* Own group: the stagger cascade indexes by sibling position, and the
            spots must not share a parent with the static room shapes above */}
        <g>
          {tables.map(spot => (
            <PlanTable
              key={spot.id}
              spot={spot}
              label={nameOf(spot.id, 'billiard')}
              displayNumber={byId.get(spot.id)?.label ?? String(spot.id)}
              free={freeTableIds.has(spot.id)}
              onSelect={onSelect}
            />
          ))}
          {dartboards.map(spot => (
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
