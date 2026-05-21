import type { Player, RecommendationRequest } from './types';

export function filterRecommendationCandidates(
  target: Player,
  players: Player[],
  request: Pick<RecommendationRequest, 'maxAge' | 'maxMarketValueEur' | 'minMinutes'>,
): Player[] {
  return players.filter((candidate) => {
    if (candidate.id === target.id) return false;
    if (request.maxAge !== null && (candidate.age ?? Number.POSITIVE_INFINITY) > request.maxAge) {
      return false;
    }
    if (
      request.maxMarketValueEur !== null
      && (candidate.marketValueEur ?? Number.POSITIVE_INFINITY) > request.maxMarketValueEur
    ) {
      return false;
    }
    if (request.minMinutes !== null && (candidate.stats?.minutes ?? 0) < request.minMinutes) {
      return false;
    }
    return true;
  });
}
