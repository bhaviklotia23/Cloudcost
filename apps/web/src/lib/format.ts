export function money(n: number, currency = 'USD', opts: { compact?: boolean } = {}) {
  if (opts.compact && Math.abs(n) >= 10_000) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n);
}

export function axisMoney(n: number) {
  if (n >= 1000) return `$${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
  return `$${Math.round(n)}`;
}

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (date: Date, o: Intl.DateTimeFormatOptions) => date.toLocaleDateString('en-US', { timeZone: 'UTC', ...o });

export const shortDate = (iso: string) => fmt(d(iso), { month: 'short', day: 'numeric' });

export function weekLabel(weekStart: string) {
  const start = d(weekStart);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
}

export function monthLabel(yyyyMm: string) {
  return fmt(d(`${yyyyMm}-01`), { month: 'long', year: 'numeric' });
}

export function relativeTime(iso: string | null) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function pct(n: number | null, digits = 1) {
  if (n === null) return 'new';
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}
