import type { ResultByTime } from '@aws-sdk/client-cost-explorer';
import { addInto, round4 } from '../../common/money';
import type { WeekCosts } from './cost-provider';

export const UNTAGGED = 'Untagged';

/**
 * Cost Explorer returns tag group keys as "<TagKey>$<value>" — e.g. "Project$checkout-api",
 * or "Project$" for resources missing the tag. Normalise to the bare value.
 */
export function tagValue(groupKey: string, tagKey: string): string {
  const prefix = `${tagKey}$`;
  const value = groupKey.startsWith(prefix) ? groupKey.slice(prefix.length) : groupKey;
  return value.trim() === '' ? UNTAGGED : value;
}

/**
 * Folds DAILY GetCostAndUsage results grouped by [TAG <tagKey>, DIMENSION SERVICE] into
 * per-project, per-service and per-day totals. One API call yields all three views,
 * which matters because Cost Explorer bills $0.01 per request.
 */
export function parseCostExplorerResults(results: ResultByTime[], tagKey: string, metric = 'UnblendedCost'): WeekCosts {
  const byProject: Record<string, number> = {};
  const byService: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  let currency = 'USD';

  for (const period of results) {
    const date = period.TimePeriod?.Start;
    if (!date) continue;
    byDay[date] ??= 0;
    for (const group of period.Groups ?? []) {
      const m = group.Metrics?.[metric];
      const amount = Number(m?.Amount ?? 0);
      if (!Number.isFinite(amount) || amount === 0) continue;
      if (m?.Unit) currency = m.Unit;
      const [tagKeyRaw = '', service = 'Other'] = group.Keys ?? [];
      addInto(byProject, tagValue(tagKeyRaw, tagKey), amount);
      addInto(byService, service, amount);
      addInto(byDay, date, amount);
    }
  }

  const round = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round4(v)]));
  const daily = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount: round4(amount) }));

  return {
    byProject: round(byProject),
    byService: round(byService),
    daily,
    total: round4(daily.reduce((s, d) => s + d.amount, 0)),
    currency,
  };
}
