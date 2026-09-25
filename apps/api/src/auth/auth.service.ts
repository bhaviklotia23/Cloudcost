import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { eq, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../common/pg-errors';
import { DB, Db } from '../db/db.module';
import { users } from '../db/schema';
import { InvitesService } from '../orgs/invites.service';
import { OrgsService } from '../orgs/orgs.service';

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations).
const ARGON_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
// Verified against when the email doesn't exist, so response time doesn't reveal which emails are registered.
let dummyHash: Promise<string> | undefined;

export type SignupInput = { name: string; email: string; password: string } & (
  | { orgName: string; inviteToken?: undefined }
  | { inviteToken: string; orgName?: undefined }
);

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
    private readonly orgs: OrgsService,
    private readonly invites: InvitesService,
  ) {}

  async signup(input: SignupInput) {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hash(input.password, ARGON_OPTS);
    try {
      return await this.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email, name: input.name.trim(), passwordHash })
          .returning({ id: users.id, email: users.email, name: users.name });

        let orgId: string;
        if (input.inviteToken) {
          ({ orgId } = await this.invites.accept(input.inviteToken, user, tx));
        } else {
          orgId = (await this.orgs.createWithAdmin(tx, input.orgName!.trim(), user.id)).id;
        }
        return { user, orgId, token: await this.sign(user) };
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('An account with this email already exists');
      throw err;
    }
  }

  async login(emailRaw: string, password: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
    dummyHash ??= hash('dummy-password-for-timing', ARGON_OPTS);
    const ok = await verify(user?.passwordHash ?? (await dummyHash), password).catch(() => false);
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    return { user: { id: user.id, email: user.email, name: user.name }, token: await this.sign(user) };
  }

  async me(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    const orgs = await this.orgs.listForUser(userId);
    return { ...user, orgs };
  }

  private sign(user: { id: string; email: string }) {
    return this.jwt.signAsync({ sub: user.id, email: user.email });
  }
}
