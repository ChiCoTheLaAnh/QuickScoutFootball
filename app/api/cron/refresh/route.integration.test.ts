import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncApiFootballPlayers, type ProviderSyncSummary } from '@/src/lib/provider/apiFootballSync';
import {
  claimProviderSyncRun,
  finalizeProviderSyncRun,
  type ClaimProviderSyncRunInput,
  type ProviderSyncRun,
} from '@/src/lib/supabase/providerSyncRuns';
import { GET } from './route';

vi.mock('@/src/lib/provider/apiFootballSync', () => ({
  syncApiFootballPlayers: vi.fn(),
}));

vi.mock('@/src/lib/supabase/providerSyncRuns', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/src/lib/supabase/providerSyncRuns')>(),
  claimProviderSyncRun: vi.fn(),
  finalizeProviderSyncRun: vi.fn(),
}));

const mockedSyncApiFootballPlayers = vi.mocked(syncApiFootballPlayers);
const mockedClaimProviderSyncRun = vi.mocked(claimProviderSyncRun);
const mockedFinalizeProviderSyncRun = vi.mocked(finalizeProviderSyncRun);

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
  vi.useFakeTimers();
  vi.setSystemTime(new Date('1970-01-01T05:00:00.000Z'));
  process.env.LOG_LEVEL = 'silent';
  process.env.CRON_SECRET = 'test-cron-secret';
  mockedClaimProviderSyncRun.mockImplementation(async (input) => ({
    claimed: true,
    run: makeRun(input),
  }));
  mockedFinalizeProviderSyncRun.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnvValue('CRON_SECRET', savedEnv.cronSecret);
  restoreEnvValue('LOG_LEVEL', savedEnv.logLevel);
});

