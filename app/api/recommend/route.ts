import { NextResponse } from 'next/server';

import { calculateReplacementScore, explainRecommendation, filterCandidatesByMode } from '@/src/lib/scoring';
import { createRecommendationRun } from '@/src/lib/supabase/recommendationRuns';
import { getPlayerByName, getPlayers } from '@/src/lib/supabase/players';
import type { Recommendation, RecommendationMode, RecommendationRequest, RecommendationResponse } from '@/src/lib/types';

const recommendationModes: RecommendationMode[] = ['like_for_like', 'cheaper', 'young_upside'];

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isValidRecommendationRequest(value: unknown): value is RecommendationRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;

  return (
    typeof request.targetPlayerName === 'string'
    && request.targetPlayerName.trim().length > 0
    && typeof request.role === 'string'
    && request.role.trim().length > 0
    && isNullableNumber(request.maxAge)
    && isNullableNumber(request.maxMarketValueEur)
    && isNullableNumber(request.minMinutes)
    && typeof request.mode === 'string'
    && recommendationModes.includes(request.mode as RecommendationMode)
  );
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const json = await req.json().catch(() => null);

  if (!isValidRecommendationRequest(json)) {
    return NextResponse.json(
      { error: 'Invalid RecommendationRequest payload.' },
      { status: 400 },
    );
  }

  const target = await getPlayerByName(json.targetPlayerName);

  if (!target) {
    return NextResponse.json(
      { error: 'Target player not found.' },
      { status: 404 },
    );
  }

  const players = await getPlayers();

  const filteredCandidates = filterCandidatesByMode(
    target,
    players.filter((candidate) => {
      if (candidate.id === target.id) return false;
      if (json.maxAge !== null && (candidate.age ?? Number.POSITIVE_INFINITY) > json.maxAge) return false;
      if (json.maxMarketValueEur !== null && (candidate.marketValueEur ?? Number.POSITIVE_INFINITY) > json.maxMarketValueEur) return false;
      if (json.minMinutes !== null && (candidate.stats?.minutes ?? 0) < json.minMinutes) return false;
      return true;
    }),
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
