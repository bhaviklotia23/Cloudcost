import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { DigestProcessor } from './jobs/digest.processor';
import { SchedulerService } from './jobs/scheduler.service';
import { SyncProcessor } from './jobs/sync.processor';

@Module({
  imports: [CoreModule],
  providers: [SyncProcessor, DigestProcessor, SchedulerService],
})
export class WorkerModule {}
