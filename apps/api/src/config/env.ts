import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  QUEUE_PREFIX: z.string().default('cloudcost'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  COOKIE_SECURE: bool.default(false),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('CloudCost <digest@cloudcost.local>'),
  CLOUDCOST_PRINCIPAL_ARN: z
    .string()
    .regex(/^arn:aws:iam::\d{12}:(role|user)\/.+$/, 'must be an IAM role or user ARN')
    .default('arn:aws:iam::111122223333:role/cloudcost-app'),
  CFN_TEMPLATE_URL: z.union([z.string().url(), z.literal('')]).default(''),
  ENABLE_DEMO_ACCOUNTS: bool.default(true),
  SYNC_CRON: z.string().default('0 6 * * *'),
  DIGEST_CRON: z.string().default('0 9 * * 1'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Parses and validates process.env once. Fails fast on boot with a readable error. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (source === process.env) cached = result.data;
  return result.data;
}

export const ENV = Symbol('ENV');
