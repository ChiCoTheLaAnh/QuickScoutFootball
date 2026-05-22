import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET } from './route';

const savedEnv = {
  cronSecret: process.env.CRON_SHARED_SECRET,
  logLevel: process.env.LOG_LEVEL,
};

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

beforeAll(() => {
  process.env.LOG_LEVEL = 'silent';
});

afterAll(() => {
  restoreEnvValue('CRON_SHARED_SECRET', savedEnv.cronSecret);
  restoreEnvValue('LOG_LEVEL', savedEnv.logLevel);
});

describe('GET /api/cron/refresh', () => {
  it('returns 503 when the cron secret is not configured', async () => {
    delete process.env.CRON_SHARED_SECRET;

    const response = await GET(new Request('http://localhost/api/cron/refresh'));
    expect(response.status).toBe(503);

    const payload = await response.json();
    expect(payload.error).toBe('Cron shared secret is not configured.');
    expect(payload.code).toBe('CRON_NOT_CONFIGURED');
  });

  it('returns 401 without a matching cron secret header', async () => {
    process.env.CRON_SHARED_SECRET = 'test-cron-secret';

    const response = await GET(new Request('http://localhost/api/cron/refresh', {
      headers: { 'x-cron-secret': 'wrong-secret' },
    }));
    expect(response.status).toBe(401);

    const payload = await response.json();
    expect(payload.error).toBe('Unauthorized cron request.');
    expect(payload.code).toBe('CRON_UNAUTHORIZED');
  });

  it('keeps the not implemented response when cron auth passes', async () => {
    process.env.CRON_SHARED_SECRET = 'test-cron-secret';

    const response = await GET(new Request('http://localhost/api/cron/refresh', {
      headers: { 'x-cron-secret': 'test-cron-secret' },
    }));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe('not_implemented');
    expect(payload.message).toBe('Daily provider refresh will be implemented in a later task.');
  });
});
