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
  const limit = request.limit ?? players.length;

  return players
    .map((player) => ({
      player,
      score: scorePlayer(player, request),
      reasons: ['not_implemented'],
      confidence: 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
