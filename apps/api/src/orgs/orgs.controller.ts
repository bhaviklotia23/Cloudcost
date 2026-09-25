import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public } from '../auth/decorators';
import type { AuthUser, Membership } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { InvitesService } from './invites.service';
import { MembersService } from './members.service';
import { CurrentMembership, OrgMemberGuard, RequireRole } from './org-member.guard';
import { OrgsService } from './orgs.service';

const CreateOrgSchema = z.object({ name: z.string().trim().min(2).max(80) });
const UpdateOrgSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    anomalyThresholdPct: z.number().int().min(5).max(1000),
    anomalyMinDelta: z.number().min(0).max(1_000_000),
    digestEnabled: z.boolean(),
  })
  .partial();
const RoleSchema = z.enum(['admin', 'member']);
const InviteSchema = z.object({ email: z.email().max(254), role: RoleSchema.default('member') });

@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.orgs.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateOrgSchema)) body: z.infer<typeof CreateOrgSchema>) {
    return this.orgs.create(body.name, user.id);
  }
}

@Controller('orgs/:orgId')
@UseGuards(OrgMemberGuard)
export class OrgController {
  constructor(
    private readonly orgs: OrgsService,
    private readonly members: MembersService,
    private readonly invites: InvitesService,
  ) {}

  @Get()
  async get(@CurrentMembership() m: Membership) {
    const org = await this.orgs.get(m.orgId);
    return { ...org, role: m.role };
  }

  @Patch()
  @RequireRole('admin')
  update(@CurrentMembership() m: Membership, @Body(new ZodPipe(UpdateOrgSchema)) body: z.infer<typeof UpdateOrgSchema>) {
    return this.orgs.update(m.orgId, body);
  }

  @Get('members')
  listMembers(@CurrentMembership() m: Membership) {
    return this.members.list(m.orgId);
  }

  @Patch('members/:userId')
  @RequireRole('admin')
  changeRole(
    @CurrentMembership() m: Membership,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodPipe(z.object({ role: RoleSchema }))) body: { role: 'admin' | 'member' },
  ) {
    return this.members.changeRole(m.orgId, userId, body.role);
  }

  @Delete('members/:userId')
  @RequireRole('admin')
  @HttpCode(204)
  async removeMember(@CurrentMembership() m: Membership, @Param('userId', ParseUUIDPipe) userId: string) {
    await this.members.remove(m.orgId, userId);
  }

  @Get('invites')
  @RequireRole('admin')
  listInvites(@CurrentMembership() m: Membership) {
    return this.invites.listPending(m.orgId);
  }

  @Post('invites')
  @RequireRole('admin')
  invite(@CurrentMembership() m: Membership, @Body(new ZodPipe(InviteSchema)) body: z.infer<typeof InviteSchema>) {
    return this.invites.create(m.orgId, m.userId, body.email, body.role);
  }

  @Delete('invites/:inviteId')
  @RequireRole('admin')
  @HttpCode(204)
  async revokeInvite(@CurrentMembership() m: Membership, @Param('inviteId', ParseUUIDPipe) inviteId: string) {
    await this.invites.revoke(m.orgId, inviteId);
  }
}

@Controller('invites/:token')
export class InviteTokenController {
  constructor(private readonly invites: InvitesService) {}

  @Public()
  @Get()
  preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Post('accept')
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.invites.accept(token, user);
  }
}
