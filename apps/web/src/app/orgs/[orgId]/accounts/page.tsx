'use client';

import { Cloud, FlaskConical, RefreshCw, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { Badge, Button, Card, CardHeader, CopyButton, ErrorText, Field, Input, Spinner } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useOrg, useOrgId } from '@/lib/hooks';
import type { AccountSetup, AwsAccount } from '@/lib/types';

function AccountsInner() {
  const orgId = useOrgId();
  const org = useOrg();
  const welcome = useSearchParams().get('welcome');
  const isAdmin = org.data?.role === 'admin';
  const { data: accounts, mutate } = useSWR<AwsAccount[]>(`/orgs/${orgId}/aws-accounts`, fetcher, {
    refreshInterval: (d) => (d?.some((a) => a.status === 'connected' && !a.lastSyncedAt) ? 2500 : 0),
  });
  const [setupFor, setSetupFor] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);

  async function addDemo() {
    setBusy('demo');
    setError(undefined);
    try {
      await api(`/orgs/${orgId}/aws-accounts`, { method: 'POST', json: { nickname: 'Demo — production', provider: 'demo' } });
      await mutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function startAws(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy('aws');
    setError(undefined);
    try {
      const acct = await api<AwsAccount>(`/orgs/${orgId}/aws-accounts`, {
        method: 'POST',
        json: { nickname: f.get('nickname'), provider: 'aws', costTagKey: f.get('costTagKey') || undefined },
      });
      await mutate();
      setSetupFor(acct.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: AwsAccount) {
    if (!window.confirm(`Disconnect "${a.nickname}"? Its cost history in CloudCost will be deleted.`)) return;
    await api(`/orgs/${orgId}/aws-accounts/${a.id}`, { method: 'DELETE' });
    if (setupFor === a.id) setSetupFor(null);
    await mutate();
  }

  async function sync(a: AwsAccount) {
    setBusy(a.id);
    await api(`/orgs/${orgId}/aws-accounts/${a.id}/sync`, { method: 'POST' }).catch(() => {});
    setTimeout(() => {
      void mutate();
      setBusy(null);
    }, 2000);
  }

  if (!accounts) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AWS accounts</h1>
        <p className="mt-1 text-sm text-muted">
          CloudCost reads Cost Explorer through a read-only role you create — it never gets access to your resources.
        </p>
      </div>

      {welcome && accounts.length === 0 && (
        <Card className="border-accent/40 bg-accent-soft p-4 text-sm text-ink">
          <b>Your organization is ready.</b> Connect an AWS account below, or add a demo account to explore with realistic data.
        </Card>
      )}

      {accounts.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2">
                    {a.provider === 'demo' ? <FlaskConical className="size-4 text-ink-2" /> : <Cloud className="size-4 text-ink-2" />}
                  </div>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {a.nickname}
                      <StatusBadge a={a} />
                    </p>
                    <p className="truncate text-xs text-muted">
                      {a.provider === 'demo' ? 'Synthetic data' : a.awsAccountId ? `Account ${a.awsAccountId}` : 'Awaiting role ARN'}
                      {' · '}tag <code className="font-mono">{a.costTagKey}</code>
                      {a.status === 'connected' && ` · synced ${relativeTime(a.lastSyncedAt)}`}
                    </p>
                    {a.lastError && <p className="mt-1 text-xs text-critical">{a.lastError}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.status === 'connected' && (
                    <Button variant="secondary" size="sm" onClick={() => sync(a)} loading={busy === a.id}>
                      {busy !== a.id && <RefreshCw className="size-3.5" aria-hidden />} Sync
                    </Button>
                  )}
                  {isAdmin && a.provider === 'aws' && a.status !== 'connected' && (
                    <Button size="sm" onClick={() => setSetupFor(setupFor === a.id ? null : a.id)}>
                      {setupFor === a.id ? 'Hide setup' : 'Finish setup'}
                    </Button>
                  )}
                  {isAdmin && (
                    <Button variant="ghost" size="sm" onClick={() => remove(a)} aria-label={`Disconnect ${a.nickname}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {setupFor && <SetupSteps key={setupFor} orgId={orgId} account={accounts.find((a) => a.id === setupFor)!} onDone={async () => { await mutate(); setSetupFor(null); }} />}

      {isAdmin ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
          <Card>
            <CardHeader title="Connect an AWS account" subtitle="Step 1 of 2 — name it and choose the tag that identifies projects." />
            <form onSubmit={startAws} className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Nickname">
                <Input name="nickname" placeholder="Production" required maxLength={60} />
              </Field>
              <Field label="Cost allocation tag" hint="Must be activated in Billing → Cost allocation tags.">
                <Input name="costTagKey" defaultValue="Project" maxLength={128} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" loading={busy === 'aws'}>
                  Continue to IAM setup
                </Button>
              </div>
            </form>
          </Card>
          <Card className="flex flex-col">
            <CardHeader title="No AWS account handy?" subtitle="Add a demo account with 12 weeks of realistic synthetic spend — including a spike." />
            <div className="mt-auto p-5">
              <Button variant="secondary" onClick={addDemo} loading={busy === 'demo'}>
                <FlaskConical className="size-4" aria-hidden /> Add demo account
              </Button>
            </div>
          </Card>
          <div className="lg:col-span-2">
            <ErrorText>{error}</ErrorText>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Only admins can connect or remove accounts.</p>
      )}
    </div>
  );
}

function StatusBadge({ a }: { a: AwsAccount }) {
  if (a.status === 'connected') return a.lastSyncedAt ? <Badge tone="good">Connected</Badge> : <Badge tone="accent">Syncing…</Badge>;
  if (a.status === 'error') return <Badge tone="critical">Needs attention</Badge>;
  return <Badge>Pending setup</Badge>;
}

function SetupSteps({ orgId, account, onDone }: { orgId: string; account: AwsAccount; onDone: () => Promise<void> }) {
  const { data: setup } = useSWR<AccountSetup>(`/orgs/${orgId}/aws-accounts/${account.id}/setup`, fetcher);
  const [tab, setTab] = useState<'cfn' | 'manual'>('cfn');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function connect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(undefined);
    try {
      await api(`/orgs/${orgId}/aws-accounts/${account.id}/connect`, { method: 'POST', json: { roleArn: f.get('roleArn') } });
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!setup) return <Spinner />;
  const templateHref = `data:text/yaml;charset=utf-8,${encodeURIComponent(setup.cloudFormationTemplate)}`;
  const cli = `aws cloudformation deploy \\
  --template-file cloudcost-readonly-role.yaml \\
  --stack-name CloudCostReadOnly \\
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation describe-stacks --stack-name CloudCostReadOnly \\
  --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" --output text`;

  return (
    <Card>
      <CardHeader title={`Step 2 of 2 — create the read-only role for "${account.nickname}"`} subtitle="Pick one way to create it, then paste the role ARN." />
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-3 rounded-lg bg-surface-2 p-4 text-sm sm:grid-cols-2">
          <KV label="CloudCost principal" value={setup.principalArn} />
          <KV label="External ID (unique to this connection)" value={setup.externalId} />
        </div>

        <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5 text-sm">
          {(['cfn', 'manual'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`rounded-md px-3 py-1.5 font-medium ${tab === t ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
            >
              {t === 'cfn' ? 'CloudFormation (recommended)' : 'Manual IAM'}
            </button>
          ))}
        </div>

        {tab === 'cfn' ? (
          <ol className="list-decimal space-y-4 pl-5 text-sm text-ink-2">
            <li>
              {setup.quickCreateUrl ? (
                <>
                  <a href={setup.quickCreateUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                    Launch the stack in the AWS console
                  </a>{' '}
                  (parameters are pre-filled), or{' '}
                </>
              ) : null}
              <a href={templateHref} download="cloudcost-readonly-role.yaml" className="font-medium text-accent hover:underline">
                download the template
              </a>{' '}
              and deploy it with the AWS CLI:
              <Pre text={cli} />
            </li>
            <li>Copy the <code className="font-mono">RoleArn</code> stack output and paste it below.</li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-4 pl-5 text-sm text-ink-2">
            <li>
              In IAM, create a role with <b>Custom trust policy</b>:
              <Pre text={JSON.stringify(setup.trustPolicy, null, 2)} />
            </li>
            <li>
              Attach an inline permissions policy:
              <Pre text={JSON.stringify(setup.permissionsPolicy, null, 2)} />
            </li>
            <li>Paste the role&apos;s ARN below.</li>
          </ol>
        )}

        <form onSubmit={connect} className="space-y-3 border-t border-line pt-5">
          <Field label="Role ARN" hint="CloudCost will assume the role and make one test Cost Explorer call before saving.">
            <Input name="roleArn" defaultValue={account.roleArn ?? ''} placeholder="arn:aws:iam::123456789012:role/CloudCostReadOnly" required className="font-mono" />
          </Field>
          <ErrorText>{error ?? account.lastError ?? undefined}</ErrorText>
          <Button type="submit" loading={loading}>
            Verify &amp; connect
          </Button>
        </form>
      </div>
    </Card>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 truncate font-mono text-xs text-ink">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function Pre({ text }: { text: string }) {
  return (
    <div className="relative mt-2">
      <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 pr-20 font-mono text-xs leading-relaxed text-ink">{text}</pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={text} />
      </div>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense>
      <AccountsInner />
    </Suspense>
  );
}
