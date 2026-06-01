import type { ProviderSyncSummary } from './apiFootballSync';
import { API_FOOTBALL_PROVIDER } from './types';

const DEFAULT_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export type RefreshHealthStatus = 'healthy' | 'stale' | 'failed' | 'unknown';

export interface RefreshFailureMetadata {
  providerSource?: string;
  errorName: string;
  errorMessage: string;
  durationMs: number;
}

export interface RefreshHealthSnapshot {
  providerSource: string;
  status: RefreshHealthStatus;
  checkedAt: string;
  staleAfterMs: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastSummary: ProviderSyncSummary | null;
  lastFailure: RefreshFailureMetadata | null;
  ageMs: number | null;
  isStale: boolean;
  needsAttention: boolean;
}

type RefreshHealthState = {
  providerSource: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastSummary: ProviderSyncSummary | null;
  lastFailure: RefreshFailureMetadata | null;
};

let refreshHealthState: RefreshHealthState = emptyState();

function emptyState(): RefreshHealthState {
  return {
    providerSource: API_FOOTBALL_PROVIDER,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastSummary: null,
    lastFailure: null,
  };
}

export function getRefreshStaleAfterMs(): number {
  const hours = Number(process.env.REFRESH_STALE_AFTER_HOURS);
  if (Number.isFinite(hours) && hours > 0) {
    return hours * 60 * 60 * 1000;
  }
  return DEFAULT_STALE_AFTER_MS;
}

export function recordRefreshSuccess(
  summary: ProviderSyncSummary,
  completedAt = new Date(),
): RefreshHealthSnapshot {
  refreshHealthState = {
    ...refreshHealthState,
    providerSource: summary.providerSource,
    lastSuccessAt: completedAt.toISOString(),
    lastSummary: summary,
  };

  return getRefreshHealth(completedAt);
}

export function recordRefreshFailure(
  failure: RefreshFailureMetadata,
  failedAt = new Date(),
): RefreshHealthSnapshot {
  refreshHealthState = {
    ...refreshHealthState,
    providerSource: failure.providerSource ?? refreshHealthState.providerSource,
    lastFailureAt: failedAt.toISOString(),
    lastFailure: failure,
  };

  return getRefreshHealth(failedAt);
}

export function getRefreshHealth(
  checkedAt = new Date(),
  staleAfterMs = getRefreshStaleAfterMs(),
  persistedLastSuccessAt?: string,
): RefreshHealthSnapshot {
  const lastSuccessAt = persistedLastSuccessAt ?? refreshHealthState.lastSuccessAt;
  const lastSuccessTime = toTime(lastSuccessAt);
  const lastFailureTime = toTime(refreshHealthState.lastFailureAt);
  const checkedTime = checkedAt.getTime();
  const ageMs = lastSuccessTime === null ? null : Math.max(0, checkedTime - lastSuccessTime);
  const hasCurrentFailure = lastFailureTime !== null
    && (lastSuccessTime === null || lastFailureTime > lastSuccessTime);
  const isStale = ageMs === null || ageMs > staleAfterMs;

  let status: RefreshHealthStatus = 'unknown';
  if (hasCurrentFailure) {
    status = 'failed';
  } else if (isStale) {
    status = lastSuccessTime === null ? 'unknown' : 'stale';
  } else {
    status = 'healthy';
  }

  return {
    providerSource: refreshHealthState.providerSource,
    status,
    checkedAt: checkedAt.toISOString(),
    staleAfterMs,
    lastSuccessAt,
    lastFailureAt: refreshHealthState.lastFailureAt,
    lastSummary: refreshHealthState.lastSummary,
    lastFailure: refreshHealthState.lastFailure,
    ageMs,
    isStale,
    needsAttention: status !== 'healthy',
  };
}

export function resetRefreshHealthForTests(): void {
  refreshHealthState = emptyState();
}

function toTime(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
