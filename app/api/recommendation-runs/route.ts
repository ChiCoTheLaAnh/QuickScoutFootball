import { NextResponse } from 'next/server';

import { listRecommendationRuns } from '@/src/lib/supabase/recommendationRuns';

export async function GET() {
  const runs = await listRecommendationRuns(20);

  return NextResponse.json({
    runs: runs.map((run) => ({
      id: run.id,
      runKey: run.runKey,
      providerSource: run.providerSource,
      requestPayload: run.requestPayload,
      recommendationCount: run.recommendationCount,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
    })),
  });
}
