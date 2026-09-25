import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { and, asc, eq } from 'drizzle-orm';
import { randomToken } from '../common/crypto';
import { ENV, Env } from '../config/env';
import { CostsService } from '../costs/costs.service';
import { DB, Db } from '../db/db.module';
import { AwsAccount, awsAccounts } from '../db/schema';
import { COST_SYNC_QUEUE, JOB, SyncAccountData } from '../jobs/queues';
import { cloudFormationTemplate, permissionsPolicy, quickCreateUrl, ROLE_ARN_RE, trustPolicy } from './iam-templates';
import { AccountConnectionError } from './providers/cost-provider';

@Injectable()
export class AwsAccountsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly costs: CostsService,
    @InjectQueue(COST_SYNC_QUEUE) private readonly syncQueue: Queue,
  ) {}

  list(orgId: string) {
    return this.db
      .select()
      .from(awsAccounts)
      .where(eq(awsAccounts.orgId, orgId))
      .orderBy(asc(awsAccounts.createdAt))
      .then((rows) => rows.map((r) => this.toDto(r)));
  }

  /**
   * Step 1 of connecting: create a pending account with a fresh ExternalId.
   * Demo accounts skip AWS entirely and connect immediately.
   */
  async create(orgId: string, input: { nickname: string; provider: 'aws' | 'demo'; costTagKey?: string }) {
    if (input.provider === 'demo' && !this.env.ENABLE_DEMO_ACCOUNTS) {
      throw new ForbiddenException('Demo accounts are disabled on this deployment');
    }
    const isDemo = input.provider === 'demo';
    const [account] = await this.db
      .insert(awsAccounts)
      .values({
        orgId,
        accountNickname: input.nickname,
        provider: input.provider,
        // "cc-" prefix + 24 random bytes: unguessable, and obviously ours when seen in a trust policy.
        externalId: `cc-${randomToken(24)}`,
        costTagKey: input.costTagKey ?? 'Project',
        status: isDemo ? 'connected' : 'pending',
        awsAccountId: isDemo ? '000000000000' : null,
        connectedAt: isDemo ? new Date() : null,
      })
      .returning();
    if (isDemo) await this.enqueueSync(account.id, this.costs.backfillWeeks(new Date()), 'backfill');
    return this.toDto(account);
  }

  async setup(orgId: string, accountId: string) {
    const account = await this.get(orgId, accountId);
    const principal = this.env.CLOUDCOST_PRINCIPAL_ARN;
    return {
      externalId: account.externalId,
      principalArn: principal,
      trustPolicy: trustPolicy(principal, account.externalId),
      permissionsPolicy: permissionsPolicy(),
      cloudFormationTemplate: cloudFormationTemplate(principal, account.externalId),
      quickCreateUrl: this.env.CFN_TEMPLATE_URL
        ? quickCreateUrl(this.env.CFN_TEMPLATE_URL, account.externalId, principal)
        : null,
    };
  }

  /** Step 2: customer pastes the role ARN; we prove we can assume it before saving it as connected. */
  async connect(orgId: string, accountId: string, input: { roleArn: string; costTagKey?: string }) {
    const account = await this.get(orgId, accountId);
    if (account.provider !== 'aws') throw new BadRequestException('Only AWS accounts take a role ARN');
    const match = ROLE_ARN_RE.exec(input.roleArn.trim());
    if (!match) throw new BadRequestException('That doesn’t look like an IAM role ARN (arn:aws:iam::123456789012:role/Name)');

    const candidate: AwsAccount = {
      ...account,
      roleArn: input.roleArn.trim(),
      awsAccountId: match[1],
      costTagKey: input.costTagKey ?? account.costTagKey,
    };
    try {
      await this.costs.providerFor(candidate).verify(candidate);
    } catch (err) {
      const message = err instanceof AccountConnectionError ? err.message : 'Unexpected error verifying the role';
      await this.db
        .update(awsAccounts)
        .set({ roleArn: candidate.roleArn, awsAccountId: candidate.awsAccountId, status: 'error', lastError: message })
        .where(eq(awsAccounts.id, account.id));
      throw new BadRequestException(message);
    }

    const [updated] = await this.db
      .update(awsAccounts)
      .set({
        roleArn: candidate.roleArn,
        awsAccountId: candidate.awsAccountId,
        costTagKey: candidate.costTagKey,
        status: 'connected',
        lastError: null,
        connectedAt: new Date(),
      })
      .where(eq(awsAccounts.id, account.id))
      .returning();
    await this.enqueueSync(account.id, this.costs.backfillWeeks(new Date()), 'backfill');
    return this.toDto(updated);
  }

  async syncNow(orgId: string, accountId: string) {
    const account = await this.get(orgId, accountId);
    if (account.status !== 'connected') throw new BadRequestException('Connect the account before syncing');
    await this.enqueueSync(account.id, this.costs.refreshWeeks(new Date()), 'manual');
    return { queued: true };
  }

  async remove(orgId: string, accountId: string) {
    await this.get(orgId, accountId);
    await this.db.delete(awsAccounts).where(and(eq(awsAccounts.orgId, orgId), eq(awsAccounts.id, accountId)));
  }

  private async get(orgId: string, accountId: string) {
    // Always filter by orgId as well as id — the org check is what makes this tenant-safe.
    const account = await this.db.query.awsAccounts.findFirst({
      where: and(eq(awsAccounts.orgId, orgId), eq(awsAccounts.id, accountId)),
    });
    if (!account) throw new NotFoundException('AWS account not found');
    return account;
  }

  private async enqueueSync(accountId: string, weeks: string[], reason: SyncAccountData['reason']) {
    // jobId buckets by minute: mashing "Sync now" queues at most one job per account per minute.
    await this.syncQueue.add(
      JOB.syncAccount,
      { accountId, weeks, reason } satisfies SyncAccountData,
      { jobId: `${reason}:${accountId}:${Date.now() - (Date.now() % 60_000)}` },
    );
  }

  private toDto(a: AwsAccount) {
    return {
      id: a.id,
      nickname: a.accountNickname,
      provider: a.provider,
      status: a.status,
      awsAccountId: a.awsAccountId,
      roleArn: a.roleArn,
      costTagKey: a.costTagKey,
      lastError: a.lastError,
      connectedAt: a.connectedAt,
      lastSyncedAt: a.lastSyncedAt,
      createdAt: a.createdAt,
    };
  }
}
