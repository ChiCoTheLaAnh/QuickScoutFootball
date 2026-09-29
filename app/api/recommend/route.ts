import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { logServerEvent } from '@/src/lib/logging';
import { checkRateLimit, rateLimitPolicies } from '@/src/lib/rateLimit';
import { isValidRecommendationRequest } from '@/src/lib/recommendationRequest';
import { rankRecommendations } from '@/src/lib/recommendations';
import { createRecommendationRun } from '@/src/lib/supabase/recommendationRuns';
import {
  AmbiguousPlayerNameError,
  getPlayerByIdentity,
  getPlayerByName,
  getPlayers,
} from '@/src/lib/supabase/players';
import type { RecommendationResponse } from '@/src/lib/types';

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

    let target;
    try {
      target = json.targetPlayerIdentity
        ? await getPlayerByIdentity(json.targetPlayerIdentity)
        : await getPlayerByName(json.targetPlayerName);
    } catch (error) {
      if (error instanceof AmbiguousPlayerNameError) {
        logServerEvent({
          event: 'recommend.target_ambiguous',
          route: '/api/recommend',
          status: 409,
          durationMs: Date.now() - startedAt,
          metadata: { mode: json.mode },
        });
        return apiError(
          'Multiple players match that name. Select a player from the search suggestions.',
          'TARGET_PLAYER_AMBIGUOUS',
          409,
        );
      }
      throw error;
    }

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

    const ranked = rankRecommendations(target, players, json);
    const { recommendations } = ranked;

    const response: RecommendationResponse = { target, recommendations };
    const responsePayloadBytes = Buffer.byteLength(JSON.stringify(response), 'utf8');

    const perfReviewSecret = process.env.PERF_REVIEW_SECRET?.trim();
    const isAuthenticatedPerfReview = Boolean(
      perfReviewSecret
      && req.headers.get('x-quickscout-perf-token') === perfReviewSecret,
    );
    if (!isAuthenticatedPerfReview) {
      void createRecommendationRun(json, response, startedAt).catch(() => undefined);
    }

    logServerEvent({
      event: 'recommend.completed',
      route: '/api/recommend',
      status: 200,
      durationMs: Date.now() - startedAt,
      metadata: {
        mode: json.mode,
        recommendationCount: recommendations.length,
        candidateCount: ranked.eligibleCandidateCount,
        playerCount: players.length,
        responsePayloadBytes,
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
