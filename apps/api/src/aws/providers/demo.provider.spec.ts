import type { AwsAccount } from '../../db/schema';
import { DemoCostProvider } from './demo.provider';

describe('DemoCostProvider', () => {
  const provider = new DemoCostProvider();
  const account = { id: 'demo-account-1' } as AwsAccount;
  const now = new Date('2026-09-25T12:00:00Z');

  it('is deterministic', async () => {
    expect(await provider.fetchWeek(account, '2026-09-07', now)).toEqual(await provider.fetchWeek(account, '2026-09-07', now));
  });

  it('produces consistent totals across views', async () => {
    const w = await provider.fetchWeek(account, '2026-09-07', now);
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(w.daily).toHaveLength(7);
    expect(sum(w.byProject)).toBeCloseTo(w.total, 1);
    expect(sum(w.byService)).toBeCloseTo(w.total, 1);
  });

  it('only returns days up to today for the in-progress week', async () => {
    const w = await provider.fetchWeek(account, '2026-09-21', now);
    expect(w.daily.map((d) => d.date)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
  });

  it('puts a spike in the latest complete week', async () => {
    const before = await provider.fetchWeek(account, '2026-09-07', now);
    const spike = await provider.fetchWeek(account, '2026-09-14', now);
    expect(spike.byProject['ml-training']).toBeGreaterThan(before.byProject['ml-training'] * 1.5);
  });
});
