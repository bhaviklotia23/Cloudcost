import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { ENV, Env } from '../config/env';
import { randomToken, sha256 } from '../common/crypto';
import { DB, Db, DbOrTx } from '../db/db.module';
import { invites, orgMembers, organizations, Role, users } from '../db/schema';
import { MailService } from '../mail/mail.service';
import { inviteEmail } from '../mail/templates/invite';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly mail: MailService,
  ) {}

  async create(orgId: string, inviterId: string, email: string, role: Role) {
    const normalized = email.trim().toLowerCase();
    const [existingMember] = await this.db
      .select({ userId: users.id })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), sql`lower(${users.email}) = ${normalized}`))
      .limit(1);
    if (existingMember) throw new ConflictException(`${normalized} is already a member`);

    const token = randomToken();
    const invite = await this.db.transaction(async (tx) => {
      // Re-inviting replaces any outstanding invite for the same email.
      await tx
        .delete(invites)
        .where(and(eq(invites.orgId, orgId), eq(invites.email, normalized), isNull(invites.acceptedAt)));
      const [row] = await tx
        .insert(invites)
        .values({
          orgId,
          email: normalized,
          role,
          tokenHash: sha256(token),
          invitedBy: inviterId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        })
        .returning();
      return row;
    });

    const [org, inviter] = await Promise.all([
      this.db.query.organizations.findFirst({ where: eq(organizations.id, orgId) }),
      this.db.query.users.findFirst({ where: eq(users.id, inviterId) }),
    ]);
    const link = `${this.env.WEB_URL}/invite/${token}`;
    // The invite is valid even if SMTP hiccups — report it instead of failing the whole request.
    let emailSent = true;
    try {
      await this.mail.send({
        to: normalized,
        ...inviteEmail({ orgName: org!.name, inviterName: inviter?.name ?? 'A teammate', role, link }),
      });
    } catch (err) {
      emailSent = false;
      this.logger.error(`Invite email to ${normalized} failed: ${(err as Error).message}`);
    }
    // The raw link is only returned when the email didn't go out (or outside production),
    // so the admin can share it by hand.
    const exposeLink = !emailSent || this.env.NODE_ENV !== 'production';
    return { ...this.toDto(invite), emailSent, link: exposeLink ? link : undefined };
  }

  async listPending(orgId: string) {
    const rows = await this.db
      .select()
      .from(invites)
      .where(and(eq(invites.orgId, orgId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
      .orderBy(desc(invites.createdAt));
    return rows.map((r) => this.toDto(r));
  }

  async revoke(orgId: string, inviteId: string) {
    const deleted = await this.db
      .delete(invites)
      .where(and(eq(invites.orgId, orgId), eq(invites.id, inviteId), isNull(invites.acceptedAt)))
      .returning({ id: invites.id });
    if (deleted.length === 0) throw new NotFoundException('Invite not found');
  }

  /** Public preview for the invite landing page. */
  async preview(token: string) {
    const invite = await this.findUsable(token);
    const org = await this.db.query.organizations.findFirst({ where: eq(organizations.id, invite.orgId) });
    return { orgName: org!.name, email: invite.email, role: invite.role };
  }

  /** Adds the user to the invite's org. The signed-in email must match the invited email. */
  async accept(token: string, user: { id: string; email: string }, tx: DbOrTx = this.db) {
    const invite = await this.findUsable(token, tx);
    if (invite.email !== user.email.toLowerCase()) {
      throw new ForbiddenException(`This invite was sent to ${invite.email}. Sign in with that email to accept it.`);
    }
    await tx
      .insert(orgMembers)
      .values({ orgId: invite.orgId, userId: user.id, role: invite.role })
      .onConflictDoNothing();
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
    return { orgId: invite.orgId };
  }

  private async findUsable(token: string, tx: DbOrTx = this.db) {
    if (!token || token.length > 128) throw new BadRequestException('Invalid invite link');
    const [invite] = await tx.select().from(invites).where(eq(invites.tokenHash, sha256(token))).limit(1);
    if (!invite) throw new NotFoundException('This invite link is invalid');
    if (invite.acceptedAt) throw new GoneException('This invite has already been used');
    if (invite.expiresAt.getTime() < Date.now()) throw new GoneException('This invite has expired');
    return invite;
  }

  private toDto(i: typeof invites.$inferSelect) {
    return { id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, createdAt: i.createdAt };
  }
}
