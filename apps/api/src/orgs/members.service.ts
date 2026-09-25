import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DB, Db, DbOrTx } from '../db/db.module';
import { orgMembers, Role, users } from '../db/schema';

@Injectable()
export class MembersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  list(orgId: string) {
    return this.db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: orgMembers.role,
        joinedAt: orgMembers.createdAt,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(orgMembers.orgId, orgId))
      .orderBy(asc(orgMembers.createdAt));
  }

  async emails(orgId: string): Promise<string[]> {
    const rows = await this.list(orgId);
    return rows.map((r) => r.email);
  }

  async changeRole(orgId: string, userId: string, role: Role) {
    return this.db.transaction(async (tx) => {
      const member = await this.lockMember(tx, orgId, userId);
      if (member.role === 'admin' && role !== 'admin') await this.assertNotLastAdmin(tx, orgId);
      const [updated] = await tx
        .update(orgMembers)
        .set({ role })
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
        .returning();
      return updated;
    });
  }

  async remove(orgId: string, userId: string) {
    await this.db.transaction(async (tx) => {
      const member = await this.lockMember(tx, orgId, userId);
      if (member.role === 'admin') await this.assertNotLastAdmin(tx, orgId);
      await tx.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
    });
  }

  private async lockMember(tx: DbOrTx, orgId: string, userId: string) {
    const [member] = await tx
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .for('update');
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  // Locks every admin row of the org, so two admins demoting each other concurrently
  // serialize and the second one sees the first's change instead of leaving zero admins.
  private async assertNotLastAdmin(tx: DbOrTx, orgId: string) {
    const admins = await tx
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, 'admin')))
      .for('update');
    if (admins.length <= 1) throw new BadRequestException('An organization needs at least one admin');
  }
}
