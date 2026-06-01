import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncApiFootballPlayers } from '@/src/lib/provider/apiFootballSync';
import { getRefreshHealth, resetRefreshHealthForTests } from '@/src/lib/provider/refreshHealth';
import { GET } from './route';

vi.mock('@/src/lib/provider/apiFootballSync', () => ({
  syncApiFootballPlayers: vi.fn(),
}));

const mockedSyncApiFootballPlayers = vi.mocked(syncApiFootballPlayers);

const savedEnv = {
  cronSecret: process.env.CRON_SECRET,
  logLevel: process.env.LOG_LEVEL,
};

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

beforeEach(() => {
  vi.resetAllMocks();
  resetRefreshHealthForTests();
  process.env.LOG_LEVEL = 'silent';
});

afterEach(() => {
  resetRefreshHealthForTests();
  restoreEnvValue('CRON_SECRET', savedEnv.cronSecret);
  restoreEnvValue('LOG_LEVEL', savedEnv.logLevel);
});

describe('GET /api/cron/refresh', () => {
  it('returns 503 when the cron secret is not configured', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(new Request('http://localhost/api/cron/refresh'));
    expect(response.status).toBe(503);

    const payload = await response.json();
    expect(payload.error).toBe('Cron secret is not configured.');
    expect(payload.code).toBe('CRON_NOT_CONFIGURED');
    expect(mockedSyncApiFootballPlayers).not.toHaveBeenCalled();
    expect(getRefreshHealth().status).toBe('unknown');
  });

  it('returns 401 without a matching authorization header', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';

    const response = await GET(new Request('http://localhost/api/cron/refresh', {
      headers: { authorization: 'Bearer wrong-secret' },
    }));
    expect(response.status).toBe(401);

    const payload = await response.json();
    expect(payload.error).toBe('Unauthorized cron request.');
    expect(payload.code).toBe('CRON_UNAUTHORIZED');
    expect(mockedSyncApiFootballPlayers).not.toHaveBeenCalled();
    expect(getRefreshHealth().status).toBe('unknown');
  });

  it('runs API-Football sync when cron auth passes', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';
    mockedSyncApiFootballPlayers.mockResolvedValue({
      providerSource: 'apiFootball',
      fetched: 20,
      transformed: 20,
      playersUpserted: 20,
      statsUpserted: 20,
      skipped: 0,
    });

    const response = await GET(new Request('http://localhost/api/cron/refresh', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload).toEqual({
      status: 'completed',
      summary: {
        providerSource: 'apiFootball',
        fetched: 20,
        transformed: 20,
        playersUpserted: 20,
        statsUpserted: 20,
        skipped: 0,
      },
    });
    expect(mockedSyncApiFootballPlayers).toHaveBeenCalledOnce();
    expect(getRefreshHealth().status).toBe('healthy');
    expect(getRefreshHealth().lastSummary).toEqual(payload.summary);
  });

  it('returns a coded 500 response when API-Football sync fails', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';
    mockedSyncApiFootballPlayers.mockRejectedValue(new Error('provider unavailable'));

    const response = await GET(new Request('http://localhost/api/cron/refresh', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }));
    expect(response.status).toBe(500);

    const payload = await response.json();
    expect(payload).toEqual({
      error: 'Cron refresh failed.',
      code: 'CRON_REFRESH_FAILED',
      details: {
        errorName: 'Error',
        errorMessage: 'provider unavailable',
      },
    });
    expect(mockedSyncApiFootballPlayers).toHaveBeenCalledOnce();
    const health = getRefreshHealth();
    expect(health.status).toBe('failed');
    expect(health.lastFailure).toMatchObject({
      errorName: 'Error',
      errorMessage: 'provider unavailable',
    });
  });
});
