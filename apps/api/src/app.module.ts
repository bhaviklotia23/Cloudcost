import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AwsAccountsController } from './aws/aws-accounts.controller';
import { AwsAccountsService } from './aws/aws-accounts.service';
import { CoreModule } from './core.module';
import { CostsController } from './costs/costs.controller';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    CoreModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    AuthModule,
  ],
  controllers: [AwsAccountsController, CostsController, HealthController],
  providers: [AwsAccountsService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
