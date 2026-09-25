'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { axisMoney, money, shortDate, weekLabel } from '@/lib/format';
import type { Dashboard } from '@/lib/types';
import type { Series } from './series';

type Props = {
  trend: Dashboard['trend'];
  series: Series[];
  fold: (key: string) => string;
  currency: string;
};

const H = 260;
const PAD = { top: 16, right: 8, bottom: 28, left: 52 };
const GAP = 2; // surface gap between stacked segments
const RADIUS = 4;

function niceMax(v: number) {
  if (v <= 0) return 100;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => n <= s) ?? 10;
  return step * exp;
}

/** Path for a column segment: rounded top corners only when it's the top of the stack. */
function segPath(x: number, y: number, w: number, h: number, roundTop: boolean) {
  const r = roundTop ? Math.min(RADIUS, h, w / 2) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/**
 * Weekly spend as stacked columns by project. Hand-rolled SVG (no chart lib) so the mark
 * specs are exact: <=24px columns, 2px surface gaps, 4px rounded data-ends, hairline grid,
 * one y-axis, and a hover tooltip per week. The in-progress week is drawn at reduced opacity.
 */
export function TrendChart({ trend, series, fold, currency }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const weeks = useMemo(
    () =>
      trend.map((t) => {
        const folded: Record<string, number> = {};
        for (const [k, v] of Object.entries(t.byProject)) folded[fold(k)] = (folded[fold(k)] ?? 0) + v;
        return { ...t, folded };
      }),
    [trend, fold],
  );

  const max = niceMax(Math.max(...weeks.map((w) => w.total ?? 0)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / weeks.length;
  const colW = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const labelEvery = band < 34 ? Math.ceil(34 / band) : 1;
  // Draw order bottom-up: named projects first, Other/Untagged on top.
  const order = series.map((s) => s.key);
  const colorOf = Object.fromEntries(series.map((s) => [s.key, s.color]));
  const hovered = hover !== null ? weeks[hover] : null;

  return (
    <div ref={wrap} className="relative">
      <svg width={width} height={H} role="img" aria-label="Weekly AWS spend by project" className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--baseline)' : 'var(--grid)'} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tnum" fontSize={11} fill="var(--muted)">
              {axisMoney(t)}
            </text>
          </g>
        ))}

        {weeks.map((w, i) => {
          const cx = PAD.left + band * i + band / 2;
          const x = cx - colW / 2;
          let base = 0;
          const present = order.filter((k) => (w.folded[k] ?? 0) > 0);
          const segments = present.map((k, idx) => {
            const v = w.folded[k];
            const y0 = y(base);
            const y1 = y(base + v);
            base += v;
            const isTop = idx === present.length - 1;
            // Gap is carved from the top of each lower segment so the stack height stays true.
            const h = Math.max(0, y0 - y1 - (isTop ? 0 : GAP));
            return <path key={k} d={segPath(x, y1 + (isTop ? 0 : GAP), colW, h, isTop)} fill={colorOf[k]} />;
          });
          return (
            <g key={w.weekStart} opacity={w.isComplete ? 1 : 0.45}>
              {segments}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {shortDate(w.weekStart)}
                </text>
              )}
            </g>
          );
        })}

        {/* Hit targets: the whole band, bigger than the mark. */}
        {weeks.map((w, i) => (
          <rect
            key={w.weekStart}
            x={PAD.left + band * i}
            y={PAD.top}
            width={band}
            height={innerH}
            fill={hover === i ? 'var(--ink)' : 'transparent'}
            fillOpacity={hover === i ? 0.04 : 0}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`${weekLabel(w.weekStart)}: ${w.total === null ? 'no data' : money(w.total, currency)}`}
          />
        ))}
      </svg>

      {hovered && hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-56 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg"
          // Sit beside the hovered column (never on top of it), flipping sides past the midpoint.
          style={{
            left:
              PAD.left + band * (hover + 0.5) > width / 2
                ? Math.max(0, PAD.left + band * hover - 224 - 4)
                : Math.min(width - 224, PAD.left + band * (hover + 1) + 4),
            top: PAD.top,
          }}
        >
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="font-medium text-ink">{weekLabel(hovered.weekStart)}</span>
            {!hovered.isComplete && <span className="text-muted">in progress</span>}
          </div>
          <div className="mb-2 text-base font-semibold text-ink tnum">
            {hovered.total === null ? '—' : money(hovered.total, currency)}
          </div>
          <ul className="space-y-1">
            {[...order]
              .reverse()
              .filter((k) => (hovered.folded[k] ?? 0) > 0)
              .map((k) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
                    <span className="size-2 shrink-0 rounded-sm" style={{ background: colorOf[k] }} />
                    <span className="truncate">{k}</span>
                  </span>
                  <span className="tnum text-ink">{money(hovered.folded[k], currency)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.key}
        </li>
      ))}
    </ul>
  );
}
