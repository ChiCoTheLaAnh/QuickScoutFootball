import { NextResponse } from 'next/server';

import { getRecommendationRunByKey } from '@/src/lib/supabase/recommendationRuns';

type RouteContext = {
  params: Promise<{ runKey: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { runKey } = await context.params;
  const run = await getRecommendationRunByKey(runKey);

  if (!run) {
    return NextResponse.json({ error: 'Recommendation run not found.' }, { status: 404 });
  }

  return NextResponse.json({ run });
}
