import type { Request } from 'express';
import type { Role } from '../db/schema';

export type AuthUser = { id: string; email: string };
export type Membership = { orgId: string; userId: string; role: Role };

export type AppRequest = Request & { user?: AuthUser; membership?: Membership };
