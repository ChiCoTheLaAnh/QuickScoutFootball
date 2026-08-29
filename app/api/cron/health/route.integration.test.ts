import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderSyncRun } from '@/src/lib/supabase/providerSyncRuns';
import { getCronProviderSyncHealthRuns } from '@/src/lib/supabase/providerSyncRuns';
import { GET } from './route';

vi.mock('@/src/lib/supabase/providerSyncRuns', () => ({
  getCronProviderSyncHealthRuns: vi.fn(),
}));

const mockedGetCronProviderSyncHealthRuns = vi.mocked(getCronProviderSyncHealthRuns);

const savedEnv = {
  cronSecret: process.env.CRON_SECRET,
  logLevel: process.env.LOG_LEVEL,
  refreshStaleAfterHours: process.env.REFRESH_STALE_AFTER_HOURS,
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T01:00:00.000Z'));
  mockedGetCronProviderSyncHealthRuns.mockResolvedValue(makePersistedRuns(null));
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.LOG_LEVEL = 'silent';
  process.env.REFRESH_STALE_AFTER_HOURS = '36';
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnvValue('CRON_SECRET', savedEnv.cronSecret);
  restoreEnvValue('LOG_LEVEL', savedEnv.logLevel);
  restoreEnvValue('REFRESH_STALE_AFTER_HOURS', savedEnv.refreshStaleAfterHours);
});

describe('GET /api/cron/health', () => {
  it('returns 503 when the cron secret is not configured', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(new Request('http://localhost/api/cron/health'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'Cron secret is not configured.',
      code: 'CRON_NOT_CONFIGURED',
    });
    expect(mockedGetCronProviderSyncHealthRuns).not.toHaveBeenCalled();
  });

  it('returns 401 without a matching authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/health', {
      headers: { authorization: 'Bearer wrong-secret' },
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: 'Unauthorized cron request.',
      code: 'CRON_UNAUTHORIZED',
    });
    expect(mockedGetCronProviderSyncHealthRuns).not.toHaveBeenCalled();
  });

  it('returns unknown before any persisted cron invocation exists', async () => {
    const response = await authorizedGet();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'unknown',
      runStatus: null,
      needsAttention: true,
      isStale: true,
      invocationKey: null,
    });
  });

  it('returns healthy from the latest persisted successful run', async () => {
    const completedRun = makeRun({
      status: 'completed',
      completedAt: '2026-01-01T00:00:00.000Z',
      summary: {
        providerSource: 'apiFootball',
        fetched: 20,
        transformed: 20,
        playersUpserted: 20,
        statsUpserted: 20,
        skipped: 0,
      },
    });
    mockedGetCronProviderSyncHealthRuns.mockResolvedValue(makePersistedRuns(completedRun));

    const response = await authorizedGet();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'healthy',
      runStatus: 'completed',
      needsAttention: false,
      lastSuccessAt: '2026-01-01T00:00:00.000Z',
      lastSummary: { fetched: 20 },
    });
  });

  it('returns failed from persisted error data after a cold start', async () => {
    const failedRun = makeRun({
      status: 'failed',
      completedAt: '2026-01-01T00:02:00.000Z',
      error: {
        errorName: 'Error',
        errorMessage: 'provider unavailable',
        durationMs: 120_000,
      },
    });
    mockedGetCronProviderSyncHealthRuns.mockResolvedValue(makePersistedRuns(failedRun));

    const response = await authorizedGet();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'failed',
      runStatus: 'failed',
      needsAttention: true,
      lastFailure: {
        errorName: 'Error',
        errorMessage: 'provider unavailable',
      },
    });
  });

  it('marks an unfinished invocation stale only after its lease expires', async () => {
    const runningRun = makeRun({
      status: 'running',
      leaseExpiresAt: '2026-01-01T00:10:00.000Z',
    });
    mockedGetCronProviderSyncHealthRuns.mockResolvedValue(makePersistedRuns(runningRun));

    const response = await authorizedGet();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'stale',
      runStatus: 'running',
      leaseExpired: true,
      isStale: true,
      needsAttention: true,
    });
  });

  it('fails closed when persisted health cannot be read', async () => {
    mockedGetCronProviderSyncHealthRuns.mockRejectedValue(new Error('database unavailable'));

    const response = await authorizedGet();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Cron health state is unavailable.',
      code: 'CRON_HEALTH_UNAVAILABLE',
    });
  });

  it('returns the prior success alongside the latest persisted failure', async () => {
    const completedRun = makeRun({
      status: 'completed',
      completedAt: '2025-12-31T23:00:00.000Z',
      summary: { fetched: 20 },
    });
    const failedRun = makeRun({
      invocationKey: 'cron:apiFootball:2024:140:2026-01-01',
      targetKey: 'apiFootball:2024:140',
      status: 'failed',
      completedAt: '2026-01-01T00:02:00.000Z',
      error: {
        errorName: 'Error',
        errorMessage: 'provider unavailable',
        durationMs: 120_000,
      },
    });
    mockedGetCronProviderSyncHealthRuns.mockResolvedValue({
      latestRun: failedRun,
      latestCompletedRun: completedRun,
      latestFailedRun: failedRun,
    });

    const response = await authorizedGet();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'failed',
      lastSuccessAt: '2025-12-31T23:00:00.000Z',
      lastFailureAt: '2026-01-01T00:02:00.000Z',
      lastSummary: { fetched: 20 },
    });
  });
});

function authorizedGet(): Promise<Response> {
  return GET(new Request('http://localhost/api/cron/health', {
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
}

function makePersistedRuns(latestRun: ProviderSyncRun | null) {
  return {
    latestRun,
    latestCompletedRun: latestRun?.status === 'completed' ? latestRun : null,
    latestFailedRun: latestRun?.status === 'failed' ? latestRun : null,
  };
}

function makeRun(overrides: Partial<ProviderSyncRun> = {}): ProviderSyncRun {
  return {
    id: 'run-id',
    invocationKey: 'cron:apiFootball:2024:39:2026-01-01',
    runKind: 'cron',
    targetKey: 'apiFootball:2024:39',
    utcDate: '2026-01-01',
    status: 'running',
    lockToken: '11111111-1111-4111-8111-111111111111',
    leaseExpiresAt: '2026-01-01T00:10:00.000Z',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    summary: null,
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
    lockScope: overrides.lockScope ?? 'apiFootball:2024',
  };
}
