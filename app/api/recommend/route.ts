import { NextResponse } from 'next/server';

import { getSeedPlayerByName, seedPlayers } from '@/src/data/seedPlayers';
import { calculateReplacementScore, explainRecommendation } from '@/src/lib/scoring';
import type { RecommendationRequest } from '@/src/lib/types';

type RecommendBody = RecommendationRequest & {
  targetName?: string;
  targetId?: string;
};

function isValidRecommendationRequest(value: unknown): value is RecommendBody {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;

  const isOptionalString = (field: string) => request[field] === undefined || typeof request[field] === 'string';
  const isOptionalNumber = (field: string) => request[field] === undefined || (typeof request[field] === 'number' && Number.isFinite(request[field]));

  if (!isOptionalString('targetPosition')) return false;
  if (!isOptionalNumber('maxAge')) return false;
  if (!isOptionalNumber('maxMarketValueEur')) return false;
  if (!isOptionalNumber('minMinutes')) return false;
  if (!isOptionalString('teamStyle')) return false;
  if (!isOptionalNumber('limit')) return false;
  if (!isOptionalString('targetName')) return false;
  if (!isOptionalString('targetId')) return false;

  if (
    request.providers !== undefined
    && (!Array.isArray(request.providers) || request.providers.some((provider) => typeof provider !== 'string'))
  ) {
    return false;
  }

  return true;
}

function resolveTarget(request: RecommendBody) {
  if (request.targetId) {
    const byId = seedPlayers.find((player) => player.id === request.targetId);
    if (byId) return byId;
  }

  if (request.targetName) {
    return getSeedPlayerByName(request.targetName);
  }

  return undefined;
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);

  if (!isValidRecommendationRequest(json)) {
    return NextResponse.json(
      { error: 'Invalid RecommendationRequest payload.' },
      { status: 400 },
    );
  }

  const target = resolveTarget(json);
  if (!target) {
    return NextResponse.json(
      { error: 'Target player not found in seed data. Provide targetId or targetName.' },
      { status: 404 },
    );
  }

  const filteredCandidates = seedPlayers.filter((candidate) => {
    if (candidate.id === target.id) return false;
    if (json.providers?.length && !json.providers.includes(candidate.provider)) return false;
    if (json.maxAge !== undefined && (candidate.age ?? Number.POSITIVE_INFINITY) > json.maxAge) return false;
    if (json.maxMarketValueEur !== undefined && (candidate.marketValueEur ?? Number.POSITIVE_INFINITY) > json.maxMarketValueEur) return false;
    if (json.minMinutes !== undefined && (candidate.stats?.minutes ?? 0) < json.minMinutes) return false;
    return true;
  });

  const recommendations = filteredCandidates
    .map((candidate) => {
      const scoreBreakdown = calculateReplacementScore(target, candidate, json);
      return {
        player: candidate,
        score: scoreBreakdown.total,
        reasons: explainRecommendation(target, candidate, scoreBreakdown),
        confidence: Math.max(0, Math.min(1, scoreBreakdown.total / 100)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.floor(json.limit ?? 10)));

  return NextResponse.json({ target, recommendations });
}
