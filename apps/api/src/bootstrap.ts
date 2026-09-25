import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env';

/** Shared HTTP setup, applied in main.ts and in e2e tests so tests exercise the real stack. */
export function configureApp(app: INestApplication, env: Env) {
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_URL, credentials: true });
  app.enableShutdownHooks();
}
