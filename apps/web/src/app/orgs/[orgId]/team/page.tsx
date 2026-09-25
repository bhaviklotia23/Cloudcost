'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Badge, Button, Card, CardHeader, CopyButton, ErrorText, Field, Input, Spinner } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useMe, useOrg, useOrgId } from '@/lib/hooks';
import type { Invite, Member, Role } from '@/lib/types';

export default function TeamPage() {
  const orgId = useOrgId();
  const org = useOrg();
  const me = useMe();
  const isAdmin = org.data?.role === 'admin';
  const members = useSWR<Member[]>(`/orgs/${orgId}/members`, fetcher);
  const invites = useSWR<Invite[]>(isAdmin ? `/orgs/${orgId}/invites` : null, fetcher);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<Invite>();
  const [loading, setLoading] = useState(false);

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setLoading(true);
    setError(undefined);
    setSent(undefined);
    try {
      const inv = await api<Invite>(`/orgs/${orgId}/invites`, { method: 'POST', json: { email: f.get('email'), role: f.get('role') } });
      setSent(inv);
      form.reset();
      await invites.mutate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setError(undefined);
    try {
      await fn();
      await Promise.all([members.mutate(), invites.mutate()]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!members.data) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-muted">Everyone here receives the Monday digest. Admins can connect accounts and manage the team.</p>
      </div>

      <ErrorText>{error}</ErrorText>

      <Card>
        <CardHeader title={`Members (${members.data.length})`} />
        <ul className="divide-y divide-line px-5 pb-2 pt-3">
          {members.data.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.name} {m.userId === me.data?.id && <span className="text-muted">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted">{m.email}</p>
              </div>
              {isAdmin ? (
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Role for ${m.name}`}
                    value={m.role}
                    onChange={(e) =>
                      run(() => api(`/orgs/${orgId}/members/${m.userId}`, { method: 'PATCH', json: { role: e.target.value as Role } }))
                    }
                    className="h-8 rounded-lg border border-line bg-surface px-2 text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`Remove ${m.name} from this organization?`))
                        void run(() => api(`/orgs/${orgId}/members/${m.userId}`, { method: 'DELETE' }));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Badge tone={m.role === 'admin' ? 'accent' : 'neutral'}>{m.role}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader title="Invite a teammate" subtitle="They'll get an email with a link that's valid for 7 days." />
          <form onSubmit={invite} className="flex flex-wrap items-end gap-3 p-5">
            <div className="min-w-60 flex-1">
              <Field label="Email">
                <Input name="email" type="email" required placeholder="teammate@company.com" />
              </Field>
            </div>
            <Field label="Role">
              <select name="role" defaultValue="member" className="h-10 rounded-lg border border-line bg-surface px-3 text-sm">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Button type="submit" loading={loading}>
              Send invite
            </Button>
          </form>
          {sent && (
            <div className="mx-5 mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-soft p-3 text-sm">
              <span>
                {sent.emailSent === false
                  ? `Invite created, but the email to ${sent.email} couldn't be sent — share the link directly.`
                  : `Invite sent to ${sent.email}.`}
              </span>
              {sent.link && <CopyButton value={sent.link} label="Copy invite link" />}
            </div>
          )}
          {invites.data && invites.data.length > 0 && (
            <>
              <h3 className="border-t border-line px-5 pt-4 text-xs font-medium uppercase tracking-wide text-muted">Pending invites</h3>
              <ul className="divide-y divide-line px-5 pb-2">
                {invites.data.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="min-w-0 truncate">
                      {i.email} <span className="text-muted">· {i.role}</span>
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => run(() => api(`/orgs/${orgId}/invites/${i.id}`, { method: 'DELETE' }))}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
