import { afterEach, describe, expect, it } from 'vitest';

import {
  getRefreshHealth,
  recordRefreshFailure,
  recordRefreshSuccess,
  resetRefreshHealthForTests,
} from './refreshHealth';
import type { ProviderSyncSummary } from './apiFootballSync';

const staleAfterMs = 36 * 60 * 60 * 1000;

const summary: ProviderSyncSummary = {
  providerSource: 'apiFootball',
  fetched: 20,
  transformed: 20,
  playersUpserted: 20,
  statsUpserted: 20,
  skipped: 0,
};

afterEach(() => {
  resetRefreshHealthForTests();
});

describe('refresh health', () => {
  it('starts unknown and needing attention before any refresh is recorded', () => {
    const health = getRefreshHealth(new Date('2026-01-01T00:00:00.000Z'), staleAfterMs);

    expect(health.status).toBe('unknown');
    expect(health.isStale).toBe(true);
    expect(health.needsAttention).toBe(true);
    expect(health.lastSuccessAt).toBeNull();
  });

  it('marks a fresh successful refresh as healthy', () => {
    recordRefreshSuccess(summary, new Date('2026-01-01T00:00:00.000Z'));

    const health = getRefreshHealth(new Date('2026-01-01T01:00:00.000Z'), staleAfterMs);
    expect(health.status).toBe('healthy');
    expect(health.isStale).toBe(false);
    expect(health.needsAttention).toBe(false);
    expect(health.lastSummary).toEqual(summary);
  });

  it('marks an old successful refresh as stale', () => {
    recordRefreshSuccess(summary, new Date('2026-01-01T00:00:00.000Z'));

    const health = getRefreshHealth(
      new Date('2026-01-03T00:00:01.000Z'),
      staleAfterMs,
    );
    expect(health.status).toBe('stale');
    expect(health.isStale).toBe(true);
    expect(health.needsAttention).toBe(true);
  });

  it('can evaluate stale status from a persisted last success timestamp', () => {
    const health = getRefreshHealth(
      new Date('2026-01-01T01:00:00.000Z'),
      staleAfterMs,
      '2026-01-01T00:00:00.000Z',
    );

    expect(health.status).toBe('healthy');
    expect(health.needsAttention).toBe(false);
    expect(health.lastSuccessAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('marks a sync failure after the last success as failed', () => {
    recordRefreshSuccess(summary, new Date('2026-01-01T00:00:00.000Z'));
    recordRefreshFailure({
      providerSource: 'apiFootball',
      errorName: 'Error',
      errorMessage: 'provider unavailable',
      durationMs: 1500,
    }, new Date('2026-01-01T02:00:00.000Z'));

    const health = getRefreshHealth(new Date('2026-01-01T02:01:00.000Z'), staleAfterMs);
    expect(health.status).toBe('failed');
    expect(health.needsAttention).toBe(true);
    expect(health.lastSuccessAt).toBe('2026-01-01T00:00:00.000Z');
    expect(health.lastFailure).toMatchObject({
      errorName: 'Error',
      errorMessage: 'provider unavailable',
    });
  });

  it('clears a current failure after a later successful refresh', () => {
    recordRefreshFailure({
      providerSource: 'apiFootball',
      errorName: 'Error',
      errorMessage: 'provider unavailable',
      durationMs: 1500,
    }, new Date('2026-01-01T00:00:00.000Z'));
    recordRefreshSuccess(summary, new Date('2026-01-01T01:00:00.000Z'));

    const health = getRefreshHealth(new Date('2026-01-01T01:01:00.000Z'), staleAfterMs);
    expect(health.status).toBe('healthy');
    expect(health.needsAttention).toBe(false);
    expect(health.lastFailureAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
