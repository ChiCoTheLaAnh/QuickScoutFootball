import { filterRecommendationCandidates } from './recommendCandidates';
import { calculateReplacementScore, explainRecommendation, filterCandidatesByMode } from './scoring';
import type { Player, Recommendation, RecommendationRequest } from './types';

export interface RankedRecommendations {
  recommendations: Recommendation[];
  eligibleCandidateCount: number;
  marketValueCoveragePct: number | null;
}

export function rankRecommendations(
  target: Player,
  players: Player[],
  request: RecommendationRequest,
): RankedRecommendations {
  const eligible = filterCandidatesByMode(
    target,
    filterRecommendationCandidates(target, players, request),
    request.mode,
  );
  const priced = eligible.filter((player) => player.marketValueEur !== undefined).length;
  const recommendations: Recommendation[] = eligible
    .map((candidate) => {
      const breakdown = calculateReplacementScore(target, candidate, request);
      return {
        player: candidate,
        score: breakdown.total,
        reasons: explainRecommendation(target, candidate, breakdown),
        confidence: Math.max(0, Math.min(1, breakdown.total / 100)),
        candidateType: request.mode,
        breakdown,
      };
    })
    .sort((a, b) => (
      b.score - a.score
      || a.player.provider.localeCompare(b.player.provider)
      || (a.player.providerPlayerId ?? a.player.id)
        .localeCompare(b.player.providerPlayerId ?? b.player.id)
    ))
    .slice(0, 10);

  return {
    recommendations,
    eligibleCandidateCount: eligible.length,
    marketValueCoveragePct: eligible.length ? Math.round((priced / eligible.length) * 10000) / 100 : null,
  };
}
