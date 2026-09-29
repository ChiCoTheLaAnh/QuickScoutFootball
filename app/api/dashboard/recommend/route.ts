import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { checkRateLimit, rateLimitPolicies } from '@/src/lib/rateLimit';
import { isValidRecommendationRequest } from '@/src/lib/recommendationRequest';
import { rankRecommendations } from '@/src/lib/recommendations';
import { getPlayerByIdentity, getPlayers } from '@/src/lib/supabase/players';

export async function POST(req: Request) {
  const rateLimit = checkRateLimit(req, rateLimitPolicies.recommend);
  if (rateLimit.limited) {
    return apiError('Too many recommendation requests. Please try again shortly.', 'RATE_LIMITED', 429);
  }

  const body = await req.json().catch(() => null);
  if (!isValidRecommendationRequest(body) || !body.targetPlayerIdentity) {
    return apiError('Select an exact target player.', 'INVALID_RECOMMENDATION_REQUEST', 400);
  }

  try {
    const target = await getPlayerByIdentity(body.targetPlayerIdentity);
    if (!target) return apiError('Target player not found.', 'TARGET_PLAYER_NOT_FOUND', 404);

    const ranked = rankRecommendations(target, await getPlayers(), body);
    return NextResponse.json({ target, ...ranked });
  } catch {
    return apiError('Dashboard recommendations are unavailable.', 'DASHBOARD_RECOMMEND_FAILED', 503);
  }
}
