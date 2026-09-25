import clsx from 'clsx';
import { money, pct } from '@/lib/format';
import type { BreakdownRow } from '@/lib/types';

/**
 * Ranked horizontal bars for one week's breakdown. Bar length = share of spend; the
 * week-over-week change sits in its own column in text tokens (arrow + sign, never colour alone).
 */
export function BreakdownList({
  rows,
  currency,
  colorFor,
  limit = 8,
}: {
  rows: BreakdownRow[];
  currency: string;
  colorFor: (key: string) => string;
  limit?: number;
}) {
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const max = Math.max(...shown.map((r) => r.amount), 1);
  return (
    <ul className="space-y-3">
      {shown.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink" title={r.key}>
              {r.key}
            </span>
            <span className="flex shrink-0 items-baseline gap-3">
              <span className="tnum font-medium text-ink">{money(r.amount, currency)}</span>
              <Change value={r.changePct} />
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(1.5, (r.amount / max) * 100)}%`, background: colorFor(r.key) }} />
          </div>
        </li>
      ))}
      {rest.length > 0 && (
        <li className="text-xs text-muted">
          + {rest.length} more ({money(rest.reduce((s, r) => s + r.amount, 0), currency)})
        </li>
      )}
    </ul>
  );
}

export function Change({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={clsx('w-16 text-right text-xs text-muted', className)}>new</span>;
  const up = value > 0.05;
  const down = value < -0.05;
  return (
    <span
      className={clsx('tnum w-16 text-right text-xs', up ? 'text-critical' : down ? 'text-good' : 'text-muted', className)}
      aria-label={`${pct(value)} week over week`}
    >
      {up ? '▲' : down ? '▼' : '•'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}
