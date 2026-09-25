import { round2 } from '../common/money';
import type { Anomaly, Breakdown } from '../db/schema';

export type AnomalyRules = { thresholdPct: number; minDelta: number };
type WeekView = Pick<Breakdown, 'byProject' | 'byService'> & { total: number };

/**
 * Week-over-week spike detection. An item is flagged when it grew by at least `thresholdPct`
 * AND by at least `minDelta` dollars — the absolute floor keeps tiny line items from paging
 * people over a 300% jump from $0.10 to $0.40. Items that appear from nothing are flagged
 * as "new" once they cross the dollar floor.
 */
export function detectAnomalies(previous: WeekView | null, current: WeekView, rules: AnomalyRules): Anomaly[] {
  if (!previous) return [];
  const out: Anomaly[] = [];

  const compare = (dimension: Anomaly['dimension'], key: string, prev: number, curr: number) => {
    const delta = curr - prev;
    if (delta < rules.minDelta) return;
    if (prev <= 0) {
      out.push({ dimension, key, previous: 0, current: round2(curr), delta: round2(delta), changePct: null });
      return;
    }
    const pct = (delta / prev) * 100;
    if (pct >= rules.thresholdPct) {
      out.push({ dimension, key, previous: round2(prev), current: round2(curr), delta: round2(delta), changePct: Math.round(pct * 10) / 10 });
    }
  };

  compare('total', 'All spend', previous.total, current.total);
  for (const key of new Set([...Object.keys(previous.byProject), ...Object.keys(current.byProject)])) {
    compare('project', key, previous.byProject[key] ?? 0, current.byProject[key] ?? 0);
  }
  for (const key of new Set([...Object.keys(previous.byService), ...Object.keys(current.byService)])) {
    compare('service', key, previous.byService[key] ?? 0, current.byService[key] ?? 0);
  }
  return out.sort((a, b) => b.delta - a.delta);
}
