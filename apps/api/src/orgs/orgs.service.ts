import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DB, Db, DbOrTx } from '../db/db.module';
import { orgMembers, organizations } from '../db/schema';

export type OrgSettingsUpdate = Partial<{
  name: string;
  anomalyThresholdPct: number;
  anomalyMinDelta: number;
  digestEnabled: boolean;
}>;

@Injectable()
export class OrgsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Creates an org and makes `userId` its first admin. Runs inside the caller's transaction. */
  async createWithAdmin(tx: DbOrTx, name: string, userId: string) {
    const [org] = await tx.insert(organizations).values({ name }).returning();
    await tx.insert(orgMembers).values({ orgId: org.id, userId, role: 'admin' });
    return org;
  }

  async create(name: string, userId: string) {
    return this.db.transaction((tx) => this.createWithAdmin(tx, name, userId));
  }

  async listForUser(userId: string) {
    return this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        plan: organizations.plan,
        role: orgMembers.role,
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
      .where(eq(orgMembers.userId, userId))
      .orderBy(asc(orgMembers.createdAt));
  }

  async get(orgId: string) {
    const org = await this.db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(orgId: string, patch: OrgSettingsUpdate) {
    const [org] = await this.db.update(organizations).set(patch).where(eq(organizations.id, orgId)).returning();
    return org;
  }
}
