import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { AccountConnectionError } from '../aws/providers/cost-provider';
import { CostsService } from '../costs/costs.service';
import { DB, Db } from '../db/db.module';
import { awsAccounts } from '../db/schema';
import { COST_SYNC_QUEUE, JOB, SyncAccountData } from './queues';

@Processor(COST_SYNC_QUEUE, { concurrency: 4 })
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly costs: CostsService,
    @InjectQueue(COST_SYNC_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB.syncAll:
        return this.fanOut();
      case JOB.syncAccount:
        return this.syncAccount(job as Job<SyncAccountData>);
      default:
        throw new Error(`Unknown job ${job.name}`);
    }
  }

  private async fanOut() {
    const accounts = await this.db
      .select({ id: awsAccounts.id })
      .from(awsAccounts)
      .where(eq(awsAccounts.status, 'connected'));
    const weeks = this.costs.refreshWeeks(new Date());
    await this.queue.addBulk(
      accounts.map((a) => ({
        name: JOB.syncAccount,
        data: { accountId: a.id, weeks, reason: 'scheduled' } satisfies SyncAccountData,
        // Dedupe: one scheduled sync per account per day, even if the scheduler double-fires.
        opts: { jobId: `scheduled:${a.id}:${new Date().toISOString().slice(0, 10)}` },
      })),
    );
    this.logger.log(`Queued scheduled sync for ${accounts.length} account(s)`);
    return { queued: accounts.length };
  }

  private async syncAccount(job: Job<SyncAccountData>) {
    const { accountId, weeks, reason } = job.data;
    try {
      await this.costs.syncAccount(accountId, weeks);
      return { accountId, weeks: weeks.length, reason };
    } catch (err) {
      // Permission problems won't fix themselves on retry — surface them on the account instead.
      if (err instanceof AccountConnectionError || isAccessDenied(err)) {
        await this.db
          .update(awsAccounts)
          .set({ status: 'error', lastError: (err as Error).message })
          .where(eq(awsAccounts.id, accountId));
        job.discard();
      }
      throw err;
    }
  }
}

function isAccessDenied(err: unknown) {
  const name = (err as { name?: string })?.name ?? '';
  return name === 'AccessDenied' || name === 'AccessDeniedException' || name === 'UnauthorizedException';
}
