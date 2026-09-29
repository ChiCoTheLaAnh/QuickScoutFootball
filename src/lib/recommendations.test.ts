import { describe, expect, it } from 'vitest';

import { rankRecommendations } from './recommendations';
import type { Player, RecommendationRequest } from './types';

const target: Player = {
  id: 'target', provider: 'seed', providerPlayerId: '1', fullName: 'Target',
  age: 30, position: 'RW', marketValueEur: 100, stats: { minutes: 2000, goals: 10 },
};
const candidates: Player[] = [
  { id: 'priced', provider: 'seed', providerPlayerId: '2', fullName: 'Priced', age: 24, position: 'RW', marketValueEur: 80, stats: { minutes: 1800, goals: 8 } },
  { id: 'unpriced', provider: 'seed', providerPlayerId: '3', fullName: 'Unpriced', age: 23, position: 'RW', stats: { minutes: 1600, goals: 6 } },
  { id: 'low-minutes', provider: 'seed', providerPlayerId: '4', fullName: 'Low minutes', age: 22, position: 'RW', stats: { minutes: 100 } },
];
const request: RecommendationRequest = {
  targetPlayerName: 'Target', targetPlayerIdentity: { providerSource: 'seed', providerPlayerId: '1' },
  role: 'RW', maxAge: null, maxMarketValueEur: null, minMinutes: 900, mode: 'like_for_like',
};

describe('rankRecommendations', () => {
  it('reports all eligible candidates and price coverage before the top-ten cap', () => {
    const result = rankRecommendations(target, [target, ...candidates], request);
    expect(result.eligibleCandidateCount).toBe(2);
    expect(result.marketValueCoveragePct).toBe(50);
    expect(result.recommendations.map((item) => item.player.id).sort()).toEqual(['priced', 'unpriced']);
  });

  it('returns null price coverage when no candidates pass filters', () => {
    const result = rankRecommendations(target, [target], request);
    expect(result.eligibleCandidateCount).toBe(0);
    expect(result.marketValueCoveragePct).toBeNull();
    expect(result.recommendations).toEqual([]);
  });
});
