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

  it('excludes an exact provider identity even when row ids differ', () => {
    const providerTarget = player({
      id: 'target-row-a',
      provider: 'apiFootball',
      providerPlayerId: '306',
    });
    const sameProviderPlayer = player({
      id: 'target-row-b',
      provider: 'apiFootball',
      providerPlayerId: '306',
    });
    const sameNameDifferentIdentity = player({
      id: 'other-row',
      provider: 'apiFootball',
      providerPlayerId: '999',
      fullName: providerTarget.fullName,
    });

    const filtered = filterRecommendationCandidates(
      providerTarget,
      [sameProviderPlayer, sameNameDifferentIdentity],
      { maxAge: null, maxMarketValueEur: null, minMinutes: null },
    );

    expect(filtered).toEqual([sameNameDifferentIdentity]);
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

  it('keeps unknown market value without a budget and excludes it with an explicit budget', () => {
    const unknownValue = player({
      id: 'unknown-value',
      age: 24,
      marketValueEur: undefined,
      stats: { minutes: 2_000 },
    });

    expect(filterRecommendationCandidates(
      target,
      [unknownValue],
      { maxAge: null, maxMarketValueEur: null, minMinutes: null },
    )).toEqual([unknownValue]);
    expect(filterRecommendationCandidates(
      target,
      [unknownValue],
      { maxAge: null, maxMarketValueEur: 50_000_000, minMinutes: null },
    )).toEqual([]);
  });
});
