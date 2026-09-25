'use client';

import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { BreakdownList, Change } from '@/components/charts/BreakdownList';
import { assignSeries } from '@/components/charts/series';
import { Legend, TrendChart } from '@/components/charts/TrendChart';
import { Button, Card, CardHeader, Spinner } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { money, monthLabel, relativeTime, weekLabel } from '@/lib/format';
import { useOrg, useOrgId } from '@/lib/hooks';
import type { Dashboard } from '@/lib/types';

export default function DashboardPage() {
  const orgId = useOrgId();
  const org = useOrg();
  const [scope, setScope] = useState<string>('all');
  const [weeks, setWeeks] = useState(12);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [syncing, setSyncing] = useState(false);

  const qs = new URLSearchParams({ weeks: String(weeks), ...(scope !== 'all' ? { accountId: scope } : {}) });
  const { data, error, isLoading, mutate } = useSWR<Dashboard>(`/orgs/${orgId}/dashboard?${qs}`, fetcher, {
    // Poll while the first backfill is running so the dashboard fills in by itself.
    refreshInterval: (d) => (d && d.accounts.length > 0 && !d.latestWeek ? 3000 : 0),
    keepPreviousData: true,
  });

  // Series are assigned from every project seen in the window, ordered by spend.
  const { series, fold } = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of data?.trend ?? []) for (const [k, v] of Object.entries(t.byProject)) totals[k] = (totals[k] ?? 0) + v;
    return assignSeries(Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k]) => k));
  }, [data]);
  const projectColor = (key: string) => series.find((s) => s.key === fold(key))?.color ?? 'var(--series-other)';

  async function syncNow() {
    if (!data) return;
    setSyncing(true);
    const targets = scope === 'all' ? data.accounts.map((a) => a.id) : [scope];
    await Promise.allSettled(targets.map((id) => api(`/orgs/${orgId}/aws-accounts/${id}/sync`, { method: 'POST' })));
    setTimeout(() => {
      void mutate();
      setSyncing(false);
    }, 2500);
  }

  if (isLoading && !data) return <Spinner label="Loading dashboard" />;
  if (error) return <p className="text-critical">{error.message}</p>;
  if (!data) return null;

  if (data.accounts.length === 0) return <EmptyState orgId={orgId} isAdmin={org.data?.role === 'admin'} />;

  const latest = data.latestWeek;
  const lastSync = data.accounts
    .filter((a) => scope === 'all' || a.id === scope)
    .map((a) => a.lastSyncedAt)
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{org.data?.name}</h1>
          <p className="mt-1 text-sm text-muted">Last synced {relativeTime(lastSync ?? null)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="scope">
            AWS account
          </label>
          <select id="scope" value={scope} onChange={(e) => setScope(e.target.value)} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm">
            <option value="all">All accounts ({data.accounts.length})</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={syncNow} loading={syncing}>
            {!syncing && <RefreshCw className="size-4" aria-hidden />} Sync now
          </Button>
        </div>
      </div>

      {!latest ? (
        <Card className="p-8">
          <Spinner label="Pulling your last 12 weeks of cost data — this usually takes a few seconds" />
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] [&>*]:min-w-0">
            <Card className="p-5 sm:col-span-2 lg:col-span-1">
              <p className="text-sm text-muted">Last week · {weekLabel(latest.weekStart)}</p>
              <p className="mt-2 text-5xl font-semibold tracking-tight">{money(latest.total, data.currency)}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-2">
                {latest.changePct === null ? (
                  'First full week tracked'
                ) : (
                  <>
                    <Change value={latest.changePct} className="w-auto text-sm" />
                    <span>vs {money(latest.previousTotal ?? 0, data.currency)} the week before</span>
                  </>
                )}
              </p>
            </Card>
            <Stat label="Month to date" value={money(data.monthToDate.total, data.currency)} note={monthLabel(data.monthToDate.month)} />
            <Stat label="This week so far" value={money(data.currentWeek.total, data.currency)} note={`Week of ${weekLabel(data.currentWeek.weekStart)}`} />
            <Stat
              label="Spikes flagged"
              value={String(data.anomalies.length)}
              note={`≥${org.data?.anomalyThresholdPct}% and ≥${money(org.data?.anomalyMinDelta ?? 0, data.currency)} WoW`}
            />
          </section>

          <Anomalies anomalies={data.anomalies} currency={data.currency} weekStart={latest.weekStart} />

          <Card>
            <CardHeader
              title="Weekly spend by project"
              subtitle={`Last ${weeks} weeks · the faded column is the week in progress`}
              action={
                <div className="flex items-center gap-2">
                  <Segmented
                    value={String(weeks)}
                    onChange={(v) => setWeeks(Number(v))}
                    options={[
                      { value: '8', label: '8w' },
                      { value: '12', label: '12w' },
                      { value: '26', label: '26w' },
                    ]}
                  />
                  <Segmented
                    value={view}
                    onChange={(v) => setView(v as 'chart' | 'table')}
                    options={[
                      { value: 'chart', label: 'Chart' },
                      { value: 'table', label: 'Table' },
                    ]}
                  />
                </div>
              }
            />
            <div className="px-5 pb-5 pt-4">
              {view === 'chart' ? (
                <>
                  <div className="mb-3">
                    <Legend series={series} />
                  </div>
                  <TrendChart trend={data.trend} series={series} fold={fold} currency={data.currency} />
                </>
              ) : (
                <TrendTable data={data} />
              )}
            </div>
          </Card>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader title="By project" subtitle={`Cost allocation tag · week of ${weekLabel(latest.weekStart)}`} />
              <div className="p-5">
                <BreakdownList rows={latest.byProject} currency={data.currency} colorFor={projectColor} />
              </div>
            </Card>
            <Card>
              <CardHeader title="By service" subtitle={`Week of ${weekLabel(latest.weekStart)}`} />
              <div className="p-5">
                <BreakdownList rows={latest.byService} currency={data.currency} colorFor={() => 'var(--accent)'} />
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </Card>
  );
}

