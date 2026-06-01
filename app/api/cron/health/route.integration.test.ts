import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  recordRefreshFailure,
  recordRefreshSuccess,
  resetRefreshHealthForTests,
} from '@/src/lib/provider/refreshHealth';
import type { ProviderSyncSummary } from '@/src/lib/provider/apiFootballSync';
import { getProviderLastSyncedAt } from '@/src/lib/supabase/providerSync';
import { GET } from './route';

vi.mock('@/src/lib/supabase/providerSync', () => ({
  getProviderLastSyncedAt: vi.fn(),
}));

const mockedGetProviderLastSyncedAt = vi.mocked(getProviderLastSyncedAt);

const savedEnv = {
  cronSecret: process.env.CRON_SECRET,
  logLevel: process.env.LOG_LEVEL,
  refreshStaleAfterHours: process.env.REFRESH_STALE_AFTER_HOURS,
};

const summary: ProviderSyncSummary = {
  providerSource: 'apiFootball',
  fetched: 20,
  transformed: 20,
  playersUpserted: 20,
  statsUpserted: 20,
  skipped: 0,
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
  mockedGetProviderLastSyncedAt.mockResolvedValue(null);
  process.env.LOG_LEVEL = 'silent';
  process.env.REFRESH_STALE_AFTER_HOURS = '36';
});

afterEach(() => {
  resetRefreshHealthForTests();
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

    const payload = await response.json();
    expect(payload.error).toBe('Cron secret is not configured.');
    expect(payload.code).toBe('CRON_NOT_CONFIGURED');
  });

  it('returns 401 without a matching authorization header', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';

    const response = await GET(new Request('http://localhost/api/cron/health', {
      headers: { authorization: 'Bearer wrong-secret' },
    }));
    expect(response.status).toBe(401);

    const payload = await response.json();
    expect(payload.error).toBe('Unauthorized cron request.');
    expect(payload.code).toBe('CRON_UNAUTHORIZED');
  });

  it('returns an unknown attention state before any refresh has been recorded', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';

    const response = await GET(new Request('http://localhost/api/cron/health', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe('unknown');
    expect(payload.needsAttention).toBe(true);
    expect(payload.isStale).toBe(true);
  });

  it('returns healthy after a fresh successful refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T01:00:00.000Z'));
    process.env.CRON_SECRET = 'test-cron-secret';
    recordRefreshSuccess(summary, new Date('2026-01-01T00:00:00.000Z'));

    const response = await GET(new Request('http://localhost/api/cron/health', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe('healthy');
    expect(payload.needsAttention).toBe(false);
    expect(payload.lastSummary).toEqual(summary);
  });

  it('uses the persisted provider sync timestamp when available', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T01:00:00.000Z'));
    process.env.CRON_SECRET = 'test-cron-secret';
    mockedGetProviderLastSyncedAt.mockResolvedValue('2026-01-01T00:00:00.000Z');

    const response = await GET(new Request('http://localhost/api/cron/health', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe('healthy');
    expect(payload.needsAttention).toBe(false);
    expect(payload.lastSuccessAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns stale after the success threshold is exceeded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-03T00:00:01.000Z'));
    process.env.CRON_SECRET = 'test-cron-secret';
    recordRefreshSuccess(summary, new Date('2026-01-01T00:00:00.000Z'));

    const response = await GET(new Request('http://localhost/api/cron/health', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe('stale');
    expect(payload.isStale).toBe(true);
    expect(payload.needsAttention).toBe(true);
  });

  it('returns failed after an unsuccessful refresh', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';
    recordRefreshFailure({
      providerSource: 'apiFootball',
      errorName: 'Error',
      errorMessage: 'provider unavailable',
      durationMs: 1500,
    });

    const response = await GET(new Request('http://localhost/api/cron/health', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe('failed');
    expect(payload.needsAttention).toBe(true);
    expect(payload.lastFailure).toMatchObject({
      errorName: 'Error',
      errorMessage: 'provider unavailable',
    });
  });
});
