import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ENV, Env } from '../config/env';
import { COST_SYNC_QUEUE, DEFAULT_JOB_OPTS, DIGEST_QUEUE } from './queues';

/** Queue producers — shared by the API (enqueue "sync now") and the worker (schedules + fan-out). */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
        prefix: env.QUEUE_PREFIX,
        defaultJobOptions: DEFAULT_JOB_OPTS,
      }),
    }),
    BullModule.registerQueue({ name: COST_SYNC_QUEUE }, { name: DIGEST_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
