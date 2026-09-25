import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { Membership } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { CurrentMembership, OrgMemberGuard } from '../orgs/org-member.guard';
import { CostsService } from './costs.service';

const DashboardQuery = z.object({
  accountId: z.uuid().optional(),
  weeks: z.coerce.number().int().min(4).max(52).default(12),
});

@Controller('orgs/:orgId/dashboard')
@UseGuards(OrgMemberGuard)
export class CostsController {
  constructor(private readonly costs: CostsService) {}

  @Get()
  dashboard(@CurrentMembership() m: Membership, @Query(new ZodPipe(DashboardQuery)) q: z.infer<typeof DashboardQuery>) {
    return this.costs.dashboard(m.orgId, q);
  }
}
