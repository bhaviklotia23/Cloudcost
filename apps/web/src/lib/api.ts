/** Thin fetch wrapper for the NestJS API (proxied at /api by next.config rewrites). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = body?.issues as { path: string; message: string }[] | undefined;
    const message =
      issues?.[0]?.message ??
      (Array.isArray(body?.message) ? body.message[0] : body?.message) ??
      `Request failed (${res.status})`;
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      // Stale/expired cookie: clear it so the proxy doesn't bounce us back, then sign in again.
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      // Deliberate hard navigation: drops all client/SWR state belonging to the old session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(message, res.status, issues);
  }
  return body as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);