function Anomalies({ anomalies, currency, weekStart }: { anomalies: Dashboard['anomalies']; currency: string; weekStart: string }) {
  if (anomalies.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-4 text-sm text-ink-2">
        <CheckCircle2 className="size-5 shrink-0 text-good" aria-hidden />
        <span>
          <b className="font-medium text-ink">No spikes</b> in the week of {weekLabel(weekStart)} — spend moved within your thresholds.
        </span>
      </Card>
    );
  }
  return (
    <Card className="border-critical/30">
      <CardHeader
        title={`${anomalies.length} spike${anomalies.length > 1 ? 's' : ''} last week`}
        subtitle="Compared with the week before"
      />
      <ul className="divide-y divide-line px-5 pb-2 pt-3">
        {anomalies.map((a) => (
          <li key={`${a.dimension}:${a.key}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-critical" aria-hidden />
              <span className="sr-only">Spike:</span>
              <span className="truncate font-medium text-ink">{a.key}</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{a.dimension}</span>
            </span>
            <span className="tnum text-ink-2">
              {money(a.previous, currency)} → <b className="font-semibold text-ink">{money(a.current, currency)}</b>{' '}
              <span className="text-critical">({a.changePct === null ? 'new' : `+${a.changePct.toFixed(0)}%`})</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TrendTable({ data }: { data: Dashboard }) {
  const keys = [...new Set(data.trend.flatMap((t) => Object.keys(t.byProject)))].sort();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-2 pr-4 font-medium">Week</th>
            {keys.map((k) => (
              <th key={k} className="py-2 pr-4 text-right font-medium">
                {k}
              </th>
            ))}
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {[...data.trend].reverse().map((t) => (
            <tr key={t.weekStart} className="border-b border-line last:border-0">
              <td className="whitespace-nowrap py-2 pr-4 text-ink-2">
                {weekLabel(t.weekStart)}
                {!t.isComplete && <span className="ml-1 text-xs text-muted">(in progress)</span>}
              </td>
              {keys.map((k) => (
                <td key={k} className="tnum py-2 pr-4 text-right">
                  {t.byProject[k] ? money(t.byProject[k], data.currency) : '—'}
                </td>
              ))}
              <td className="tnum py-2 text-right font-medium">{t.total === null ? '—' : money(t.total, data.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-md px-2.5 py-1 text-xs font-medium', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-xl font-semibold">Connect an AWS account to get started</h1>
      <p className="mt-2 text-sm text-ink-2">
        CloudCost reads Cost Explorer through a read-only IAM role in your account. Setup takes about two minutes — or try it
        instantly with a demo account.
      </p>
      {isAdmin ? (
        <Link href={`/orgs/${orgId}/accounts`} className="mt-6 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink">
          Connect an account
        </Link>
      ) : (
        <p className="mt-6 text-sm text-muted">Ask an admin of this organization to connect an AWS account.</p>
      )}
    </Card>
  );
}
