'use client';

import clsx from 'clsx';
import { BarChart3, Cloud, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { Logo, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe, useOrg, useOrgId } from '@/lib/hooks';

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const orgId = useOrgId();
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const org = useOrg();
  const [open, setOpen] = useState(false);
  const { mutate } = useSWRConfig();

  useEffect(() => {
    try {
      localStorage.setItem('cc:lastOrg', orgId);
    } catch {}
  }, [orgId]);

  const nav = [
    { href: `/orgs/${orgId}`, label: 'Dashboard', icon: BarChart3 },
    { href: `/orgs/${orgId}/accounts`, label: 'AWS accounts', icon: Cloud },
    { href: `/orgs/${orgId}/team`, label: 'Team', icon: Users },
    { href: `/orgs/${orgId}/settings`, label: 'Settings', icon: Settings },
  ];

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    // Drop every cached response from this session before the next user signs in.
    await mutate(() => true, undefined, { revalidate: false });
    router.replace('/login');
  }

  if (org.error) {
    return (
      <div className="grid min-h-dvh place-items-center px-4 text-center">
        <div className="space-y-3">
          <p className="text-lg font-semibold">Organization not found</p>
          <Link href="/orgs" className="text-sm font-medium text-accent hover:underline">
            Go to your organization
          </Link>
        </div>
      </div>
    );
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 p-4">
      <Link href={`/orgs/${orgId}`} className="px-2 pt-1">
        <Logo />
      </Link>
      <div className="px-2">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted" htmlFor="org-switch">
          Organization
        </label>
        <select
          id="org-switch"
          value={orgId}
          onChange={(e) => router.push(`/orgs/${e.target.value}`)}
          className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm"
        >
          {me.data?.orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          )) ?? <option>{org.data?.name ?? '…'}</option>}
        </select>
      </div>
      <ul className="space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === `/orgs/${orgId}` ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  active ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto border-t border-line px-2 pt-4">
        <p className="truncate text-sm font-medium">{me.data?.name}</p>
        <p className="truncate text-xs text-muted">{me.data?.email}</p>
        <button onClick={logout} className="mt-3 flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:block lg:h-dvh">{sidebar}</aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-surface-2">
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-3 rounded-lg p-2 hover:bg-surface-2">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        {org.data ? children : <Spinner />}
      </main>
    </div>
  );
}
