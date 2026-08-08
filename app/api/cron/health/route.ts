import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { logServerEvent } from '@/src/lib/logging';
import { getRefreshHealth } from '@/src/lib/provider/refreshHealth';
import { getCronProviderSyncHealthRuns } from '@/src/lib/supabase/providerSyncRuns';

export async function GET(req: Request) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    logServerEvent({
      event: 'cron.health.not_configured',
      route: '/api/cron/health',
      status: 503,
      durationMs: Date.now() - startedAt,
    });
    return apiError('Cron secret is not configured.', 'CRON_NOT_CONFIGURED', 503);
  }

  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logServerEvent({
      event: 'cron.health.unauthorized',
      route: '/api/cron/health',
      status: 401,
      durationMs: Date.now() - startedAt,
    });
    return apiError('Unauthorized cron request.', 'CRON_UNAUTHORIZED', 401);
  }

  let persistedRuns: Awaited<ReturnType<typeof getCronProviderSyncHealthRuns>>;
  try {
    persistedRuns = await getCronProviderSyncHealthRuns();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown persisted health read failure';
    logServerEvent({
      event: 'cron.health.unavailable',
      route: '/api/cron/health',
      status: 503,
      durationMs: Date.now() - startedAt,
      level: 'error',
      metadata: { errorMessage },
    });
    return apiError('Cron health state is unavailable.', 'CRON_HEALTH_UNAVAILABLE', 503);
  }

  const health = getRefreshHealth(persistedRuns, new Date());
  const durationMs = Date.now() - startedAt;

  logServerEvent({
    event: health.needsAttention ? 'cron.health.attention_required' : 'cron.health.completed',
    route: '/api/cron/health',
    status: 200,
    durationMs,
    level: health.needsAttention ? 'warn' : 'info',
    metadata: {
      providerSource: health.providerSource,
      refreshStatus: health.status,
      runStatus: health.runStatus,
      invocationKey: health.invocationKey,
      targetKey: health.targetKey,
      isStale: health.isStale,
      leaseExpired: health.leaseExpired,
      needsAttention: health.needsAttention,
      lastSuccessAt: health.lastSuccessAt,
      lastFailureAt: health.lastFailureAt,
      ageMs: health.ageMs,
      staleAfterMs: health.staleAfterMs,
    },
  });

  return NextResponse.json(health);
}
