import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic auth gate: bounce signed-out visitors away from app pages before rendering.
 * The API is still the real authority — it validates the JWT on every request.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has('cc_session');
  const { pathname, search } = request.nextUrl;

  if (!hasSession && pathname.startsWith('/orgs')) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  if (hasSession && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/orgs', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/orgs/:path*', '/login', '/signup'] };
