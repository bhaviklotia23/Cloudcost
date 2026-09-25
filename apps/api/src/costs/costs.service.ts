import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { addInto, round2, sumValues, toSortedEntries } from '../common/money';
import { addDays, isWeekComplete, lastCompleteWeekStart, monthStartOf, parseIsoDate, weekRange, weekStartOf } from '../common/week';
import { AwsCostExplorerProvider } from '../aws/providers/aws-cost-explorer.provider';
import type { CostProvider } from '../aws/providers/cost-provider';
import { DemoCostProvider } from '../aws/providers/demo.provider';
import { DB, Db } from '../db/db.module';
import { AwsAccount, awsAccounts, CostSnapshot, costSnapshots, organizations } from '../db/schema';
import { detectAnomalies } from './anomalies';

export const BACKFILL_WEEKS = 12;

type Aggregate = { byProject: Record<string, number>; byService: Record<string, number>; total: number };

@Injectable()
export class CostsService {
  private readonly logger = new Logger(CostsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly aws: AwsCostExplorerProvider,
    private readonly demo: DemoCostProvider,
  ) {}

  providerFor(account: Pick<AwsAccount, 'provider'>): CostProvider {
    return account.provider === 'demo' ? this.demo : this.aws;
  }

  /** Weeks to pull on first connect: the last BACKFILL_WEEKS complete weeks plus the current one. */
  backfillWeeks(now: Date): string[] {
    return [...weekRange(lastCompleteWeekStart(now), BACKFILL_WEEKS), weekStartOf(now)];
  }

  /**
   * Daily refresh: the in-progress week, plus last week — Cost Explorer keeps revising
   * the most recent days for ~24-48h, so last week is re-pulled until it settles.
   */
  refreshWeeks(now: Date): string[] {
    return [lastCompleteWeekStart(now), weekStartOf(now)];
  }

  /** Pulls the given weeks for one account and upserts snapshots. Idempotent. */
  async syncAccount(accountId: string, weeks: string[], now = new Date()): Promise<void> {
    const account = await this.db.query.awsAccounts.findFirst({ where: eq(awsAccounts.id, accountId) });
    if (!account) {
      this.logger.warn(`Skipping sync: account ${accountId} no longer exists`);
      return;
    }
    if (account.status !== 'connected') {
      this.logger.warn(`Skipping sync: account ${accountId} is ${account.status}`);
      return;
    }
    const provider = this.providerFor(account);

    for (const weekStart of [...weeks].sort()) {
      const costs = await provider.fetchWeek(account, weekStart, now);
      await this.db
        .insert(costSnapshots)
        .values({
          awsAccountId: account.id,
          weekStart,
          totalCost: costs.total,
          currency: costs.currency,
          breakdownJson: { byProject: costs.byProject, byService: costs.byService, daily: costs.daily },
          isComplete: isWeekComplete(weekStart, now),
          syncedAt: now,
        })
        .onConflictDoUpdate({
          target: [costSnapshots.awsAccountId, costSnapshots.weekStart],
          set: {
            totalCost: costs.total,
            currency: costs.currency,
            breakdownJson: { byProject: costs.byProject, byService: costs.byService, daily: costs.daily },
            isComplete: isWeekComplete(weekStart, now),
            syncedAt: now,
          },
        });
    }

    // A re-synced week changes its own comparison and the following week's comparison.
    const touched = new Set(weeks.flatMap((w) => [w, addDays(w, 7)]));
    for (const w of touched) await this.recomputeAnomalies(account, w);

    await this.db.update(awsAccounts).set({ lastSyncedAt: now, lastError: null }).where(eq(awsAccounts.id, account.id));
  }

  async recomputeAnomalies(account: AwsAccount, weekStart: string): Promise<void> {
    const org = await this.db.query.organizations.findFirst({ where: eq(organizations.id, account.orgId) });
    const snaps = await this.db
      .select()
      .from(costSnapshots)
      .where(
        and(
          eq(costSnapshots.awsAccountId, account.id),
          inArray(costSnapshots.weekStart, [addDays(weekStart, -7), weekStart]),
        ),
      );
    const current = snaps.find((s) => s.weekStart === weekStart);
    if (!current || !org) return;
    const previous = snaps.find((s) => s.weekStart !== weekStart) ?? null;

    // Comparing a half-finished week against a full one would flag everything as a drop and
    // hide real spikes, so anomalies are only computed on complete weeks.
    const anomalies = current.isComplete
      ? detectAnomalies(previous && view(previous), view(current), {
          thresholdPct: org.anomalyThresholdPct,
          minDelta: org.anomalyMinDelta,
        })
      : [];
    await this.db.update(costSnapshots).set({ anomalies }).where(eq(costSnapshots.id, current.id));
  }

