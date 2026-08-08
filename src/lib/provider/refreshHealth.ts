import type {
  CronProviderSyncHealthRuns,
  ProviderSyncRun,
} from '../supabase/providerSyncRuns';
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
  runStatus: ProviderSyncRun['status'] | null;
  checkedAt: string;
  staleAfterMs: number;
  invocationKey: string | null;
  targetKey: string | null;
  leaseExpiresAt: string | null;
  leaseExpired: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastSummary: ProviderSyncSummary | null;
  lastFailure: RefreshFailureMetadata | null;
  ageMs: number | null;
  isStale: boolean;
  needsAttention: boolean;
}

export function getRefreshStaleAfterMs(): number {
  const hours = Number(process.env.REFRESH_STALE_AFTER_HOURS);
  if (Number.isFinite(hours) && hours > 0) {
    return hours * 60 * 60 * 1000;
  }
  return DEFAULT_STALE_AFTER_MS;
}

export function getRefreshHealth(
  persistedRuns: CronProviderSyncHealthRuns,
  checkedAt = new Date(),
  staleAfterMs = getRefreshStaleAfterMs(),
): RefreshHealthSnapshot {
  const { latestRun, latestCompletedRun, latestFailedRun } = persistedRuns;
  const checkedTime = checkedAt.getTime();
  const completedTime = toTime(latestRun?.completedAt ?? null);
  const startedTime = toTime(latestRun?.startedAt ?? null);
  const leaseExpiryTime = toTime(latestRun?.leaseExpiresAt ?? null);
  const activityTime = completedTime ?? startedTime;
  const ageMs = activityTime === null ? null : Math.max(0, checkedTime - activityTime);
  const leaseExpired = latestRun?.status === 'running'
    && (leaseExpiryTime === null || checkedTime > leaseExpiryTime);

  let status: RefreshHealthStatus = 'unknown';
  let isStale = latestRun === null;

  if (latestRun?.status === 'failed') {
    status = 'failed';
    isStale = false;
  } else if (latestRun?.status === 'running') {
    status = leaseExpired ? 'stale' : 'unknown';
    isStale = leaseExpired;
  } else if (latestRun?.status === 'completed') {
    isStale = ageMs === null || ageMs > staleAfterMs;
    status = isStale ? 'stale' : 'healthy';
  }

  const lastSuccessAt = latestCompletedRun?.completedAt ?? null;
  const lastFailureAt = latestFailedRun?.completedAt ?? null;

  return {
    providerSource: API_FOOTBALL_PROVIDER,
    status,
    runStatus: latestRun?.status ?? null,
    checkedAt: checkedAt.toISOString(),
    staleAfterMs,
    invocationKey: latestRun?.invocationKey ?? null,
    targetKey: latestRun?.targetKey ?? null,
    leaseExpiresAt: latestRun?.leaseExpiresAt ?? null,
    leaseExpired,
    lastSuccessAt,
    lastFailureAt,
    lastSummary: latestCompletedRun?.summary
      ? latestCompletedRun.summary as unknown as ProviderSyncSummary
      : null,
    lastFailure: latestFailedRun ? toFailure(latestFailedRun.error) : null,
    ageMs,
    isStale,
    needsAttention: status !== 'healthy',
  };
}

function toFailure(error: Record<string, unknown> | null): RefreshFailureMetadata {
  return {
    providerSource: stringValue(error?.providerSource) ?? API_FOOTBALL_PROVIDER,
    errorName: stringValue(error?.errorName) ?? 'UnknownError',
    errorMessage: stringValue(error?.errorMessage) ?? 'Unknown cron refresh failure',
    durationMs: numberValue(error?.durationMs) ?? 0,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toTime(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
