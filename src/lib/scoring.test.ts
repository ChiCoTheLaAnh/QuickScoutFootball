import { describe, expect, it } from 'vitest';

import type { Player } from './types';
import {
  cosineSimilarity,
  filterCandidatesByMode,
  normalizeValue,
} from './scoring';

const player = (overrides: Partial<Player>): Player => ({
  id: 'test-player',
  provider: 'seed',
  fullName: 'Test Player',
  ...overrides,
});

describe('normalizeValue', () => {
  it('clamps values into 0..1', () => {
    expect(normalizeValue(5, 0, 10)).toBe(0.5);
    expect(normalizeValue(-1, 0, 10)).toBe(0);
    expect(normalizeValue(15, 0, 10)).toBe(1);
  });

  it('returns 0 for invalid ranges', () => {
    expect(normalizeValue(5, 10, 10)).toBe(0);
    expect(normalizeValue(Number.NaN, 0, 10)).toBe(0);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBe(1);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('filterCandidatesByMode', () => {
  const target = player({ marketValueEur: 50_000_000, age: 30 });
  const cheaper = player({ id: 'cheap', marketValueEur: 20_000_000, age: 28 });
  const pricier = player({ id: 'pricey', marketValueEur: 80_000_000, age: 32 });
  const younger = player({ id: 'young', marketValueEur: 60_000_000, age: 22 });
  const older = player({ id: 'old', marketValueEur: 40_000_000, age: 31 });
  const candidates = [cheaper, pricier, younger, older];

  it('keeps candidates at or below target market value in cheaper mode', () => {
    const filtered = filterCandidatesByMode(target, candidates, 'cheaper');
    expect(filtered.map((candidate) => candidate.id)).toEqual(['cheap', 'old']);
    expect(filtered.every((candidate) => (candidate.marketValueEur ?? 0) <= 50_000_000)).toBe(true);
  });

  it('keeps candidates younger than the target in young_upside mode', () => {
    const filtered = filterCandidatesByMode(target, candidates, 'young_upside');
    expect(filtered.map((candidate) => candidate.id)).toEqual(['cheap', 'young']);
    expect(filtered.every((candidate) => (candidate.age ?? 0) < 30)).toBe(true);
  });

  it('returns all candidates for like_for_like mode', () => {
    expect(filterCandidatesByMode(target, candidates, 'like_for_like')).toEqual(candidates);
  });
});
