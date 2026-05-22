import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { logServerEvent } from '@/src/lib/logging';
import { checkRateLimit, rateLimitPolicies } from '@/src/lib/rateLimit';
import { filterRecommendationCandidates } from '@/src/lib/recommendCandidates';
import { isValidRecommendationRequest } from '@/src/lib/recommendationRequest';
import { calculateReplacementScore, explainRecommendation, filterCandidatesByMode } from '@/src/lib/scoring';
import { createRecommendationRun } from '@/src/lib/supabase/recommendationRuns';
import { getPlayerByName, getPlayers } from '@/src/lib/supabase/players';
import type { Recommendation, RecommendationResponse } from '@/src/lib/types';

export async function POST(req: Request) {
  const startedAt = Date.now();
  const rateLimit = checkRateLimit(req, rateLimitPolicies.recommend);
  if (rateLimit.limited) {
    logServerEvent({
      event: 'recommend.rate_limited',
      route: '/api/recommend',
      status: 429,
      durationMs: Date.now() - startedAt,
      metadata: {
        limit: rateLimit.limit,
        resetAt: rateLimit.resetAt,
      },
    });
    return apiError(
      'Too many recommendation requests. Please try again shortly.',
      'RATE_LIMITED',
      429,
      {
        limit: rateLimit.limit,
        resetAt: rateLimit.resetAt,
      },
    );
  }

  try {
    const json = await req.json().catch(() => null);

    if (!isValidRecommendationRequest(json)) {
      logServerEvent({
        event: 'recommend.invalid_request',
        route: '/api/recommend',
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return apiError(
        'Invalid RecommendationRequest payload.',
        'INVALID_RECOMMENDATION_REQUEST',
        400,
      );
    }

    const target = await getPlayerByName(json.targetPlayerName);

    if (!target) {
      logServerEvent({
        event: 'recommend.target_not_found',
        route: '/api/recommend',
        status: 404,
        durationMs: Date.now() - startedAt,
        metadata: {
          mode: json.mode,
        },
      });
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

    logServerEvent({
      event: 'recommend.completed',
      route: '/api/recommend',
      status: 200,
      durationMs: Date.now() - startedAt,
      metadata: {
        mode: json.mode,
        recommendationCount: recommendations.length,
        candidateCount: filteredCandidates.length,
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    logServerEvent({
      event: 'recommend.failed',
      route: '/api/recommend',
      status: 500,
      durationMs: Date.now() - startedAt,
      metadata: {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
    });
    throw error;
  }
}
