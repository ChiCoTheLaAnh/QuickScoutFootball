import { NextResponse } from 'next/server';

import { searchSeedPlayers } from '@/src/data/seedPlayers';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';

  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  const results = searchSeedPlayers(q).map((player) => ({
    id: player.id,
    fullName: player.fullName,
    team: player.team,
    position: player.position,
    nationality: player.nationality,
  }));

  return NextResponse.json({ results });
}