  /**
   * Everything the dashboard needs in one round-trip, rolled up across every connected account
   * in the org (or scoped to one account).
   */
  async dashboard(orgId: string, opts: { accountId?: string; weeks: number; now?: Date }) {
    const now = opts.now ?? new Date();
    const accounts = await this.db
      .select()
      .from(awsAccounts)
      .where(and(eq(awsAccounts.orgId, orgId), eq(awsAccounts.status, 'connected')));
    const scoped = opts.accountId ? accounts.filter((a) => a.id === opts.accountId) : accounts;
    if (opts.accountId && scoped.length === 0) throw new NotFoundException('AWS account not found');

    const currentWeek = weekStartOf(now);
    const weeks = weekRange(currentWeek, opts.weeks);
    const monthStart = monthStartOf(now);
    // Load enough history for both the trend window and month-to-date.
    const monthFirstWeek = weekStartOf(parseIsoDate(monthStart));
    const fromWeek = weeks[0] < monthFirstWeek ? weeks[0] : monthFirstWeek;

    const snaps: CostSnapshot[] = scoped.length
      ? await this.db
          .select()
          .from(costSnapshots)
          .where(
            and(
              inArray(costSnapshots.awsAccountId, scoped.map((a) => a.id)),
              gte(costSnapshots.weekStart, fromWeek),
              lt(costSnapshots.weekStart, addDays(currentWeek, 7)),
            ),
          )
          .orderBy(asc(costSnapshots.weekStart))
      : [];

    // Roll up per week across accounts.
    const perWeek = new Map<string, Aggregate>();
    for (const s of snaps) {
      const agg = perWeek.get(s.weekStart) ?? { byProject: {}, byService: {}, total: 0 };
      for (const [k, v] of Object.entries(s.breakdownJson.byProject)) addInto(agg.byProject, k, v);
      for (const [k, v] of Object.entries(s.breakdownJson.byService)) addInto(agg.byService, k, v);
      agg.total += s.totalCost;
      perWeek.set(s.weekStart, agg);
    }

    // Anomalies are derived live from the rolled-up numbers (not the per-snapshot copies), so a
    // service spiking in two accounts shows as one combined flag and threshold changes apply instantly.
    const org = await this.db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    const rules = { thresholdPct: org?.anomalyThresholdPct ?? 30, minDelta: org?.anomalyMinDelta ?? 10 };

    const latestComplete = lastCompleteWeekStart(now);
    const latest = perWeek.get(latestComplete);
    const prior = perWeek.get(addDays(latestComplete, -7));
    const anomalies = latest ? detectAnomalies(prior ?? null, latest, rules) : [];

    const monthToDate = round2(
      snaps
        .flatMap((s) => s.breakdownJson.daily)
        .filter((d) => d.date >= monthStart)
        .reduce((sum, d) => sum + d.amount, 0),
    );

    const trend = weeks.map((w) => {
      const agg = perWeek.get(w);
      return {
        weekStart: w,
        total: agg ? round2(agg.total) : null,
        isComplete: w < currentWeek,
        byProject: agg ? roundRecord(agg.byProject) : {},
      };
    });

    return {
      currency: snaps[0]?.currency ?? 'USD',
      accounts: accounts.map((a) => ({ id: a.id, nickname: a.accountNickname, provider: a.provider, lastSyncedAt: a.lastSyncedAt })),
      scope: opts.accountId ?? 'all',
      hasData: snaps.length > 0,
      monthToDate: { month: monthStart.slice(0, 7), total: monthToDate },
      currentWeek: {
        weekStart: currentWeek,
        total: round2(perWeek.get(currentWeek)?.total ?? 0),
      },
      latestWeek: latest
        ? {
            weekStart: latestComplete,
            total: round2(latest.total),
            previousTotal: prior ? round2(prior.total) : null,
            changePct: prior && prior.total > 0 ? Math.round(((latest.total - prior.total) / prior.total) * 1000) / 10 : null,
            byProject: withChange(latest.byProject, prior?.byProject),
            byService: withChange(latest.byService, prior?.byService),
          }
        : null,
      anomalies,
      trend,
    };
  }

  /** Data for the weekly digest email. */
  async digestData(orgId: string, now = new Date()) {
    const d = await this.dashboard(orgId, { weeks: 8, now });
    return d.latestWeek ? d : null;
  }
}

function view(s: CostSnapshot) {
  return { byProject: s.breakdownJson.byProject, byService: s.breakdownJson.byService, total: s.totalCost };
}

function roundRecord(r: Record<string, number>) {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round2(v)]));
}

function withChange(current: Record<string, number>, previous?: Record<string, number>) {
  const total = sumValues(current);
  return toSortedEntries(current).map(({ key, amount }) => {
    const prev = previous?.[key] ?? 0;
    return {
      key,
      amount: round2(amount),
      previous: round2(prev),
      share: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
      changePct: prev > 0 ? Math.round(((amount - prev) / prev) * 1000) / 10 : null,
    };
  });
}
