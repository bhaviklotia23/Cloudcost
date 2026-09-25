import { Module } from '@nestjs/common';
import { AwsCostExplorerProvider } from '../aws/providers/aws-cost-explorer.provider';
import { DemoCostProvider } from '../aws/providers/demo.provider';
import { StsService } from '../aws/sts.service';
import { CostsService } from './costs.service';

/** Domain services shared by the HTTP API and the background worker. */
@Module({
  providers: [CostsService, AwsCostExplorerProvider, DemoCostProvider, StsService],
  exports: [CostsService],
})
export class CostsModule {}
