'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import useSWR from 'swr';
import { Spinner } from '@/components/ui';
import { fetcher } from '@/lib/api';
import type { Me } from '@/lib/types';

/** Lands the user in their most recent org. */
export default function OrgsIndex() {
  const router = useRouter();
  const { data } = useSWR<Me>('/auth/me', fetcher);
  useEffect(() => {
    if (!data) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem('cc:lastOrg');
    } catch {}
    const target = data.orgs.find((o) => o.id === last) ?? data.orgs[0];
    router.replace(target ? `/orgs/${target.id}` : '/signup');
  }, [data, router]);
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner label="Loading your organization" />
    </div>
  );
}
