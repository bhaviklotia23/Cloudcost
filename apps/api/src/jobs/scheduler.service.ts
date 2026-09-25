import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ENV, Env } from '../config/env';
import { COST_SYNC_QUEUE, DIGEST_QUEUE, JOB } from './queues';

/**
 * Registers the repeatable jobs. upsertJobScheduler is idempotent, so every worker replica can
 * call it on boot and Redis still holds exactly one schedule per job (no duplicate digests).
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @InjectQueue(COST_SYNC_QUEUE) private readonly syncQueue: Queue,
    @InjectQueue(DIGEST_QUEUE) private readonly digestQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.syncQueue.upsertJobScheduler('daily-cost-sync', { pattern: this.env.SYNC_CRON, tz: 'UTC' }, { name: JOB.syncAll });
    await this.digestQueue.upsertJobScheduler('weekly-digest', { pattern: this.env.DIGEST_CRON, tz: 'UTC' }, { name: JOB.digestAll });
    this.logger.log(`Schedules registered: sync "${this.env.SYNC_CRON}", digest "${this.env.DIGEST_CRON}" (UTC)`);
  }
}
