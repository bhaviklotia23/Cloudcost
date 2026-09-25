import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { CostsModule } from './costs/costs.module';
import { DbModule } from './db/db.module';
import { QueuesModule } from './jobs/queues.module';
import { MailModule } from './mail/mail.module';
import { OrgsModule } from './orgs/orgs.module';

/** Infrastructure + domain modules shared by the API and worker processes. */
@Module({
  imports: [ConfigModule, DbModule, MailModule, QueuesModule, OrgsModule, CostsModule],
  exports: [ConfigModule, DbModule, MailModule, QueuesModule, OrgsModule, CostsModule],
})
export class CoreModule {}
