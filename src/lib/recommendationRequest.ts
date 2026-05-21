import type { RecommendationMode, RecommendationRequest } from './types';

export const recommendationModes: RecommendationMode[] = ['like_for_like', 'cheaper', 'young_upside'];

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

export function isValidRecommendationRequest(value: unknown): value is RecommendationRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;

  return (
    typeof request.targetPlayerName === 'string'
    && request.targetPlayerName.trim().length > 0
    && typeof request.role === 'string'
    && request.role.trim().length > 0
    && isNullableNumber(request.maxAge)
    && isNullableNumber(request.maxMarketValueEur)
    && isNullableNumber(request.minMinutes)
    && typeof request.mode === 'string'
    && recommendationModes.includes(request.mode as RecommendationMode)
  );
}
