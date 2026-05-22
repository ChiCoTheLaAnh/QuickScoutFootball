import { NextResponse } from 'next/server';

import { apiError } from '@/src/lib/apiErrors';
import { searchPlayers } from '@/src/lib/supabase/players';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';

  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = (await searchPlayers(q)).map((player) => ({
      id: player.id,
      fullName: player.fullName,
      team: player.team,
      position: player.position,
      nationality: player.nationality,
    }));

    return NextResponse.json({ results });
  } catch {
    return apiError('Player search failed.', 'PLAYER_SEARCH_FAILED', 500);
  }
}
