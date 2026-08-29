import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServerSupabaseClient } from './server';
import {
  claimProviderSyncRun,
  createApiFootballManualTargetKey,
  createCronInvocationKey,
  createManualInvocationKey,
  createProviderSyncLockScope,
  finalizeProviderSyncRun,
  getCronProviderSyncHealthRuns,
  getScheduledApiFootballTarget,
  runManualProviderSync,
} from './providerSyncRuns';

vi.mock('./server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);
const savedServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const persistedRow = {
  id: 'run-id',
  invocation_key: 'cron:apiFootball:2024:39:1970-01-01',
  run_kind: 'cron' as const,
  target_key: 'apiFootball:2024:39',
  lock_scope: 'apiFootball:2024',
  utc_date: '1970-01-01',
  status: 'running' as const,
  lock_token: '11111111-1111-4111-8111-111111111111',
  lease_expires_at: '1970-01-01T00:10:00.000Z',
  started_at: '1970-01-01T00:00:00.000Z',
  completed_at: null,
  summary: null,
  error: null,
  created_at: '1970-01-01T00:00:00.000Z',
  updated_at: '1970-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

afterEach(() => {
  if (savedServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedServiceRoleKey;
  }
});

describe('provider sync run scheduling', () => {
  it('rotates the fixed Big Five order by UTC epoch day', () => {
    expect(getScheduledApiFootballTarget(new Date('1970-01-01T23:59:59.000Z')).leagueId).toBe('39');
    expect(getScheduledApiFootballTarget(new Date('1970-01-02T00:00:00.000Z')).leagueId).toBe('140');
    expect(getScheduledApiFootballTarget(new Date('1970-01-03T12:00:00.000Z')).leagueId).toBe('135');
    expect(getScheduledApiFootballTarget(new Date('1970-01-04T12:00:00.000Z')).leagueId).toBe('78');
    expect(getScheduledApiFootballTarget(new Date('1970-01-05T12:00:00.000Z')).leagueId).toBe('61');
    expect(getScheduledApiFootballTarget(new Date('1970-01-06T12:00:00.000Z')).leagueId).toBe('39');
  });

  it('builds the exact daily cron invocation key and random manual keys', () => {
    const target = getScheduledApiFootballTarget(new Date('1970-01-01T12:00:00.000Z'));

    expect(target.targetKey).toBe('apiFootball:2024:39');
    expect(target.lockScope).toBe('apiFootball:2024');
    expect(createCronInvocationKey(target)).toBe('cron:apiFootball:2024:39:1970-01-01');

    const firstManualKey = createManualInvocationKey(target.targetKey);
    const secondManualKey = createManualInvocationKey(target.targetKey);
    expect(firstManualKey).toMatch(/^manual:apiFootball:2024:39:[0-9a-f-]{36}$/);
    expect(secondManualKey).not.toBe(firstManualKey);
  });

  it('builds allowlisted single-league and full manual target keys', () => {
    expect(createApiFootballManualTargetKey(['39'])).toBe('apiFootball:2024:39');
    expect(createApiFootballManualTargetKey()).toBe('apiFootball:2024:39,140,135,78,61');
    expect(() => createApiFootballManualTargetKey([])).toThrow('at least one target league');
    expect(createProviderSyncLockScope('apiFootball', '2024')).toBe('apiFootball:2024');
  });
});

describe('provider sync run persistence', () => {
  it('claims a run through the atomic RPC and maps its persisted row', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ claimed: true, ...persistedRow }],
      error: null,
    });
    mockedCreateServerSupabaseClient.mockReturnValue({ rpc } as never);

    await expect(claimProviderSyncRun({
      invocationKey: persistedRow.invocation_key,
      runKind: 'cron',
      targetKey: persistedRow.target_key,
      lockScope: persistedRow.lock_scope,
      utcDate: persistedRow.utc_date,
      lockToken: persistedRow.lock_token,
    })).resolves.toMatchObject({
      claimed: true,
      run: {
        id: 'run-id',
        invocationKey: persistedRow.invocation_key,
        status: 'running',
      },
    });

    expect(rpc).toHaveBeenCalledWith('claim_provider_sync_run', {
      p_invocation_key: persistedRow.invocation_key,
      p_run_kind: 'cron',
      p_target_key: persistedRow.target_key,
      p_lock_scope: persistedRow.lock_scope,
      p_utc_date: persistedRow.utc_date,
      p_lock_token: persistedRow.lock_token,
    });
  });

  it('keeps a prior failed invocation as an unclaimed duplicate', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        claimed: false,
        ...persistedRow,
        status: 'failed',
        completed_at: '1970-01-01T00:02:00.000Z',
        error: { errorName: 'Error', errorMessage: 'failed once', durationMs: 100 },
      }],
      error: null,
    });
    mockedCreateServerSupabaseClient.mockReturnValue({ rpc } as never);

    const result = await claimProviderSyncRun({
      invocationKey: persistedRow.invocation_key,
      runKind: 'cron',
      targetKey: persistedRow.target_key,
      lockScope: persistedRow.lock_scope,
      utcDate: persistedRow.utc_date,
      lockToken: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.claimed).toBe(false);
    expect(result.run.status).toBe('failed');
  });

  it('finalizes only the matching invocation and lock token through the RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mockedCreateServerSupabaseClient.mockReturnValue({ rpc } as never);

    await expect(finalizeProviderSyncRun({
      invocationKey: persistedRow.invocation_key,
      lockToken: persistedRow.lock_token,
      status: 'completed',
      summary: { fetched: 20 },
    })).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith('finalize_provider_sync_run', {
      p_invocation_key: persistedRow.invocation_key,
      p_lock_token: persistedRow.lock_token,
      p_status: 'completed',
      p_summary: { fetched: 20 },
      p_error: null,
    });
  });

  it('reads the latest overall, completed, and failed cron runs for persisted health', async () => {
    const queries: ReturnType<typeof createHealthQuery>[] = [];
    const from = vi.fn(() => {
      const query = createHealthQuery();
      queries.push(query);
      return query.builder;
    });
    mockedCreateServerSupabaseClient.mockReturnValue({ from } as never);

    await expect(getCronProviderSyncHealthRuns()).resolves.toMatchObject({
      latestRun: {
        invocationKey: persistedRow.invocation_key,
        status: 'running',
      },
      latestCompletedRun: { status: 'completed' },
      latestFailedRun: { status: 'failed' },
    });

    expect(from).toHaveBeenCalledTimes(3);
    expect(from).toHaveBeenCalledWith('provider_sync_runs');
    expect(queries.map((query) => query.status)).toEqual([undefined, 'completed', 'failed']);
    for (const query of queries) {
      expect(query.eq).toHaveBeenCalledWith('run_kind', 'cron');
      expect(query.like).toHaveBeenCalledWith('target_key', 'apiFootball:2024:%');
      expect(query.order).toHaveBeenCalledWith('started_at', { ascending: false });
      expect(query.limit).toHaveBeenCalledWith(1);
    }
  });

  it('fails closed before any database call without a service-role key', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await expect(claimProviderSyncRun({
      invocationKey: persistedRow.invocation_key,
      runKind: 'cron',
      targetKey: persistedRow.target_key,
      lockScope: persistedRow.lock_scope,
      utcDate: persistedRow.utc_date,
      lockToken: persistedRow.lock_token,
    })).rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY is required');

    expect(mockedCreateServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('claims and finalizes two same-day manual runs under distinct random keys', async () => {
    const rpc = createManualRpc();
    mockedCreateServerSupabaseClient.mockReturnValue({ rpc } as never);
    const targetKey = createApiFootballManualTargetKey();
    const sync = vi.fn().mockResolvedValue({ providerSource: 'apiFootball', fetched: 1000 });

    const first = await runManualProviderSync(
      targetKey,
      sync,
      new Date('2026-01-01T01:00:00.000Z'),
    );
    const second = await runManualProviderSync(
      targetKey,
      sync,
      new Date('2026-01-01T02:00:00.000Z'),
    );

    expect(first.invocationKey).not.toBe(second.invocationKey);
    expect(first.invocationKey).toMatch(/^manual:apiFootball:2024:39,140,135,78,61:/);
    expect(second.summary).toEqual({ providerSource: 'apiFootball', fetched: 1000 });
    expect(sync).toHaveBeenCalledTimes(2);

    const claimCalls = rpc.mock.calls.filter(([name]) => name === 'claim_provider_sync_run');
    const finalizeCalls = rpc.mock.calls.filter(([name]) => name === 'finalize_provider_sync_run');
    expect(claimCalls).toHaveLength(2);
    expect(claimCalls.map(([, args]) => args)).toEqual(expect.arrayContaining([
      expect.objectContaining({ p_run_kind: 'manual', p_utc_date: '2026-01-01' }),
    ]));
    expect(finalizeCalls).toHaveLength(2);
    expect(finalizeCalls.map(([, args]) => args)).toEqual(expect.arrayContaining([
      expect.objectContaining({ p_status: 'completed', p_summary: { fetched: 1000, providerSource: 'apiFootball' } }),
    ]));
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(sync.mock.invocationCallOrder[0]);
  });

  it('makes zero provider calls when another target holds the provider-season scope', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ claimed: false, ...persistedRow }],
      error: null,
    });
    mockedCreateServerSupabaseClient.mockReturnValue({ rpc } as never);
    const sync = vi.fn().mockResolvedValue({ providerSource: 'apiFootball', fetched: 20 });

    await expect(runManualProviderSync(
      createApiFootballManualTargetKey(['140']),
      sync,
      new Date('2026-01-01T01:00:00.000Z'),
    )).rejects.toThrow('Provider sync quota scope is already active');

    expect(sync).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('claim_provider_sync_run', expect.objectContaining({
      p_target_key: 'apiFootball:2024:140',
      p_lock_scope: 'apiFootball:2024',
    }));
  });

  it('finalizes a claimed manual run as failed when its sync callback rejects', async () => {
    const rpc = createManualRpc();
    mockedCreateServerSupabaseClient.mockReturnValue({ rpc } as never);
    const sync = vi.fn().mockRejectedValue(new Error('provider unavailable'));

    await expect(runManualProviderSync(
      createApiFootballManualTargetKey(['39']),
      sync,
      new Date('2026-01-01T01:00:00.000Z'),
    )).rejects.toThrow('provider unavailable');

    expect(rpc).toHaveBeenLastCalledWith('finalize_provider_sync_run', expect.objectContaining({
      p_status: 'failed',
      p_error: expect.objectContaining({
        errorName: 'Error',
        errorMessage: 'provider unavailable',
      }),
    }));
  });
});

