import type { KeyboardEvent } from 'react';
import type { TableDto } from '@repo/shared';
import { sizeOf } from '@repo/shared';
import { m as msg } from '../../paraglide/messages.js';
import { spotName } from '../../lib/spots';

/**
 * Interactive venue floor plan, traced from the owner's blueprint.
 *
 * The building is an L. Guests enter from the west into a vestibule — reception
 * on the left, bar and two WCs along the north wall — and turn south into
 * hall 1, which runs east past tables 1-5 with both dartboards on the dividing
 * wall. That wall has a single passage, on the entrance side, down into hall 2:
 * tables 6-9 in a row, staff rooms behind the west partition. A utility room and
 * two more WCs sit in the annex that hangs south off hall 1's east end.
 *
 * Geometry is traced 1:1 from the blueprint into a 1000×1190 viewBox, so the
 * arrangement is faithful; scale is not. Tables are drawn a little oversized
 * and every spot carries a padded invisible hit area, so targets stay tappable
 * when the plan shrinks to phone width.
 */

/**
 * Outer and interior walls. Every break in a run is a real opening on the
 * blueprint — the entrance in the west wall, the mouth of hall 1, the single
 * passage between the halls, and the doorways of the staff rooms.
 */
const WALLS = [
  // Vestibule: north wall, then east wall down to hall 1's north wall
  'M29 39V37A27 27 0 0 1 56 10H266A26 26 0 0 1 292 36V225',
  // West wall, hall 2's south wall, and back up hall 2's east wall
  'M29 87V1151A25 25 0 0 0 54 1176H515A38 38 0 0 0 553 1138V493',
  // Hall 1: north wall, east wall, then west along the wall dividing the halls
  'M292 225H967A25 25 0 0 1 992 250V465A28 28 0 0 0 964 493H139',
  // The stub of that wall west of the passage
  'M29 493H76',
  // Partition walling the staff rooms off hall 2, with two doorways
  'M235 493V660',
  'M235 724V951',
  'M235 999V1176',
  // Staff room walls
  'M29 797H150',
  'M198 797H235',
  'M29 871H235',
  // The annex corridor reaching east to the cloakroom and WCs
  'M553 727H815V783A24 24 0 0 1 791 807H553'
];

/**
 * Every table is drawn the same box — the plan is schematic about size, and the
 * 9ft/12ft split is carried by the caption on the table, not by its footprint.
 * The vertical ones are just this box turned.
 */
const T_LONG = 123;
const T_SHORT = 61;

interface TableSpot {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const across = (x: number, y: number) => ({ x, y, w: T_LONG, h: T_SHORT });
const down = (x: number, y: number) => ({ x, y, w: T_SHORT, h: T_LONG });

const TABLES: TableSpot[] = [
  // Hall 1: 1 and 2 step down the hall from the entrance, then 3, 4 and 5 line
  // the east end — 3 and 5 turned end-on to fit between the walls.
  { id: 1, ...across(66, 305) },
  { id: 2, ...across(295, 342) },
  { id: 3, ...down(599, 301) },
  { id: 4, ...across(714, 331) },
  { id: 5, ...down(893, 301) },
  // Hall 2 — ids 8-11 read as tables 6-9, see SPOTS in @repo/shared. The 135
  // pitch on a 61-tall table leaves a 74 gap, wider than the 28 the padded hit
  // areas add, so neighbouring targets never overlap.
  { id: 8, ...across(331, 603) },
  { id: 9, ...across(331, 738) },
  { id: 10, ...across(331, 873) },
  { id: 11, ...across(331, 1008) }
];

interface DartSpot {
  id: number;
  cx: number;
  cy: number;
  r: number;
}

/** Mounted on the wall dividing the halls, just east of the passage. */
const DARTBOARDS: DartSpot[] = [
  { id: 6, cx: 457, cy: 453, r: 21 },
  { id: 7, cx: 524, cy: 453, r: 21 }
];

/**
 * Fixed rooms. `d` is the shape — the blueprint chamfers the reception toward
 * the door and rounds the corners the guest walks around — and `tx`/`ty` centre
 * the label in whatever space the room leaves. A room with a doorway carries an
 * `outline` to stroke instead, so the shape can stay closed for filling.
 */
const ROOMS: {
  d: string;
  outline?: string;
  tx: number;
  ty: number;
  size: number;
  label: () => string;
}[] = [
  {
    d: 'M29 90H133L204 154V225H29Z',
    // South wall stops short of the east corner: the way out to hall 1
    outline: 'M140 225H29V90H133L204 154V225',
    tx: 109,
    ty: 161,
    size: 24,
    label: () => msg.plan_reception()
  },
  { d: 'M292 119H412V225H292Z', tx: 352, ty: 172, size: 20, label: () => msg.plan_bar() },
  { d: 'M412 119H482V225H412Z', tx: 447, ty: 172, size: 20, label: () => 'WC' },
  {
    d: 'M482 119H529A27 27 0 0 1 556 146V225H482Z',
    tx: 519,
    ty: 172,
    size: 20,
    label: () => 'WC'
  },
  {
    d: 'M654 727V643A24 24 0 0 1 678 619H747V727Z',
    tx: 696,
    ty: 673,
    // Two long words in every locale, and the room is only 93 wide — 12 is what
    // keeps the longest of them ("Pomieszczenie") inside it once wrapped
    size: 12,
    label: () => msg.plan_utility()
  },
  {
    d: 'M747 658V603A15 15 0 0 1 762 588H800A15 15 0 0 1 815 603V658Z',
    tx: 781,
    ty: 618,
    size: 16,
    label: () => 'WC'
  },
  { d: 'M747 658H815V727H747Z', tx: 781, ty: 692, size: 16, label: () => 'WC' }
];

/** One shape for every room, so the fill can go down in a single pass. */
const ROOM_FILLS = ROOMS.map(room => room.d).join(' ');

/**
 * Walls and room outlines stroke as ONE path on purpose. Rooms share edges with
 * each other and sit flush against the walls, and the stroke is translucent —
 * drawn as separate paths, every shared edge would blend twice and read brighter
 * than the wall it continues.
 */
const OUTLINES = [...WALLS, ...ROOMS.map(room => room.outline ?? room.d)].join(' ');

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
  size,
  free,
  onSelect
}: {
  spot: TableSpot;
  label: string;
  displayNumber: string;
  /** Cloth size, suffixed to the number — 9ft and 12ft bill apart */
  size: string | null;
  free: boolean;
  onSelect: (tableId: number) => void;
}) {
  const { id, x, y, w, h } = spot;
  const cx = x + w / 2;
  const cy = y + h / 2;

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
        x={x + 10}
        y={y + 10}
        width={w - 20}
        height={h - 20}
        rx={6}
        className="fill-club-green transition-colors group-hover:fill-surface-tertiary"
      />
      {pocketCenters(spot).map(([px, py]) => (
        <circle key={`${px}-${py}`} cx={px} cy={py} r={5} className="fill-black/60" />
      ))}
      {/* Number and size share one centred line rather than stacking: the two
          middle pockets sit dead centre on the long sides, and a second line
          would land on one. End-on tables read side-on, the way the blueprint
          labels them — the rotation is about the centre, so the pair turns whole. */}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        transform={h > w ? `rotate(-90 ${cx} ${cy})` : undefined}
        className={`text-[26px] font-bold ${free ? 'fill-creme' : 'fill-grey-cool'}`}
      >
        {displayNumber}
        {/* The gap is a non-breaking space — SVG collapses an ordinary one */}
        {size ? (
          <tspan className={`text-[15px] ${free ? 'fill-golden' : 'fill-grey-cool'}`}>
            {` ${size}`}
          </tspan>
        ) : null}
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
      {/* The pair sits 67 apart, so 12 is all the padding that fits between */}
      <circle cx={cx} cy={cy} r={r + 12} fill="transparent" />
      <circle cx={cx} cy={cy} r={r} fill="var(--color-club-green-light)" />
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={4} className={ringClass} />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.62}
        fill="none"
        strokeWidth={2.5}
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
        className={`text-[16px] font-bold ${free ? 'fill-creme' : 'fill-grey-cool'}`}
      >
        {displayNumber}
      </text>
    </PlanSpot>
  );
}

