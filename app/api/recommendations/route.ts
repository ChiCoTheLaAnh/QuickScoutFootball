import { NextResponse } from 'next/server';

import { getLatestRecommendationResponse } from '@/src/lib/supabase/recommendationRuns';

export async function GET() {
  const response = await getLatestRecommendationResponse();

  if (!response) {
    return NextResponse.json(
      { error: 'No recommendation runs found yet.' },
      { status: 404 },
    );
  }

  return NextResponse.json(response);
}
