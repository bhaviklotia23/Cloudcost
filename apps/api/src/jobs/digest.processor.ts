import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { and, eq, exists } from 'drizzle-orm';
import { ENV, Env } from '../config/env';
import { lastCompleteWeekStart } from '../common/week';
import { CostsService } from '../costs/costs.service';
import { DB, Db } from '../db/db.module';
import { awsAccounts, organizations } from '../db/schema';
import { MailService } from '../mail/mail.service';
import { digestEmail } from '../mail/templates/digest';
import { MembersService } from '../orgs/members.service';
import { DIGEST_QUEUE, DigestOrgData, JOB } from './queues';

@Processor(DIGEST_QUEUE, { concurrency: 2 })
export class DigestProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly costs: CostsService,
    private readonly members: MembersService,
    private readonly mail: MailService,
    @InjectQueue(DIGEST_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === JOB.digestAll) return this.fanOut();
    if (job.name === JOB.digestOrg) return this.sendForOrg(job.data as DigestOrgData);
    throw new Error(`Unknown job ${job.name}`);
  }

  private async fanOut() {
    const weekStart = lastCompleteWeekStart(new Date());
    const orgs = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.digestEnabled, true),
          exists(
            this.db
              .select({ one: awsAccounts.id })
              .from(awsAccounts)
              .where(and(eq(awsAccounts.orgId, organizations.id), eq(awsAccounts.status, 'connected'))),
          ),
        ),
      );
    // jobId = org+week makes the digest idempotent: a retry or double-fire never emails twice.
    await this.queue.addBulk(
      orgs.map((o) => ({
        name: JOB.digestOrg,
        data: { orgId: o.id, weekStart } satisfies DigestOrgData,
        opts: { jobId: `digest:${o.id}:${weekStart}` },
      })),
    );
    this.logger.log(`Queued digest for ${orgs.length} org(s), week ${weekStart}`);
    return { queued: orgs.length };
  }

  async sendForOrg({ orgId }: DigestOrgData) {
    const org = await this.db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    if (!org?.digestEnabled) return { skipped: 'disabled' };
    const data = await this.costs.digestData(orgId);
    if (!data?.latestWeek) return { skipped: 'no-data' };
    const recipients = await this.members.emails(orgId);
    if (recipients.length === 0) return { skipped: 'no-members' };

    const email = digestEmail({
      orgName: org.name,
      weekStart: data.latestWeek.weekStart,
      total: data.latestWeek.total,
      previousTotal: data.latestWeek.previousTotal,
      changePct: data.latestWeek.changePct,
      monthToDate: data.monthToDate.total,
      byProject: data.latestWeek.byProject,
      byService: data.latestWeek.byService,
      anomalies: data.anomalies,
      trend: data.trend.filter((t) => t.isComplete),
      dashboardUrl: `${this.env.WEB_URL}/orgs/${orgId}`,
      currency: data.currency,
    });
    // One email per member so addresses aren't exposed to each other.
    for (const to of recipients) await this.mail.send({ to, ...email });
    return { sent: recipients.length };
  }
}
