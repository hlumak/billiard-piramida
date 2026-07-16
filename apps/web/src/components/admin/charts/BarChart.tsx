import { useState } from 'react';

export interface BarDatum {
  key: string;
  /** Short axis label; empty string = unlabeled tick (dense time axes) */
  label: string;
  value: number;
  /** Tooltip line(s) */
  tooltip: string;
}

/**
 * Single-series vertical bar chart (dataviz mark specs: thin marks, 4px rounded
 * data ends on the baseline, 2px surface gaps, recessive axes, per-mark hover
 * tooltip, selective direct label on the max only).
 */
export function BarChart({
  data,
  height = 160,
  formatValue
}: {
  data: BarDatum[];
  height?: number;
  formatValue: (value: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 640;
  const paddingBottom = 22;
  const paddingTop = 18;
  const plotHeight = height - paddingBottom - paddingTop;
  const max = Math.max(...data.map(d => d.value), 1);
  const step = width / data.length;
  const barWidth = Math.max(step - 2, 1.5); // 2px surface gap between bars
  const maxIndex = data.findIndex(d => d.value === max);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        {/* Recessive baseline */}
        <line
          x1={0}
          x2={width}
          y1={height - paddingBottom}
          y2={height - paddingBottom}
          className="stroke-deep-cream/25"
          strokeWidth={1}
        />
        {data.map((d, i) => {
          // Floor at 4px, not 3: the path's 4px corner radius needs barHeight ≥ 4,
          // or the `v${barHeight - 4}` segments go negative and dip below the baseline.
          const barHeight = d.value === 0 ? 0 : Math.max((d.value / max) * plotHeight, 4);
          const x = i * step + (step - barWidth) / 2;
          const y = height - paddingBottom - barHeight;
          return (
            <g key={d.key}>
              {/* Bar: rounded data end, square baseline (clip bottom radius) */}
              {barHeight > 0 ? (
                <path
                  d={`M${x} ${height - paddingBottom} v${-(barHeight - 4)} q0 -4 4 -4 h${barWidth - 8} q4 0 4 4 v${barHeight - 4} z`}
                  className={hovered === i ? 'fill-golden-hover' : 'fill-golden'}
                />
              ) : null}
              {/* Oversized hover target */}
              <rect
                x={i * step}
                y={0}
                width={step}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
              {d.label !== '' ? (
                <text
                  x={i * step + step / 2}
                  y={height - 7}
                  textAnchor="middle"
                  className="fill-grey-cool text-[11px]"
                >
                  {d.label}
                </text>
              ) : null}
              {/* Selective direct label: the max only (hover covers the rest) */}
              {i === maxIndex && d.value > 0 ? (
                <text
                  x={Math.min(Math.max(i * step + step / 2, 30), width - 30)}
                  y={y - 5}
                  textAnchor={i * step + step / 2 > width - 60 ? 'end' : 'middle'}
                  className="fill-creme text-[11px] font-semibold"
                >
                  {formatValue(d.value)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hovered !== null && data[hovered] ? (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-club-green px-2.5 py-1.5 text-xs text-creme shadow-lg ring-1 ring-deep-cream/30"
          style={{ left: `${((hovered + 0.5) / data.length) * 100}%` }}
        >
          {data[hovered].tooltip}
        </div>
      ) : null}
    </div>
  );
}
