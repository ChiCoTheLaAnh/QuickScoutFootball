import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { logServerEvent } from '@/src/lib/logging';

export async function GET(req: Request) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SHARED_SECRET;

  if (!cronSecret) {
    logServerEvent({
      event: 'cron.refresh.not_configured',
      route: '/api/cron/refresh',
      status: 503,
      durationMs: Date.now() - startedAt,
    });
    return apiError('Cron shared secret is not configured.', 'CRON_NOT_CONFIGURED', 503);
  }

  if (req.headers.get('x-cron-secret') !== cronSecret) {
    logServerEvent({
      event: 'cron.refresh.unauthorized',
      route: '/api/cron/refresh',
      status: 401,
      durationMs: Date.now() - startedAt,
    });
    return apiError('Unauthorized cron request.', 'CRON_UNAUTHORIZED', 401);
  }

  logServerEvent({
    event: 'cron.refresh.not_implemented',
    route: '/api/cron/refresh',
    status: 200,
    durationMs: Date.now() - startedAt,
  });

  return NextResponse.json({
    status: 'not_implemented',
    message: 'Daily provider refresh will be implemented in a later task.',
  });
}
