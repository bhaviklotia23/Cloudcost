'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { fetcher } from './api';
import type { Me, Org } from './types';

export function useOrgId() {
  return useParams<{ orgId: string }>().orgId;
}

export function useMe() {
  return useSWR<Me>('/auth/me', fetcher);
}

export function useOrg() {
  const orgId = useOrgId();
  return useSWR<Org>(`/orgs/${orgId}`, fetcher);
}
