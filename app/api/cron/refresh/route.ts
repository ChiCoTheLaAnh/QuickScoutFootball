import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { logServerEvent } from '@/src/lib/logging';
import { syncApiFootballPlayers } from '@/src/lib/provider/apiFootballSync';

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

  try {
    const summary = await syncApiFootballPlayers();
    const durationMs = Date.now() - startedAt;

    logServerEvent({
      event: 'cron.refresh.completed',
      route: '/api/cron/refresh',
      status: 200,
      durationMs,
      metadata: {
        providerSource: summary.providerSource,
        fetched: summary.fetched,
        transformed: summary.transformed,
        playersUpserted: summary.playersUpserted,
        statsUpserted: summary.statsUpserted,
        skipped: summary.skipped,
      },
    });

    return NextResponse.json({
      status: 'completed',
      summary,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorMessage = error instanceof Error ? error.message : 'Unknown cron refresh failure';

    logServerEvent({
      event: 'cron.refresh.failed',
      route: '/api/cron/refresh',
      status: 500,
      durationMs,
      metadata: {
        errorName,
        errorMessage,
      },
    });

    return apiError('Cron refresh failed.', 'CRON_REFRESH_FAILED', 500, {
      errorName,
      errorMessage,
    });
  }
}
