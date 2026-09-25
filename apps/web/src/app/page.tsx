import { BarChart3, BellRing, KeyRound, Mail, ShieldCheck, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '@/components/ui';

const features = [
  { icon: BarChart3, title: 'Spend by project', body: 'Weekly cost broken down by your Project cost-allocation tag and by AWS service, with 12-week trends.' },
  { icon: BellRing, title: 'Spike detection', body: 'Week-over-week anomaly flags with a % threshold and a dollar floor, so $0.40 → $0.90 never pages anyone.' },
  { icon: Mail, title: 'Monday digest', body: 'Every member gets a one-glance email: total, change, spikes, top projects. No login required to stay informed.' },
  { icon: Users, title: 'Built for teams', body: 'Organizations, invites and admin/member roles. Tenants are isolated at every query, not just in the UI.' },
  { icon: KeyRound, title: 'Read-only by design', body: 'Cross-account IAM role with a per-connection External ID. CloudCost can read Cost Explorer and nothing else.' },
  { icon: ShieldCheck, title: 'Multi-account rollup', body: 'Connect staging and production separately, then see them as one bill — or drill into either.' },
];

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-lg px-3 py-2 font-medium text-ink-2 hover:text-ink">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg bg-accent px-3 py-2 font-medium text-accent-ink hover:opacity-90">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
          <p className="text-sm font-medium text-accent">FinOps for engineering teams</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Know what every project cost on AWS last week.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-2">
            CloudCost pulls your Cost Explorer data through a read-only role, breaks it down by project and service, flags
            week-over-week spikes, and emails your team a digest every Monday.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="inline-flex h-11 items-center rounded-lg bg-accent px-5 font-medium text-accent-ink hover:opacity-90">
              Create an organization
            </Link>
            <a href="#how" className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-5 font-medium hover:bg-surface-2">
              How the connection works
            </a>
          </div>
          <p className="mt-3 text-sm text-muted">No AWS account? Add a demo account after signing up and explore realistic data.</p>
          <div className="mt-12 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl shadow-black/5">
            <Image
              src="/dashboard-preview.png"
              alt="CloudCost dashboard: last week's total, month to date, spike alerts and a 12-week stacked chart of spend by project"
              width={1120}
              height={920}
              priority
              className="h-auto w-full"
            />
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-line bg-surface p-5">
              <Icon className="size-5 text-accent" aria-hidden />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1.5 text-sm text-ink-2">{body}</p>
            </div>
          ))}
        </section>

        <section id="how" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">How CloudCost reads your bill without your keys</h2>
            <p className="mt-2 max-w-2xl text-ink-2">
              You never paste access keys. You create a role that trusts CloudCost — but only when CloudCost presents the
              External ID generated for your connection.
            </p>
            <HowDiagram />
            <ol className="mt-8 grid gap-4 text-sm sm:grid-cols-3">
              {[
                ['Create the role', 'Deploy our CloudFormation template (or paste two JSON policies). It grants ce:GetCostAndUsage and nothing else.'],
                ['CloudCost assumes it', 'Our service calls sts:AssumeRole with your External ID and gets 15-minute credentials scoped to Cost Explorer.'],
                ['Weekly snapshots', 'A background job pulls each week grouped by your Project tag and service — one API call per account per week.'],
              ].map(([t, b], i) => (
                <li key={t} className="rounded-xl border border-line bg-bg p-5">
                  <span className="text-xs font-semibold text-accent">Step {i + 1}</span>
                  <p className="mt-1 font-semibold">{t}</p>
                  <p className="mt-1.5 text-ink-2">{b}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:px-6">
        <Logo className="text-sm" />
        <span>Next.js · NestJS · PostgreSQL · BullMQ · AWS SDK v3</span>
      </footer>
    </div>
  );
}

/** Cross-account trust, drawn as the actual mechanism: two accounts, one AssumeRole hop. */
function HowDiagram() {
  return (
    <div className="mt-8 overflow-x-auto rounded-xl border border-line bg-bg p-4">
      <svg viewBox="0 0 760 200" className="mx-auto block w-full min-w-[620px] max-w-3xl" role="img" aria-label="CloudCost's IAM role assumes a read-only role in your account using an External ID, then calls Cost Explorer">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-2)" />
          </marker>
        </defs>
        <rect x="10" y="20" width="250" height="160" rx="12" fill="var(--surface)" stroke="var(--line)" />
        <text x="30" y="46" fontSize="12" fill="var(--muted)">CloudCost AWS account</text>
        <rect x="30" y="66" width="210" height="52" rx="8" fill="var(--accent-soft)" stroke="var(--accent)" />
        <text x="135" y="89" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--ink)">cloudcost-app role</text>
        <text x="135" y="106" textAnchor="middle" fontSize="11" fill="var(--ink-2)">ECS task · BullMQ worker</text>

        <rect x="500" y="20" width="250" height="160" rx="12" fill="var(--surface)" stroke="var(--line)" />
        <text x="520" y="46" fontSize="12" fill="var(--muted)">Your AWS account</text>
        <rect x="520" y="66" width="210" height="52" rx="8" fill="var(--surface-2)" stroke="var(--line)" />
        <text x="625" y="89" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--ink)">CloudCostReadOnly</text>
        <text x="625" y="106" textAnchor="middle" fontSize="11" fill="var(--ink-2)">trusts cloudcost-app + ExternalId</text>
        <rect x="520" y="134" width="210" height="32" rx="8" fill="var(--surface-2)" stroke="var(--line)" />
        <text x="625" y="154" textAnchor="middle" fontSize="12" fill="var(--ink)">Cost Explorer (read-only)</text>

        <line x1="240" y1="84" x2="516" y2="84" stroke="var(--ink-2)" strokeWidth="1.5" markerEnd="url(#arr)" />
        <text x="378" y="74" textAnchor="middle" fontSize="12" fill="var(--ink)">① sts:AssumeRole</text>
        <text x="378" y="100" textAnchor="middle" fontSize="11" fill="var(--muted)">ExternalId = cc-…</text>
        <text x="30" y="148" fontSize="11" fill="var(--muted)">① assume role → temporary creds</text>
        <text x="30" y="166" fontSize="11" fill="var(--muted)">② read costs with those creds</text>
        <line x1="244" y1="150" x2="516" y2="150" stroke="var(--ink-2)" strokeWidth="1.5" markerEnd="url(#arr)" />
        <text x="378" y="142" textAnchor="middle" fontSize="12" fill="var(--ink)">② GetCostAndUsage</text>
        <text x="378" y="168" textAnchor="middle" fontSize="11" fill="var(--muted)">15-min session credentials</text>
      </svg>
    </div>
  );
}
