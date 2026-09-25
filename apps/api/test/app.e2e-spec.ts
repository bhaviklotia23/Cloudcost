import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AwsCostExplorerProvider } from '../src/aws/providers/aws-cost-explorer.provider';
import { AccountConnectionError } from '../src/aws/providers/cost-provider';
import { configureApp } from '../src/bootstrap';
import { ENV, Env, loadEnv } from '../src/config/env';
import { CostsService } from '../src/costs/costs.service';
import { DB, Db } from '../src/db/db.module';
import { runMigrations } from '../src/db/migrate';
import { DigestProcessor } from '../src/jobs/digest.processor';
import { DIGEST_QUEUE } from '../src/jobs/queues';
import { MailService } from '../src/mail/mail.service';
import { MembersService } from '../src/orgs/members.service';

/**
 * End-to-end: real NestJS app, real Postgres, real Redis. Only AWS is stubbed.
 * Walks the product the way a team would: sign up, invite, connect, sync, read, digest.
 */
describe('CloudCost API (e2e)', () => {
  let app: INestApplication;
  let mail: MailService;
  const password = 'correct-horse-battery';
  let adminAgent: ReturnType<typeof request.agent>;
  let memberAgent: ReturnType<typeof request.agent>;
  let outsiderAgent: ReturnType<typeof request.agent>;
  let orgId: string;
  let memberId: string;
  let demoAccountId: string;

  beforeAll(async () => {
    const env = loadEnv();
    await runMigrations(env.DATABASE_URL);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, env);
    await app.init();

    const db = app.get<Db>(DB);
    await db.execute(sql`TRUNCATE organizations, users CASCADE`);
    mail = app.get(MailService);

    const server = app.getHttpServer();
    adminAgent = request.agent(server);
    memberAgent = request.agent(server);
    outsiderAgent = request.agent(server);
  });

  afterAll(async () => {
    await app.get<Queue>(getQueueToken('cost-sync')).obliterate({ force: true });
    await app.close();
  });

  describe('auth', () => {
    it('rejects weak passwords with a readable validation error', async () => {
      const res = await adminAgent
        .post('/auth/signup')
        .send({ name: 'Ada', email: 'ada@acme.test', password: 'short', orgName: 'Acme' })
        .expect(400);
      expect(res.body.issues[0]).toMatchObject({ path: 'password' });
    });

    it('signs up, creating an org with the user as admin, and sets an httpOnly cookie', async () => {
      const res = await adminAgent
        .post('/auth/signup')
        .send({ name: 'Ada', email: 'Ada@Acme.test', password, orgName: 'Acme' })
        .expect(201);
      orgId = res.body.orgId;
      expect(res.headers['set-cookie'][0]).toMatch(/cc_session=.+HttpOnly/i);

      const me = await adminAgent.get('/auth/me').expect(200);
      expect(me.body).toMatchObject({ email: 'ada@acme.test', orgs: [{ id: orgId, name: 'Acme', role: 'admin' }] });
    });

    it('rejects duplicate emails case-insensitively', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ name: 'Ada 2', email: 'ADA@acme.test', password, orgName: 'Dupe' })
        .expect(409);
    });

    it('logs in and rejects bad credentials with the same message', async () => {
      const bad = await request(app.getHttpServer()).post('/auth/login').send({ email: 'ada@acme.test', password: 'nope-nope-nope' }).expect(401);
      const unknown = await request(app.getHttpServer()).post('/auth/login').send({ email: 'ghost@acme.test', password }).expect(401);
      expect(bad.body.message).toBe(unknown.body.message);
      await request(app.getHttpServer()).post('/auth/login').send({ email: 'ada@acme.test', password }).expect(200);
    });

    it('requires a session everywhere except public routes', async () => {
      await request(app.getHttpServer()).get('/orgs').expect(401);
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });

  describe('multi-tenancy', () => {
    it('hides other organizations entirely (404, not 403)', async () => {
      await outsiderAgent
        .post('/auth/signup')
        .send({ name: 'Eve', email: 'eve@other.test', password, orgName: 'Other Co' })
        .expect(201);
      await outsiderAgent.get(`/orgs/${orgId}`).expect(404);
      await outsiderAgent.get(`/orgs/${orgId}/dashboard`).expect(404);
      await outsiderAgent.get(`/orgs/${orgId}/members`).expect(404);
    });
  });

  describe('invites & roles', () => {
    it('admin invites a member by email', async () => {
      const res = await adminAgent.post(`/orgs/${orgId}/invites`).send({ email: 'max@acme.test' }).expect(201);
      expect(res.body).toMatchObject({ email: 'max@acme.test', role: 'member', emailSent: true });
      expect(mail.outbox.at(-1)).toMatchObject({ to: 'max@acme.test', subject: expect.stringContaining('Acme') });
    });

    it('the invitee previews and signs up through the link', async () => {
      const token = /\/invite\/([\w-]+)/.exec(mail.outbox.at(-1)!.text)![1];
      const preview = await request(app.getHttpServer()).get(`/invites/${token}`).expect(200);
      expect(preview.body).toEqual({ orgName: 'Acme', email: 'max@acme.test', role: 'member' });

      const res = await memberAgent
        .post('/auth/signup')
        .send({ name: 'Max', email: 'max@acme.test', password, inviteToken: token })
        .expect(201);
      expect(res.body.orgId).toBe(orgId);
      memberId = res.body.user.id;

      // Single-use.
      await request(app.getHttpServer()).get(`/invites/${token}`).expect(410);
    });

    it('an invite cannot be accepted by a different email', async () => {
      await adminAgent.post(`/orgs/${orgId}/invites`).send({ email: 'someone@acme.test' }).expect(201);
      const token = /\/invite\/([\w-]+)/.exec(mail.outbox.at(-1)!.text)![1];
      await outsiderAgent.post(`/invites/${token}/accept`).expect(403);
    });

    it('members can read but not administer', async () => {
      await memberAgent.get(`/orgs/${orgId}/members`).expect(200);
      await memberAgent.get(`/orgs/${orgId}/dashboard`).expect(200);
      await memberAgent.post(`/orgs/${orgId}/aws-accounts`).send({ nickname: 'x', provider: 'demo' }).expect(403);
      await memberAgent.post(`/orgs/${orgId}/invites`).send({ email: 'y@acme.test' }).expect(403);
      await memberAgent.patch(`/orgs/${orgId}`).send({ anomalyThresholdPct: 5 }).expect(403);
    });

    it('never leaves an org without an admin', async () => {
      const me = await adminAgent.get('/auth/me');
      await adminAgent.patch(`/orgs/${orgId}/members/${me.body.id}`).send({ role: 'member' }).expect(400);
      // Promote Max, then Ada can step down.
      await adminAgent.patch(`/orgs/${orgId}/members/${memberId}`).send({ role: 'admin' }).expect(200);
      await adminAgent.patch(`/orgs/${orgId}/members/${memberId}`).send({ role: 'member' }).expect(200);
    });
  });

  describe('AWS connection', () => {
    let pendingId: string;

    it('creates a pending account with a generated ExternalId and setup instructions', async () => {
      const res = await adminAgent.post(`/orgs/${orgId}/aws-accounts`).send({ nickname: 'Production' }).expect(201);
      expect(res.body).toMatchObject({ provider: 'aws', status: 'pending' });
      pendingId = res.body.id;

      const setup = await adminAgent.get(`/orgs/${orgId}/aws-accounts/${pendingId}/setup`).expect(200);
      expect(setup.body.externalId).toMatch(/^cc-[\w-]{32}$/);
      expect(setup.body.trustPolicy.Statement[0].Condition.StringEquals['sts:ExternalId']).toBe(setup.body.externalId);
      await memberAgent.get(`/orgs/${orgId}/aws-accounts/${pendingId}/setup`).expect(403);
    });

    it('rejects malformed role ARNs before calling AWS', async () => {
      await adminAgent.post(`/orgs/${orgId}/aws-accounts/${pendingId}/connect`).send({ roleArn: 'arn:aws:iam::123:user/bob' }).expect(400);
    });

    it('surfaces a failed AssumeRole and marks the account as needing attention', async () => {
      jest
        .spyOn(app.get(AwsCostExplorerProvider), 'verify')
        .mockRejectedValueOnce(new AccountConnectionError("CloudCost couldn't assume this role.", 'AccessDenied'));
      const res = await adminAgent
        .post(`/orgs/${orgId}/aws-accounts/${pendingId}/connect`)
        .send({ roleArn: 'arn:aws:iam::123456789012:role/CloudCostReadOnly' })
        .expect(400);
      expect(res.body.message).toMatch(/assume this role/);
      const list = await adminAgent.get(`/orgs/${orgId}/aws-accounts`);
      expect(list.body.find((a: { id: string }) => a.id === pendingId)).toMatchObject({ status: 'error', awsAccountId: '123456789012' });
    });

    it('connects once the role verifies', async () => {
      jest.spyOn(app.get(AwsCostExplorerProvider), 'verify').mockResolvedValueOnce();
      const res = await adminAgent
        .post(`/orgs/${orgId}/aws-accounts/${pendingId}/connect`)
        .send({ roleArn: 'arn:aws:iam::123456789012:role/CloudCostReadOnly' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'connected', lastError: null });
      await adminAgent.delete(`/orgs/${orgId}/aws-accounts/${pendingId}`).expect(204);
    });
  });

  describe('costs', () => {
    it('ingests a demo account and serves the dashboard', async () => {
      const res = await adminAgent.post(`/orgs/${orgId}/aws-accounts`).send({ nickname: 'Demo', provider: 'demo' }).expect(201);
      demoAccountId = res.body.id;
      const costs = app.get(CostsService);
      // Run the backfill inline instead of waiting for the worker process.
      await costs.syncAccount(demoAccountId, costs.backfillWeeks(new Date()));

      const dash = await memberAgent.get(`/orgs/${orgId}/dashboard?weeks=12`).expect(200);
      expect(dash.body.hasData).toBe(true);
      expect(dash.body.trend).toHaveLength(12);
      expect(dash.body.trend.at(-1).isComplete).toBe(false);
      expect(dash.body.latestWeek.total).toBeGreaterThan(0);
      expect(dash.body.latestWeek.byProject[0]).toEqual(
        expect.objectContaining({ key: expect.any(String), amount: expect.any(Number), share: expect.any(Number) }),
      );
      expect(dash.body.anomalies).toEqual(expect.arrayContaining([expect.objectContaining({ dimension: 'project', key: 'ml-training' })]));
      expect(dash.body.monthToDate.total).toBeGreaterThan(0);
    });

    it('re-syncing is idempotent', async () => {
      const costs = app.get(CostsService);
      const db = app.get<Db>(DB);
      const count = async () => (await db.execute(sql`select count(*)::int as n from cost_snapshots`)).rows[0].n;
      const before = await count();
      await costs.syncAccount(demoAccountId, costs.refreshWeeks(new Date()));
      expect(await count()).toBe(before);
    });

    it('threshold changes apply to the dashboard immediately', async () => {
      await adminAgent.patch(`/orgs/${orgId}`).send({ anomalyThresholdPct: 1000 }).expect(200);
      const dash = await adminAgent.get(`/orgs/${orgId}/dashboard`).expect(200);
      expect(dash.body.anomalies).toEqual([]);
      await adminAgent.patch(`/orgs/${orgId}`).send({ anomalyThresholdPct: 30 }).expect(200);
    });

    it('scopes the dashboard to accounts of the caller org only', async () => {
      await outsiderAgent.get(`/orgs/${orgId}/dashboard?accountId=${demoAccountId}`).expect(404);
    });
  });

  describe('weekly digest', () => {
    it('emails every member a summary of last week', async () => {
      const digest = new DigestProcessor(
        app.get<Db>(DB),
        app.get<Env>(ENV),
        app.get(CostsService),
        app.get(MembersService),
        mail,
        app.get<Queue>(getQueueToken(DIGEST_QUEUE)),
      );
      const sentBefore = mail.outbox.length;
      await expect(digest.sendForOrg({ orgId, weekStart: '' })).resolves.toEqual({ sent: 2 });
      const sent = mail.outbox.slice(sentBefore);
      expect(sent.map((m) => m.to).sort()).toEqual(['ada@acme.test', 'max@acme.test']);
      expect(sent[0].subject).toMatch(/^AWS spend .+: \$[\d,.]+/);
      expect(sent[0].html).toContain('ml-training');
    });

    it('respects the org opt-out', async () => {
      await adminAgent.patch(`/orgs/${orgId}`).send({ digestEnabled: false }).expect(200);
      const digest = new DigestProcessor(
        app.get<Db>(DB),
        app.get<Env>(ENV),
        app.get(CostsService),
        app.get(MembersService),
        mail,
        app.get<Queue>(getQueueToken(DIGEST_QUEUE)),
      );
      await expect(digest.sendForOrg({ orgId, weekStart: '' })).resolves.toEqual({ skipped: 'disabled' });
    });
  });
});
