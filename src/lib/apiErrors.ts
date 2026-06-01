import { NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'INVALID_RECOMMENDATION_REQUEST'
  | 'TARGET_PLAYER_NOT_FOUND'
  | 'PLAYER_SEARCH_FAILED'
  | 'RATE_LIMITED'
  | 'CRON_UNAUTHORIZED'
  | 'CRON_NOT_CONFIGURED'
  | 'CRON_REFRESH_FAILED';

export type ApiErrorResponse = {
  error: string;
  code: ApiErrorCode;
  details?: Record<string, unknown>;
};

export function apiError(
  error: string,
  code: ApiErrorCode,
  status: number,
  details?: Record<string, unknown>,
) {
  const body: ApiErrorResponse = details ? { error, code, details } : { error, code };
  return NextResponse.json(body, { status });
}
