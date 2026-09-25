import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createParamDecorator } from '@nestjs/common';
import { DB, Db } from '../db/db.module';
import { orgMembers, Role } from '../db/schema';
import type { AppRequest, Membership } from '../common/request';

const REQUIRED_ROLE = 'requiredRole';
/** Restrict an org-scoped route to admins. Members are allowed by default. */
export const RequireRole = (role: Role) => SetMetadata(REQUIRED_ROLE, role);

export const CurrentMembership = createParamDecorator((_: unknown, ctx: ExecutionContext): Membership => {
  const m = ctx.switchToHttp().getRequest<AppRequest>().membership;
  if (!m) throw new Error('CurrentMembership used without OrgMemberGuard');
  return m;
});

/**
 * Tenant isolation boundary. Every org-scoped route lives under /orgs/:orgId and this guard
 * verifies the caller belongs to that org before any handler runs. Non-members get a 404
 * (not 403) so org ids can't be probed for existence.
 */
@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const orgId = req.params.orgId;
    if (!req.user || typeof orgId !== 'string' || !z.uuid().safeParse(orgId).success) {
      throw new NotFoundException('Organization not found');
    }

    const [membership] = await this.db
      .select({ orgId: orgMembers.orgId, userId: orgMembers.userId, role: orgMembers.role })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, req.user.id)))
      .limit(1);
    if (!membership) throw new NotFoundException('Organization not found');

    const required = this.reflector.getAllAndOverride<Role | undefined>(REQUIRED_ROLE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required === 'admin' && membership.role !== 'admin') {
      throw new ForbiddenException('Only organization admins can do that');
    }
    req.membership = membership;
    return true;
  }
}
