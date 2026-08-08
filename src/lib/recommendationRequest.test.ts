import { describe, expect, it } from 'vitest';

import { isValidRecommendationRequest } from './recommendationRequest';

const validRequest = {
  targetPlayerName: 'Mohamed Salah',
  role: 'RW',
  maxAge: 30,
  maxMarketValueEur: 60_000_000,
  minMinutes: 900,
  mode: 'like_for_like',
} as const;

describe('isValidRecommendationRequest', () => {
  it('accepts a valid recommendation request', () => {
    expect(isValidRecommendationRequest(validRequest)).toBe(true);
  });

  it('accepts null numeric filters', () => {
    expect(
      isValidRecommendationRequest({
        ...validRequest,
        maxAge: null,
        maxMarketValueEur: null,
        minMinutes: null,
      }),
    ).toBe(true);
  });

  it('accepts an exact target player identity', () => {
    expect(isValidRecommendationRequest({
      ...validRequest,
      targetPlayerIdentity: {
        providerSource: 'apiFootball',
        providerPlayerId: '306',
      },
    })).toBe(true);
  });

  it('rejects a partial or blank target player identity', () => {
    expect(isValidRecommendationRequest({
      ...validRequest,
      targetPlayerIdentity: { providerSource: 'apiFootball' },
    })).toBe(false);
    expect(isValidRecommendationRequest({
      ...validRequest,
      targetPlayerIdentity: { providerSource: ' ', providerPlayerId: '306' },
    })).toBe(false);
  });

  it('rejects missing or blank target player name', () => {
    expect(isValidRecommendationRequest({ ...validRequest, targetPlayerName: '' })).toBe(false);
    expect(isValidRecommendationRequest({ ...validRequest, targetPlayerName: '   ' })).toBe(false);
  });

  it('rejects invalid mode and non-finite numeric filters', () => {
    expect(isValidRecommendationRequest({ ...validRequest, mode: 'invalid' })).toBe(false);
    expect(isValidRecommendationRequest({ ...validRequest, maxAge: Number.NaN })).toBe(false);
    expect(isValidRecommendationRequest({ ...validRequest, maxMarketValueEur: '60M' })).toBe(false);
  });

  it('rejects non-object payloads', () => {
    expect(isValidRecommendationRequest(null)).toBe(false);
    expect(isValidRecommendationRequest('Mohamed Salah')).toBe(false);
  });
});
