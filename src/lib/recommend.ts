import type { Player, Recommendation, RecommendationRequest } from './types';
import { scorePlayer } from './scoring';

/**
 * Placeholder recommendation pipeline.
 * TODO: Add filtering, ranking explanation generation, and confidence heuristics.
 */
export function recommendPlayers(
  players: Player[],
  request: RecommendationRequest,
): Recommendation[] {
  return players
    .map((player) => ({
      player,
      score: scorePlayer(player, request),
      reasons: ['not_implemented'],
      confidence: 0,
      candidateType: request.mode,
      breakdown: {
        similarity: 0,
        roleFit: 0,
        output: 0,
        affordability: 0,
        ageUpside: 0,
        total: 0,
      },
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, players.length);
}
