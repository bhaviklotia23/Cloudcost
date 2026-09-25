import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostAndUsageCommandOutput,
  ResultByTime,
} from '@aws-sdk/client-cost-explorer';
import { Injectable, Logger } from '@nestjs/common';
import { addDays, costExplorerPeriod, toIsoDate } from '../../common/week';
import type { AwsAccount } from '../../db/schema';
import { StsService } from '../sts.service';
import { AccountConnectionError, CostProvider, WeekCosts } from './cost-provider';
import { parseCostExplorerResults } from './parse-cost-explorer';

const METRIC = 'UnblendedCost';
// Cost Explorer is a global service served from us-east-1.
const CE_REGION = 'us-east-1';
const MAX_PAGES = 20;

@Injectable()
export class AwsCostExplorerProvider implements CostProvider {
  private readonly logger = new Logger(AwsCostExplorerProvider.name);

  constructor(private readonly sts: StsService) {}

  async fetchWeek(account: AwsAccount, weekStart: string, now: Date): Promise<WeekCosts> {
    const period = costExplorerPeriod(weekStart, now);
    if (!period) return { byProject: {}, byService: {}, daily: [], total: 0, currency: 'USD' };

    const client = await this.client(account);
    const results: ResultByTime[] = [];
    let token: string | undefined;
    let pages = 0;
    do {
      const out: GetCostAndUsageCommandOutput = await client.send(
        new GetCostAndUsageCommand({
          TimePeriod: { Start: period.start, End: period.end },
          Granularity: 'DAILY',
          Metrics: [METRIC],
          GroupBy: [
            { Type: 'TAG', Key: account.costTagKey },
            { Type: 'DIMENSION', Key: 'SERVICE' },
          ],
          NextPageToken: token,
        }),
      );
      results.push(...(out.ResultsByTime ?? []));
      token = out.NextPageToken;
    } while (token && ++pages < MAX_PAGES);

    this.logger.log(`Fetched ${weekStart} for account ${account.id} (${pages + 1} page(s))`);
    return parseCostExplorerResults(results, account.costTagKey, METRIC);
  }

  /** Proves both halves of the setup: the role is assumable, and Cost Explorer is readable. */
  async verify(account: AwsAccount): Promise<void> {
    let client: CostExplorerClient;
    try {
      client = await this.client(account);
    } catch (err) {
      throw new AccountConnectionError(
        "CloudCost couldn't assume this role. Check that the role's trust policy allows CloudCost's " +
          'principal and requires the exact External ID shown in the setup steps.',
        (err as { name?: string }).name ?? 'AssumeRoleFailed',
      );
    }
    try {
      const today = toIsoDate(new Date());
      await client.send(
        new GetCostAndUsageCommand({
          TimePeriod: { Start: addDays(today, -2), End: today },
          Granularity: 'DAILY',
          Metrics: [METRIC],
        }),
      );
    } catch (err) {
      const name = (err as { name?: string }).name ?? 'CostExplorerFailed';
      const message =
        name === 'DataUnavailableException'
          ? 'Cost Explorer is not enabled on this AWS account yet. Enable it in the Billing console (data appears within 24h).'
          : 'The role was assumed but Cost Explorer access was denied. Attach a policy allowing ce:GetCostAndUsage.';
      throw new AccountConnectionError(message, name);
    }
  }

  private async client(account: AwsAccount): Promise<CostExplorerClient> {
    if (!account.roleArn) throw new AccountConnectionError('No role ARN configured', 'MissingRoleArn');
    const credentials = await this.sts.credentialsFor(account.roleArn, account.externalId, account.id.slice(0, 8));
    return new CostExplorerClient({ region: CE_REGION, credentials, maxAttempts: 5 });
  }
}
