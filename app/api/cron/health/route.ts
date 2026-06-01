import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { logServerEvent } from '@/src/lib/logging';
import { API_FOOTBALL_PROVIDER } from '@/src/lib/provider/types';
import { getRefreshHealth } from '@/src/lib/provider/refreshHealth';
import { getProviderLastSyncedAt } from '@/src/lib/supabase/providerSync';

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

  const persistedLastSuccessAt = await getProviderLastSyncedAt(API_FOOTBALL_PROVIDER)
    .catch(() => null);
  const health = getRefreshHealth(
    new Date(),
    undefined,
    persistedLastSuccessAt ?? undefined,
  );
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
      isStale: health.isStale,
      needsAttention: health.needsAttention,
      lastSuccessAt: health.lastSuccessAt,
      lastFailureAt: health.lastFailureAt,
      ageMs: health.ageMs,
      staleAfterMs: health.staleAfterMs,
    },
  });

  return NextResponse.json(health);
}
