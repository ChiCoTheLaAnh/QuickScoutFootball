import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { logServerEvent } from '@/src/lib/logging';
import { syncApiFootballPlayers } from '@/src/lib/provider/apiFootballSync';
import { getRefreshHealth, type RefreshHealthSnapshot } from '@/src/lib/provider/refreshHealth';
import {
  claimProviderSyncRun,
  createCronInvocationKey,
  finalizeProviderSyncRun,
  getScheduledApiFootballTarget,
} from '@/src/lib/supabase/providerSyncRuns';

// The provider is fetched sequentially and paced from its real minute-quota headers.
// Fluid Compute gives this validation-only canary enough wall time while retaining a hard cap.
export const maxDuration = 300;
const CRON_INTERNAL_DEADLINE_MS = 285_000;

export async function GET(req: Request) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    logServerEvent({
      event: 'cron.refresh.not_configured',
      route: '/api/cron/refresh',
      status: 503,
      durationMs: Date.now() - startedAt,
    });
    return apiError('Cron secret is not configured.', 'CRON_NOT_CONFIGURED', 503);
  }

  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logServerEvent({
      event: 'cron.refresh.unauthorized',
      route: '/api/cron/refresh',
      status: 401,
      durationMs: Date.now() - startedAt,
    });
    return apiError('Unauthorized cron request.', 'CRON_UNAUTHORIZED', 401);
  }

  const invokedAt = new Date();
  const target = getScheduledApiFootballTarget(invokedAt);
  const invocationKey = createCronInvocationKey(target);
  const lockToken = randomUUID();

  let claim: Awaited<ReturnType<typeof claimProviderSyncRun>>;
  try {
    claim = await claimProviderSyncRun({
      invocationKey,
      runKind: 'cron',
      targetKey: target.targetKey,
      utcDate: target.utcDate,
      lockToken,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown provider sync claim failure';
    logServerEvent({
      event: 'cron.refresh.claim_failed',
      route: '/api/cron/refresh',
      status: 500,
      durationMs: Date.now() - startedAt,
      level: 'error',
      metadata: { invocationKey, targetKey: target.targetKey, errorMessage },
    });
    return apiError('Cron refresh claim failed.', 'CRON_REFRESH_CLAIM_FAILED', 500, {
      errorMessage,
    });
  }

  if (!claim.claimed) {
    const durationMs = Date.now() - startedAt;
    logServerEvent({
      event: 'cron.refresh.skipped',
      route: '/api/cron/refresh',
      status: 200,
      durationMs,
      metadata: {
        invocationKey,
        targetKey: target.targetKey,
        existingStatus: claim.run.status,
        reason: 'duplicate_invocation',
        providerCalls: 0,
      },
    });
    return NextResponse.json({
      status: 'skipped',
      reason: 'duplicate_invocation',
      providerCalls: 0,
      invocationKey,
      target: {
        providerSource: target.providerSource,
        season: target.season,
        leagueId: target.leagueId,
      },
    });
  }

  try {
    const summary = await syncApiFootballPlayers({
      targetMode: 'configured',
      leagueIds: [target.leagueId],
      maxPagesPerTarget: 60,
      quotaRuns: 1,
      deadlineAtMs: startedAt + CRON_INTERNAL_DEADLINE_MS,
    });
    const completedAt = new Date();
    const summaryPayload = summary as unknown as Record<string, unknown>;
    const finalized = await finalizeProviderSyncRun({
      invocationKey,
      lockToken,
      status: 'completed',
      summary: summaryPayload,
    });
    if (!finalized) {
      throw new Error('Provider sync run completion rejected the lock token');
    }

    const durationMs = Date.now() - startedAt;
    const completedRun = {
      ...claim.run,
      status: 'completed',
      completedAt: completedAt.toISOString(),
      summary: summaryPayload,
      error: null,
      updatedAt: completedAt.toISOString(),
    } as const;
    const health = getRefreshHealth({
      latestRun: completedRun,
      latestCompletedRun: completedRun,
      latestFailedRun: null,
    }, completedAt);

    logServerEvent({
      event: 'cron.refresh.completed',
      route: '/api/cron/refresh',
      status: 200,
      durationMs,
      metadata: {
        invocationKey,
        targetKey: target.targetKey,
        providerSource: summary.providerSource,
        fetched: summary.fetched,
        transformed: summary.transformed,
        playersUpserted: summary.playersUpserted,
        statsUpserted: summary.statsUpserted,
        skipped: summary.skipped,
        targetsFetched: summary.targetsFetched,
        pagesFetched: summary.pagesFetched,
        ...toRefreshHealthMetadata(health),
      },
    });

    return NextResponse.json({
      status: 'completed',
      invocationKey,
      target: {
        providerSource: target.providerSource,
        season: target.season,
        leagueId: target.leagueId,
      },
      summary,
    });
  } catch (error) {
    const failedAt = new Date();
    const durationMs = Date.now() - startedAt;
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorMessage = error instanceof Error ? error.message : 'Unknown cron refresh failure';
    const failure = {
      providerSource: target.providerSource,
      errorName,
      errorMessage,
      durationMs,
    };

    let finalizationError: string | null = null;
    try {
      const finalized = await finalizeProviderSyncRun({
        invocationKey,
        lockToken,
        status: 'failed',
        error: failure,
      });
      if (!finalized) {
        finalizationError = 'Provider sync run failure rejected the lock token';
      }
    } catch (finalizeError) {
      finalizationError = finalizeError instanceof Error
        ? finalizeError.message
        : 'Unknown provider sync finalization failure';
    }

    const failedRun = {
      ...claim.run,
      status: 'failed',
      completedAt: failedAt.toISOString(),
      summary: null,
      error: failure,
      updatedAt: failedAt.toISOString(),
    } as const;
    const health = getRefreshHealth({
      latestRun: failedRun,
      latestCompletedRun: null,
      latestFailedRun: failedRun,
    }, failedAt);

    logServerEvent({
      event: 'cron.refresh.failed',
      route: '/api/cron/refresh',
      status: 500,
      durationMs,
      metadata: {
        invocationKey,
        targetKey: target.targetKey,
        errorName,
        errorMessage,
        finalizationError,
        ...toRefreshHealthMetadata(health),
      },
    });

    logServerEvent({
      event: 'cron.refresh.alert',
      route: '/api/cron/refresh',
      status: 500,
      durationMs,
      level: 'error',
      metadata: {
        reason: finalizationError ? 'sync_and_persistence_failed' : 'sync_failed',
        invocationKey,
        targetKey: target.targetKey,
        errorName,
        errorMessage,
        finalizationError,
        ...toRefreshHealthMetadata(health),
      },
    });

    return apiError('Cron refresh failed.', 'CRON_REFRESH_FAILED', 500, {
      errorName,
      errorMessage,
    });
  }
}

function toRefreshHealthMetadata(health: RefreshHealthSnapshot) {
  return {
    refreshStatus: health.status,
    runStatus: health.runStatus,
    isStale: health.isStale,
    leaseExpired: health.leaseExpired,
    needsAttention: health.needsAttention,
    lastSuccessAt: health.lastSuccessAt,
    lastFailureAt: health.lastFailureAt,
    ageMs: health.ageMs,
    staleAfterMs: health.staleAfterMs,
  };
}
