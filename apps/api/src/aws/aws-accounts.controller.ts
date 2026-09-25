import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { Membership } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { CurrentMembership, OrgMemberGuard, RequireRole } from '../orgs/org-member.guard';
import { AwsAccountsService } from './aws-accounts.service';

const tagKey = z.string().trim().min(1).max(128).regex(/^[\w.:/=+\-@ ]+$/, 'Invalid tag key');
const CreateSchema = z.object({
  nickname: z.string().trim().min(1).max(60),
  provider: z.enum(['aws', 'demo']).default('aws'),
  costTagKey: tagKey.optional(),
});
const ConnectSchema = z.object({ roleArn: z.string().max(2048), costTagKey: tagKey.optional() });

@Controller('orgs/:orgId/aws-accounts')
@UseGuards(OrgMemberGuard)
export class AwsAccountsController {
  constructor(private readonly accounts: AwsAccountsService) {}

  @Get()
  list(@CurrentMembership() m: Membership) {
    return this.accounts.list(m.orgId);
  }

  @Post()
  @RequireRole('admin')
  create(@CurrentMembership() m: Membership, @Body(new ZodPipe(CreateSchema)) body: z.infer<typeof CreateSchema>) {
    return this.accounts.create(m.orgId, body);
  }

  @Get(':accountId/setup')
  @RequireRole('admin')
  setup(@CurrentMembership() m: Membership, @Param('accountId', ParseUUIDPipe) id: string) {
    return this.accounts.setup(m.orgId, id);
  }

  @Post(':accountId/connect')
  @RequireRole('admin')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  connect(
    @CurrentMembership() m: Membership,
    @Param('accountId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ConnectSchema)) body: z.infer<typeof ConnectSchema>,
  ) {
    return this.accounts.connect(m.orgId, id, body);
  }

  @Post(':accountId/sync')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  sync(@CurrentMembership() m: Membership, @Param('accountId', ParseUUIDPipe) id: string) {
    return this.accounts.syncNow(m.orgId, id);
  }

  @Delete(':accountId')
  @RequireRole('admin')
  @HttpCode(204)
  async remove(@CurrentMembership() m: Membership, @Param('accountId', ParseUUIDPipe) id: string) {
    await this.accounts.remove(m.orgId, id);
  }
}