function createManualRpc() {
  return vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'claim_provider_sync_run') {
      return {
        data: [{
          claimed: true,
          ...persistedRow,
          invocation_key: args.p_invocation_key,
          run_kind: args.p_run_kind,
          target_key: args.p_target_key,
          lock_scope: args.p_lock_scope,
          utc_date: args.p_utc_date,
          lock_token: args.p_lock_token,
        }],
        error: null,
      };
    }
    if (name === 'finalize_provider_sync_run') {
      return { data: true, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
}

function createHealthQuery() {
  let selectedStatus: 'completed' | 'failed' | undefined;
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const select = vi.fn(() => builder);
  const eq = vi.fn((column: string, value: string) => {
    if (column === 'status' && (value === 'completed' || value === 'failed')) {
      selectedStatus = value;
    }
    return builder;
  });
  const like = vi.fn(() => builder);
  const order = vi.fn(() => builder);
  const limit = vi.fn(async () => ({
    data: [{
      ...persistedRow,
      status: selectedStatus ?? 'running',
      completed_at: selectedStatus ? '1970-01-01T00:02:00.000Z' : null,
    }],
    error: null,
  }));
  Object.assign(builder, { select, eq, like, order, limit });

  return {
    builder,
    select,
    eq,
    like,
    order,
    limit,
    get status() {
      return selectedStatus;
    },
  };
}
