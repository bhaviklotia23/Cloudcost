'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { Button, ErrorText, Field, Input, Spinner } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import type { Me } from '@/lib/types';

type Preview = { orgName: string; email: string; role: string };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const invite = useSWR<Preview>(`/invites/${token}`, fetcher, { shouldRetryOnError: false });
  // Signed-in users can accept with one click; others sign up with the invited email.
  const me = useSWR<Me>('/auth/me', fetcher, { shouldRetryOnError: false });
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  if (invite.isLoading || me.isLoading) return <Spinner />;
  if (invite.error)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Invite unavailable</h1>
        <ErrorText>{invite.error.message}</ErrorText>
        <Link href="/login" className="text-sm font-medium text-accent hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  const data = invite.data!;

  async function accept() {
    setLoading(true);
    setError(undefined);
    try {
      const { orgId } = await api<{ orgId: string }>(`/invites/${token}/accept`, { method: 'POST' });
      router.replace(`/orgs/${orgId}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  async function signup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(undefined);
    try {
      const { orgId } = await api<{ orgId: string }>('/auth/signup', {
        method: 'POST',
        json: { name: f.get('name'), email: data.email, password: f.get('password'), inviteToken: token },
      });
      router.replace(`/orgs/${orgId}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Join {data.orgName}</h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;ve been invited as <b className="text-ink-2">{data.role}</b> ({data.email}).
        </p>
      </div>
      {me.data ? (
        <>
          <p className="text-sm text-ink-2">Signed in as {me.data.email}.</p>
          <ErrorText>{error}</ErrorText>
          <Button onClick={accept} loading={loading} className="w-full">
            Accept invite
          </Button>
        </>
      ) : (
        <form onSubmit={signup} className="space-y-4">
          <Field label="Your name">
            <Input name="name" required autoFocus />
          </Field>
          <Field label="Choose a password" hint="At least 10 characters.">
            <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" loading={loading} className="w-full">
            Create account &amp; join
          </Button>
          <p className="text-center text-sm text-muted">
            Already have an account?{' '}
            <Link href={`/login?next=/invite/${token}`} className="font-medium text-accent hover:underline">
              Sign in to accept
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
