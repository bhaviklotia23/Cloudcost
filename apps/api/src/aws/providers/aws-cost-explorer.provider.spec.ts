import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsAccount } from '../../db/schema';
import { StsService } from '../sts.service';
import { AwsCostExplorerProvider } from './aws-cost-explorer.provider';
import { AccountConnectionError } from './cost-provider';

const sts = mockClient(STSClient);
const ce = mockClient(CostExplorerClient);

const account = {
  id: '11111111-2222-3333-4444-555555555555',
  roleArn: 'arn:aws:iam::123456789012:role/CloudCostReadOnly',
  externalId: 'cc-test-external-id',
  costTagKey: 'Project',
} as AwsAccount;

const creds = {
  Credentials: { AccessKeyId: 'AKIA', SecretAccessKey: 'secret', SessionToken: 'tok', Expiration: new Date(Date.now() + 900_000) },
};

describe('AwsCostExplorerProvider', () => {
  let provider: AwsCostExplorerProvider;

  beforeEach(() => {
    sts.reset();
    ce.reset();
    provider = new AwsCostExplorerProvider(new StsService());
  });

  it('assumes the role with the account ExternalId, then pages through Cost Explorer', async () => {
    sts.on(AssumeRoleCommand).resolves(creds);
    ce.on(GetCostAndUsageCommand)
      .resolvesOnce({
        ResultsByTime: [{ TimePeriod: { Start: '2026-09-14', End: '2026-09-15' }, Groups: [{ Keys: ['Project$api', 'EC2'], Metrics: { UnblendedCost: { Amount: '5', Unit: 'USD' } } }] }],
        NextPageToken: 'page-2',
      })
      .resolvesOnce({
        ResultsByTime: [{ TimePeriod: { Start: '2026-09-14', End: '2026-09-15' }, Groups: [{ Keys: ['Project$ml', 'SageMaker'], Metrics: { UnblendedCost: { Amount: '7', Unit: 'USD' } } }] }],
      });

    const out = await provider.fetchWeek(account, '2026-09-14', new Date('2026-09-25T00:00:00Z'));

    expect(sts.commandCalls(AssumeRoleCommand)[0].args[0].input).toMatchObject({
      RoleArn: account.roleArn,
      ExternalId: account.externalId,
    });
    const calls = ce.commandCalls(GetCostAndUsageCommand);
    expect(calls).toHaveLength(2);
    expect(calls[0].args[0].input).toMatchObject({
      TimePeriod: { Start: '2026-09-14', End: '2026-09-21' },
      Granularity: 'DAILY',
      GroupBy: [
        { Type: 'TAG', Key: 'Project' },
        { Type: 'DIMENSION', Key: 'SERVICE' },
      ],
    });
    expect(calls[1].args[0].input.NextPageToken).toBe('page-2');
    expect(out.byProject).toEqual({ api: 5, ml: 7 });
    expect(out.total).toBe(12);
  });

  it('caches assumed-role credentials between calls', async () => {
    sts.on(AssumeRoleCommand).resolves(creds);
    ce.on(GetCostAndUsageCommand).resolves({ ResultsByTime: [] });
    await provider.fetchWeek(account, '2026-09-07', new Date('2026-09-25T00:00:00Z'));
    await provider.fetchWeek(account, '2026-09-14', new Date('2026-09-25T00:00:00Z'));
    expect(sts.commandCalls(AssumeRoleCommand)).toHaveLength(1);
  });

  it('explains trust-policy failures in plain language', async () => {
    sts.on(AssumeRoleCommand).rejects(Object.assign(new Error('not authorized'), { name: 'AccessDenied' }));
    await expect(provider.verify(account)).rejects.toThrow(/trust policy/);
  });

  it('explains when Cost Explorer is not enabled yet', async () => {
    sts.on(AssumeRoleCommand).resolves(creds);
    ce.on(GetCostAndUsageCommand).rejects(Object.assign(new Error('x'), { name: 'DataUnavailableException' }));
    const err = await provider.verify(account).catch((e) => e);
    expect(err).toBeInstanceOf(AccountConnectionError);
    expect(err.message).toMatch(/not enabled/);
  });
});