/**
 * Room labels shrink with the room, which is why the size travels with them.
 * Multi-word names wrap one word per line and centre as a block — SVG text does
 * not wrap on its own, and "Pomieszczenie gospodarcze" overruns its room on one.
 */
function RoomLabel({
  tx,
  ty,
  size,
  label
}: {
  tx: number;
  ty: number;
  size: number;
  label: string;
}) {
  const lineHeight = size * 1.15;
  // dy stacks each word under the last, so only the first line takes the anchor
  let dy = 0;
  const lines = label.split(' ').map(word => {
    const line = { word, dy };
    dy = lineHeight;
    return line;
  });

  return (
    <text
      x={tx}
      y={ty - ((lines.length - 1) * lineHeight) / 2}
      textAnchor="middle"
      dominantBaseline="central"
      className="fill-creme/90 font-medium"
      style={{ fontSize: size }}
    >
      {lines.map(line => (
        <tspan key={line.word} x={tx} dy={line.dy}>
          {line.word}
        </tspan>
      ))}
    </text>
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
  // Screen readers get the size too — on the plan it is drawn, not spoken
  const nameOf = (id: number, fallbackKind: 'billiard' | 'darts') => {
    const spot = byId.get(id);
    const name = spotName(spot?.kind ?? fallbackKind, spot?.label ?? id);
    const size = sizeOf(id);
    return size ? `${name}, ${size}` : name;
  };
  // Only draw spots the venue actually has, so the plan degrades gracefully if
  // a hall is taken out of service.
  const tables = TABLES.filter(spot => byId.has(spot.id));
  const dartboards = DARTBOARDS.filter(spot => byId.has(spot.id));

  return (
    <div>
      <svg
        viewBox="0 0 1000 1190"
        role="group"
        aria-label={msg.step_table_title()}
        className="w-full"
      >
        <path d={ROOM_FILLS} className="fill-club-green-light" />
        <path
          d={OUTLINES}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-deep-cream/50"
        />
        {ROOMS.map(room => (
          <RoomLabel key={room.d} tx={room.tx} ty={room.ty} size={room.size} label={room.label()} />
        ))}

        {/* Entrance: in from the west, then south into hall 1 */}
        <g
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-golden"
        >
          <path d="M10 64H143M126 47L143 64L126 81" />
          <path d="M247 132V265M230 248L247 265L264 248" />
        </g>
        <text
          x={215}
          y={80}
          textAnchor="middle"
          dominantBaseline="central"
          transform="rotate(50 215 80)"
          className="fill-creme/80 text-[22px]"
        >
          {msg.plan_entrance()}
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
              size={sizeOf(spot.id)}
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
