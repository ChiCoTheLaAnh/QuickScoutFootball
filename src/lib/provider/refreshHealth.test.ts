import { describe, expect, it } from 'vitest';

import type { ProviderSyncRun } from '../supabase/providerSyncRuns';
import { getRefreshHealth } from './refreshHealth';

const staleAfterMs = 36 * 60 * 60 * 1000;

describe('persisted refresh health', () => {
  it('is unknown and needs attention before a persisted cron run exists', () => {
    const health = getRefreshHealth(
      makePersistedRuns(null),
      new Date('2026-01-01T00:00:00.000Z'),
      staleAfterMs,
    );

    expect(health).toMatchObject({
      status: 'unknown',
      runStatus: null,
      isStale: true,
      needsAttention: true,
      invocationKey: null,
      lastSuccessAt: null,
    });
  });

  it('uses a fresh persisted completion as healthy state and exposes its summary', () => {
    const run = makeRun({
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

    const health = getRefreshHealth(
      makePersistedRuns(run),
      new Date('2026-01-01T01:00:00.000Z'),
      staleAfterMs,
    );

    expect(health).toMatchObject({
      status: 'healthy',
      runStatus: 'completed',
      invocationKey: run.invocationKey,
      targetKey: run.targetKey,
      lastSuccessAt: run.completedAt,
      isStale: false,
      needsAttention: false,
      lastSummary: { fetched: 20 },
    });
  });

  it('marks a persisted completion stale after the configured threshold', () => {
    const run = makeRun({
      status: 'completed',
      completedAt: '2026-01-01T00:00:00.000Z',
    });

    const health = getRefreshHealth(
      makePersistedRuns(run),
      new Date('2026-01-03T00:00:01.000Z'),
      staleAfterMs,
    );

    expect(health.status).toBe('stale');
    expect(health.isStale).toBe(true);
    expect(health.needsAttention).toBe(true);
  });

  it('reports a persisted failed run without relying on module memory', () => {
    const run = makeRun({
      status: 'failed',
      completedAt: '2026-01-01T00:02:00.000Z',
      error: {
        providerSource: 'apiFootball',
        errorName: 'Error',
        errorMessage: 'provider unavailable',
        durationMs: 120_000,
      },
    });

    const health = getRefreshHealth(
      makePersistedRuns(run),
      new Date('2026-01-01T01:00:00.000Z'),
      staleAfterMs,
    );

    expect(health).toMatchObject({
      status: 'failed',
      runStatus: 'failed',
      lastFailureAt: run.completedAt,
      needsAttention: true,
      lastFailure: {
        errorName: 'Error',
        errorMessage: 'provider unavailable',
        durationMs: 120_000,
      },
    });
  });

  it('uses the ten-minute lease only to mark an unfinished run stale', () => {
    const run = makeRun({
      status: 'running',
      leaseExpiresAt: '2026-01-01T00:10:00.000Z',
      startedAt: '2026-01-01T00:00:00.000Z',
    });

    const active = getRefreshHealth(
      makePersistedRuns(run),
      new Date('2026-01-01T00:09:59.000Z'),
      staleAfterMs,
    );
    expect(active).toMatchObject({
      status: 'unknown',
      leaseExpired: false,
      isStale: false,
      needsAttention: true,
    });

    const expired = getRefreshHealth(
      makePersistedRuns(run),
      new Date('2026-01-01T00:10:01.000Z'),
      staleAfterMs,
    );
    expect(expired).toMatchObject({
      status: 'stale',
      leaseExpired: true,
      isStale: true,
      needsAttention: true,
    });
  });

  it('preserves the latest persisted success and failure alongside current status', () => {
    const latestCompletedRun = makeRun({
      invocationKey: 'cron:apiFootball:2024:39:2026-01-01',
      status: 'completed',
      completedAt: '2026-01-01T00:05:00.000Z',
      summary: { fetched: 20 },
    });
    const latestFailedRun = makeRun({
      invocationKey: 'cron:apiFootball:2024:140:2026-01-02',
      targetKey: 'apiFootball:2024:140',
      status: 'failed',
      completedAt: '2026-01-02T00:05:00.000Z',
      error: {
        errorName: 'Error',
        errorMessage: 'provider unavailable',
        durationMs: 10_000,
      },
    });

    const health = getRefreshHealth({
      latestRun: latestFailedRun,
      latestCompletedRun,
      latestFailedRun,
    }, new Date('2026-01-02T01:00:00.000Z'), staleAfterMs);

    expect(health).toMatchObject({
      status: 'failed',
      lastSuccessAt: '2026-01-01T00:05:00.000Z',
      lastFailureAt: '2026-01-02T00:05:00.000Z',
      lastSummary: { fetched: 20 },
      lastFailure: { errorMessage: 'provider unavailable' },
    });
  });
});

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
  };
}
