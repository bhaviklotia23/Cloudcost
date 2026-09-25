export const COST_SYNC_QUEUE = 'cost-sync';
export const DIGEST_QUEUE = 'digest';

export const JOB = {
  syncAll: 'sync-all', // scheduled: fan out one sync-account per connected account
  syncAccount: 'sync-account',
  digestAll: 'digest-all', // scheduled: fan out one digest-org per org
  digestOrg: 'digest-org',
} as const;

export type SyncAccountData = { accountId: string; weeks: string[]; reason: 'backfill' | 'scheduled' | 'manual' };
export type DigestOrgData = { orgId: string; weekStart: string };

export const DEFAULT_JOB_OPTS = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
  removeOnFail: { age: 30 * 24 * 3600 },
} as const;
