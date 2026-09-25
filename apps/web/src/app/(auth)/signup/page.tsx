'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorText, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(undefined);
    try {
      const { orgId } = await api<{ orgId: string }>('/auth/signup', {
        method: 'POST',
        json: { name: f.get('name'), email: f.get('email'), password: f.get('password'), orgName: f.get('orgName') },
      });
      router.replace(`/orgs/${orgId}/accounts?welcome=1`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Create your organization</h1>
        <p className="mt-1 text-sm text-muted">You&apos;ll be its admin and can invite teammates next.</p>
      </div>
      <Field label="Your name">
        <Input name="name" autoComplete="name" required autoFocus />
      </Field>
      <Field label="Work email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" hint="At least 10 characters.">
        <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field label="Organization name">
        <Input name="orgName" placeholder="Acme Engineering" required minLength={2} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" loading={loading} className="w-full">
        Create organization
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
