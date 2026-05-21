import { NextResponse } from 'next/server';

import { getPlayers, searchPlayers } from '@/src/lib/supabase/players';

function mapPlayerSummary(player: Awaited<ReturnType<typeof getPlayers>>[number]) {
  return {
    id: player.id,
    fullName: player.fullName,
    team: player.team,
    position: player.position,
    nationality: player.nationality,
    age: player.age,
    marketValueEur: player.marketValueEur,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';

  if (q.trim()) {
    const results = await searchPlayers(q);
    return NextResponse.json({ results: results.map(mapPlayerSummary) });
  }

  const players = await getPlayers();
  return NextResponse.json({ results: players.map(mapPlayerSummary) });
}
