import { Injectable } from '@nestjs/common';
import { addInto, round4 } from '../../common/money';
import { addDays, costExplorerPeriod, lastCompleteWeekStart, parseIsoDate } from '../../common/week';
import type { AwsAccount } from '../../db/schema';
import type { CostProvider, WeekCosts } from './cost-provider';

/** Deterministic hash -> [0, 1). Same inputs always give the same synthetic bill. */
function rand(...parts: string[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

const S = {
  ec2: 'Amazon Elastic Compute Cloud - Compute',
  rds: 'Amazon Relational Database Service',
  s3: 'Amazon Simple Storage Service',
  lambda: 'AWS Lambda',
  cloudfront: 'Amazon CloudFront',
  sagemaker: 'Amazon SageMaker',
  elasticache: 'Amazon ElastiCache',
  dynamo: 'Amazon DynamoDB',
  glue: 'AWS Glue',
  cloudwatch: 'AmazonCloudWatch',
  nat: 'EC2 - Other',
};

/** Daily $ per project, and how that project's spend splits across services. */
const PROJECTS: { name: string; daily: number; mix: [string, number][] }[] = [
  { name: 'checkout-api', daily: 42, mix: [[S.ec2, 0.42], [S.rds, 0.3], [S.elasticache, 0.12], [S.nat, 0.1], [S.cloudwatch, 0.06]] },
  { name: 'data-pipeline', daily: 27, mix: [[S.glue, 0.38], [S.s3, 0.27], [S.lambda, 0.2], [S.dynamo, 0.15]] },
  { name: 'ml-training', daily: 16, mix: [[S.sagemaker, 0.7], [S.s3, 0.18], [S.ec2, 0.12]] },
  { name: 'marketing-site', daily: 5, mix: [[S.cloudfront, 0.55], [S.s3, 0.3], [S.lambda, 0.15]] },
  { name: 'Untagged', daily: 8, mix: [[S.ec2, 0.5], [S.nat, 0.3], [S.cloudwatch, 0.2]] },
];

/**
 * Synthetic provider used for local development and the public demo — no AWS account needed.
 * Produces a believable bill: weekday/weekend rhythm, slow organic growth, noise, and a
 * GPU-training spike in the most recent complete week so the anomaly flag has something to show.
 */
@Injectable()
export class DemoCostProvider implements CostProvider {
  async fetchWeek(account: AwsAccount, weekStart: string, now: Date): Promise<WeekCosts> {
    const period = costExplorerPeriod(weekStart, now);
    const byProject: Record<string, number> = {};
    const byService: Record<string, number> = {};
    const daily: { date: string; amount: number }[] = [];
    if (!period) return { byProject, byService, daily, total: 0, currency: 'USD' };

    const scale = 0.6 + rand(account.id, 'scale') * 0.8;
    const spikeWeek = lastCompleteWeekStart(now);
    const weeksAgo = Math.round((parseIsoDate(spikeWeek).getTime() - parseIsoDate(weekStart).getTime()) / 604_800_000);

    for (let date = period.start; date < period.end; date = addDays(date, 1)) {
      const dow = parseIsoDate(date).getUTCDay();
      const weekend = dow === 0 || dow === 6 ? 0.78 : 1;
      const growth = Math.pow(0.992, weeksAgo); // ~0.8%/week organic growth
      let dayTotal = 0;
      for (const p of PROJECTS) {
        let factor = scale * weekend * growth * (0.9 + rand(account.id, p.name, date) * 0.2);
        if (p.name === 'ml-training' && weekStart === spikeWeek && dow >= 2 && dow <= 5) factor *= 3.4;
        if (p.name === 'data-pipeline' && weeksAgo === 5) factor *= 1.55; // backfill job, 5 weeks ago
        for (const [service, share] of p.mix) {
          const amount = p.daily * share * factor;
          addInto(byProject, p.name, amount);
          addInto(byService, service, amount);
          dayTotal += amount;
        }
      }
      daily.push({ date, amount: round4(dayTotal) });
    }

    const round = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round4(v)]));
    return {
      byProject: round(byProject),
      byService: round(byService),
      daily,
      total: round4(daily.reduce((s, d) => s + d.amount, 0)),
      currency: 'USD',
    };
  }

  async verify(): Promise<void> {}
}
