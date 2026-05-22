import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { filterRecommendationCandidates } from '@/src/lib/recommendCandidates';
import { isValidRecommendationRequest } from '@/src/lib/recommendationRequest';
import { calculateReplacementScore, explainRecommendation, filterCandidatesByMode } from '@/src/lib/scoring';
import { createRecommendationRun } from '@/src/lib/supabase/recommendationRuns';
import { getPlayerByName, getPlayers } from '@/src/lib/supabase/players';
import type { Recommendation, RecommendationResponse } from '@/src/lib/types';

export async function POST(req: Request) {
  const startedAt = Date.now();
  const json = await req.json().catch(() => null);

  if (!isValidRecommendationRequest(json)) {
    return apiError(
      'Invalid RecommendationRequest payload.',
      'INVALID_RECOMMENDATION_REQUEST',
      400,
    );
  }

  const target = await getPlayerByName(json.targetPlayerName);

  if (!target) {
    return apiError('Target player not found.', 'TARGET_PLAYER_NOT_FOUND', 404);
  }

  const players = await getPlayers();

  const filteredCandidates = filterCandidatesByMode(
    target,
    filterRecommendationCandidates(target, players, json),
    json.mode,
  );

  const recommendations: Recommendation[] = filteredCandidates
    .map((candidate) => {
      const scoreBreakdown = calculateReplacementScore(target, candidate, json);
      return {
        player: candidate,
        score: scoreBreakdown.total,
        reasons: explainRecommendation(target, candidate, scoreBreakdown),
        confidence: Math.max(0, Math.min(1, scoreBreakdown.total / 100)),
        candidateType: json.mode,
        breakdown: scoreBreakdown,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const response: RecommendationResponse = { target, recommendations };

  void createRecommendationRun(json, response, startedAt).catch(() => undefined);

  return NextResponse.json(response);
}
