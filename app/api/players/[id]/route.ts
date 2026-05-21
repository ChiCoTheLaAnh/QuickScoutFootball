import { NextResponse } from 'next/server';

import { getPlayerById } from '@/src/lib/supabase/players';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const player = await getPlayerById(id);

  if (!player) {
    return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  }

  return NextResponse.json({ player });
}
