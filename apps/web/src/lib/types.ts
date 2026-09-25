export type Role = 'admin' | 'member';

export type Me = {
  id: string;
  email: string;
  name: string;
  orgs: { id: string; name: string; plan: string; role: Role }[];
};

export type Org = {
  id: string;
  name: string;
  plan: string;
  role: Role;
  anomalyThresholdPct: number;
  anomalyMinDelta: number;
  digestEnabled: boolean;
};

export type Member = { userId: string; name: string; email: string; role: Role; joinedAt: string };
export type Invite = { id: string; email: string; role: Role; expiresAt: string; createdAt: string; link?: string; emailSent?: boolean };

export type AwsAccount = {
  id: string;
  nickname: string;
  provider: 'aws' | 'demo';
  status: 'pending' | 'connected' | 'error';
  awsAccountId: string | null;
  roleArn: string | null;
  costTagKey: string;
  lastError: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
};

export type AccountSetup = {
  externalId: string;
  principalArn: string;
  trustPolicy: unknown;
  permissionsPolicy: unknown;
  cloudFormationTemplate: string;
  quickCreateUrl: string | null;
};

export type Anomaly = {
  dimension: 'project' | 'service' | 'total';
  key: string;
  previous: number;
  current: number;
  delta: number;
  changePct: number | null;
};

export type BreakdownRow = { key: string; amount: number; previous: number; share: number; changePct: number | null };

export type Dashboard = {
  currency: string;
  accounts: { id: string; nickname: string; provider: 'aws' | 'demo'; lastSyncedAt: string | null }[];
  scope: string;
  hasData: boolean;
  monthToDate: { month: string; total: number };
  currentWeek: { weekStart: string; total: number };
  latestWeek: null | {
    weekStart: string;
    total: number;
    previousTotal: number | null;
    changePct: number | null;
    byProject: BreakdownRow[];
    byService: BreakdownRow[];
  };
  anomalies: Anomaly[];
  trend: { weekStart: string; total: number | null; isComplete: boolean; byProject: Record<string, number> }[];
};
