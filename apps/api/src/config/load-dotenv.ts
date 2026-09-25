// Loads apps/api/.env into process.env for local runs (Node >= 20.12 has this built in).
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const file = join(__dirname, '..', '..', '.env');
if (process.env.NODE_ENV !== 'test' && existsSync(file)) {
  process.loadEnvFile(file);
}
