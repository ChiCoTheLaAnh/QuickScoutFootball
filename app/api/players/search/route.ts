import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { logServerEvent } from '@/src/lib/logging';
import { checkRateLimit, rateLimitPolicies } from '@/src/lib/rateLimit';
import { searchPlayers } from '@/src/lib/supabase/players';

export async function GET(req: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';

  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  const rateLimit = checkRateLimit(req, rateLimitPolicies.playerSearch);
  if (rateLimit.limited) {
    logServerEvent({
      event: 'players.search.rate_limited',
      route: '/api/players/search',
      status: 429,
      durationMs: Date.now() - startedAt,
      metadata: {
        limit: rateLimit.limit,
        resetAt: rateLimit.resetAt,
      },
    });
    return apiError(
      'Too many player search requests. Please try again shortly.',
      'RATE_LIMITED',
      429,
      {
        limit: rateLimit.limit,
        resetAt: rateLimit.resetAt,
      },
    );
  }

  try {
    const results = (await searchPlayers(q)).map((player) => ({
      id: player.id,
      fullName: player.fullName,
      team: player.team,
      position: player.position,
      nationality: player.nationality,
    }));
    const responsePayloadBytes = Buffer.byteLength(JSON.stringify({ results }), 'utf8');

    logServerEvent({
      event: 'players.search.completed',
      route: '/api/players/search',
      status: 200,
      durationMs: Date.now() - startedAt,
      metadata: {
        queryLength: q.trim().length,
        resultCount: results.length,
        responsePayloadBytes,
      },
    });

    return NextResponse.json({ results });
  } catch (error) {
    logServerEvent({
      event: 'players.search.failed',
      route: '/api/players/search',
      status: 500,
      durationMs: Date.now() - startedAt,
      metadata: {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
    });
    return apiError('Player search failed.', 'PLAYER_SEARCH_FAILED', 500);
  }
}