describe('GET /api/cron/refresh', () => {
  it('returns 503 when the cron secret is not configured', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(new Request('http://localhost/api/cron/refresh'));
    expect(response.status).toBe(503);

    const payload = await response.json();
    expect(payload).toMatchObject({
      error: 'Cron secret is not configured.',
      code: 'CRON_NOT_CONFIGURED',
    });
    expect(mockedClaimProviderSyncRun).not.toHaveBeenCalled();
    expect(mockedSyncApiFootballPlayers).not.toHaveBeenCalled();
  });

  it('returns 401 without a matching authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/refresh', {
      headers: { authorization: 'Bearer wrong-secret' },
    }));
    expect(response.status).toBe(401);

    const payload = await response.json();
    expect(payload).toMatchObject({
      error: 'Unauthorized cron request.',
      code: 'CRON_UNAUTHORIZED',
    });
    expect(mockedClaimProviderSyncRun).not.toHaveBeenCalled();
    expect(mockedSyncApiFootballPlayers).not.toHaveBeenCalled();
  });

  it('claims the UTC round-robin target before syncing and persists completion', async () => {
    const summary = {
      providerSource: 'apiFootball',
      fetched: 20,
      transformed: 20,
      playersUpserted: 20,
      statsUpserted: 20,
      skipped: 0,
    } as unknown as ProviderSyncSummary;
    mockedSyncApiFootballPlayers.mockResolvedValue(summary);

    const response = await authorizedGet();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'completed',
      invocationKey: 'cron:apiFootball:2024:39:1970-01-01',
      target: {
        providerSource: 'apiFootball',
        season: '2024',
        leagueId: '39',
      },
      summary,
    });

    expect(mockedClaimProviderSyncRun).toHaveBeenCalledWith(expect.objectContaining({
      invocationKey: 'cron:apiFootball:2024:39:1970-01-01',
      runKind: 'cron',
      targetKey: 'apiFootball:2024:39',
      utcDate: '1970-01-01',
      lockToken: expect.any(String),
    }));
    expect(mockedSyncApiFootballPlayers).toHaveBeenCalledWith({
      targetMode: 'configured',
      leagueIds: ['39'],
      maxPagesPerTarget: 50,
      quotaRuns: 1,
    });
    expect(mockedFinalizeProviderSyncRun).toHaveBeenCalledWith(expect.objectContaining({
      invocationKey: 'cron:apiFootball:2024:39:1970-01-01',
      status: 'completed',
      summary,
    }));
    expect(mockedClaimProviderSyncRun.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSyncApiFootballPlayers.mock.invocationCallOrder[0],
    );
  });

  it('returns 200 skipped and makes zero provider calls for any duplicate, including failed runs', async () => {
    mockedClaimProviderSyncRun.mockImplementation(async (input) => ({
      claimed: false,
      run: {
        ...makeRun(input),
        status: 'failed',
        completedAt: '1970-01-01T05:02:00.000Z',
        error: {
          errorName: 'Error',
          errorMessage: 'first invocation failed',
          durationMs: 120_000,
        },
      },
    }));

    const response = await authorizedGet();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'skipped',
      reason: 'duplicate_invocation',
      providerCalls: 0,
      invocationKey: 'cron:apiFootball:2024:39:1970-01-01',
      target: { leagueId: '39', season: '2024' },
    });
    expect(mockedSyncApiFootballPlayers).not.toHaveBeenCalled();
    expect(mockedFinalizeProviderSyncRun).not.toHaveBeenCalled();
  });

  it('allows only one of two concurrent duplicate requests to reach the provider', async () => {
    mockedClaimProviderSyncRun
      .mockImplementationOnce(async (input) => ({ claimed: true, run: makeRun(input) }))
      .mockImplementationOnce(async (input) => ({ claimed: false, run: makeRun(input) }));
    mockedSyncApiFootballPlayers.mockResolvedValue({
      providerSource: 'apiFootball',
      fetched: 20,
      transformed: 20,
      playersUpserted: 20,
      statsUpserted: 20,
      skipped: 0,
    } as unknown as ProviderSyncSummary);

    const [first, second] = await Promise.all([authorizedGet(), authorizedGet()]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(mockedClaimProviderSyncRun).toHaveBeenCalledTimes(2);
    expect(mockedSyncApiFootballPlayers).toHaveBeenCalledTimes(1);
    expect(mockedFinalizeProviderSyncRun).toHaveBeenCalledTimes(1);
    const statuses = await Promise.all([first.json(), second.json()]);
    expect(statuses.map((payload) => payload.status).sort()).toEqual(['completed', 'skipped']);
    expect(statuses.find((payload) => payload.status === 'skipped')).toMatchObject({ providerCalls: 0 });
  });

  it('finalizes a claimed invocation as failed when the provider fails', async () => {
    mockedSyncApiFootballPlayers.mockRejectedValue(new Error('provider unavailable'));

    const response = await authorizedGet();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Cron refresh failed.',
      code: 'CRON_REFRESH_FAILED',
      details: {
        errorName: 'Error',
        errorMessage: 'provider unavailable',
      },
    });
    expect(mockedFinalizeProviderSyncRun).toHaveBeenCalledWith(expect.objectContaining({
      invocationKey: 'cron:apiFootball:2024:39:1970-01-01',
      status: 'failed',
      error: expect.objectContaining({
        errorName: 'Error',
        errorMessage: 'provider unavailable',
      }),
    }));
  });

  it('fails before calling the provider when the atomic claim is unavailable', async () => {
    mockedClaimProviderSyncRun.mockRejectedValue(new Error('database unavailable'));

    const response = await authorizedGet();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: 'Cron refresh claim failed.',
      code: 'CRON_REFRESH_CLAIM_FAILED',
    });
    expect(mockedSyncApiFootballPlayers).not.toHaveBeenCalled();
    expect(mockedFinalizeProviderSyncRun).not.toHaveBeenCalled();
  });
});

function authorizedGet(): Promise<Response> {
  return GET(new Request('http://localhost/api/cron/refresh', {
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
}

function makeRun(input: ClaimProviderSyncRunInput): ProviderSyncRun {
  return {
    id: 'run-id',
    invocationKey: input.invocationKey,
    runKind: input.runKind,
    targetKey: input.targetKey,
    utcDate: input.utcDate,
    status: 'running',
    lockToken: input.lockToken,
    leaseExpiresAt: '1970-01-01T05:10:00.000Z',
    startedAt: '1970-01-01T05:00:00.000Z',
    completedAt: null,
    summary: null,
    error: null,
    createdAt: '1970-01-01T05:00:00.000Z',
    updatedAt: '1970-01-01T05:00:00.000Z',
  };
}
