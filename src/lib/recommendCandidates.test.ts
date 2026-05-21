import { describe, expect, it } from 'vitest';

import type { Player } from './types';
import { filterRecommendationCandidates } from './recommendCandidates';

const player = (overrides: Partial<Player>): Player => ({
  id: 'test-player',
  provider: 'seed',
  fullName: 'Test Player',
  ...overrides,
});

describe('filterRecommendationCandidates', () => {
  const target = player({ id: 'target', age: 30, marketValueEur: 50_000_000 });
  const eligible = player({
    id: 'eligible',
    age: 25,
    marketValueEur: 30_000_000,
    stats: { minutes: 2000 },
  });
  const tooOld = player({ id: 'old', age: 32, marketValueEur: 20_000_000, stats: { minutes: 2000 } });
  const tooExpensive = player({
    id: 'expensive',
    age: 25,
    marketValueEur: 70_000_000,
    stats: { minutes: 2000 },
  });
  const lowMinutes = player({
    id: 'low-min',
    age: 25,
    marketValueEur: 30_000_000,
    stats: { minutes: 500 },
  });

  it('excludes the target player', () => {
    const filtered = filterRecommendationCandidates(target, [target, eligible], {
      maxAge: null,
      maxMarketValueEur: null,
      minMinutes: null,
    });
    expect(filtered).toEqual([eligible]);
  });

  it('applies maxAge, maxMarketValueEur, and minMinutes filters', () => {
    const filtered = filterRecommendationCandidates(
      target,
      [eligible, tooOld, tooExpensive, lowMinutes],
      { maxAge: 30, maxMarketValueEur: 50_000_000, minMinutes: 900 },
    );
    expect(filtered.map((candidate) => candidate.id)).toEqual(['eligible']);
  });

  it('allows null filters to skip constraints', () => {
    const filtered = filterRecommendationCandidates(
      target,
      [eligible, tooOld, tooExpensive, lowMinutes],
      { maxAge: null, maxMarketValueEur: null, minMinutes: null },
    );
    expect(filtered.map((candidate) => candidate.id)).toEqual([
      'eligible',
      'old',
      'expensive',
      'low-min',
    ]);
  });
});
