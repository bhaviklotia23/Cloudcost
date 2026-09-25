'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, CardHeader, ErrorText, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe, useOrg, useOrgId } from '@/lib/hooks';
import type { Org } from '@/lib/types';

export default function SettingsPage() {
  const orgId = useOrgId();
  const router = useRouter();
  const org = useOrg();
  const me = useMe();
  const isAdmin = org.data?.role === 'admin';
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(undefined);
    setSaved(false);
    try {
      const updated = await api<Org>(`/orgs/${orgId}`, {
        method: 'PATCH',
        json: {
          name: f.get('name'),
          anomalyThresholdPct: Number(f.get('anomalyThresholdPct')),
          anomalyMinDelta: Number(f.get('anomalyMinDelta')),
          digestEnabled: f.get('digestEnabled') === 'on',
        },
      });
      await org.mutate({ ...updated, role: org.data!.role }, { revalidate: false });
      await me.mutate();
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function createOrg() {
    const name = window.prompt('Name for the new organization');
    if (!name) return;
    try {
      const created = await api<{ id: string }>('/orgs', { method: 'POST', json: { name } });
      await me.mutate();
      router.push(`/orgs/${created.id}/accounts?welcome=1`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const o = org.data!;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader title="Organization" subtitle={isAdmin ? undefined : 'Only admins can change these settings.'} />
        <form onSubmit={save} className="space-y-5 p-5">
          <fieldset disabled={!isAdmin} className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Name">
                <Input name="name" defaultValue={o.name} required minLength={2} maxLength={80} />
              </Field>
            </div>
            <Field label="Spike threshold (%)" hint="Flag a project or service when it grows at least this much week over week.">
              <Input name="anomalyThresholdPct" type="number" min={5} max={1000} defaultValue={o.anomalyThresholdPct} required />
            </Field>
            <Field label="Minimum increase ($)" hint="…and by at least this many dollars, so tiny line items don't cry wolf.">
              <Input name="anomalyMinDelta" type="number" min={0} step="0.01" defaultValue={o.anomalyMinDelta} required />
            </Field>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <input type="checkbox" name="digestEnabled" defaultChecked={o.digestEnabled} className="size-4 accent-[var(--accent)]" />
              Send the weekly digest email to all members (Mondays)
            </label>
          </fieldset>
          <ErrorText>{error}</ErrorText>
          {isAdmin && (
            <div className="flex items-center gap-3">
              <Button type="submit" loading={loading}>
                Save changes
              </Button>
              {saved && <span className="text-sm text-good">Saved.</span>}
            </div>
          )}
        </form>
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm font-medium">Another team or company?</p>
          <p className="text-sm text-muted">Create a separate organization — its accounts and members are fully isolated.</p>
        </div>
        <Button variant="secondary" onClick={createOrg}>
          New organization
        </Button>
      </Card>
    </div>
  );
}
