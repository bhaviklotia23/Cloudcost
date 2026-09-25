import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';

export const SESSION_COOKIE = 'cc_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function sessionCookieOptions(env: Env): CookieOptions {
  return {
    httpOnly: true, // not readable from JS -> XSS can't exfiltrate the session
    sameSite: 'lax', // not sent on cross-site POSTs -> CSRF mitigation
    secure: env.COOKIE_SECURE,
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string, env: Env) {
  res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(env), maxAge: SESSION_TTL_SECONDS * 1000 });
}

export function clearSessionCookie(res: Response, env: Env) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(env));
}
