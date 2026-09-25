process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cloudcost:cloudcost@localhost:5432/cloudcost_test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.QUEUE_PREFIX = 'cloudcost-test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-for-hs256';
process.env.WEB_URL = 'http://localhost:3000';
process.env.ENABLE_DEMO_ACCOUNTS = 'true';
