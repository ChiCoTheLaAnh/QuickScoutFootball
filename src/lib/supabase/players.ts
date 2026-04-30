import { getSeedPlayerByName, normalizeName, searchSeedPlayers, seedPlayers } from '@/src/data/seedPlayers';
import type { Player, PlayerStats } from '@/src/lib/types';

import { isSupabaseConfigured } from './client';
import { createServerSupabaseClient } from './server';

type PlayerRow = {
  id: string;
  provider_player_id: string | null;
  provider_source: string | null;
  full_name: string;
  normalized_name: string;
  age: number | null;
  nationality: string | null;
  primary_position: string | null;
  team_name: string | null;
  league_name: string | null;
  market_value_eur: number | string | null;
};

type PlayerSeasonStatsRow = {
  player_id: string;
  appearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  expected_goals: number | string | null;
  expected_assists: number | string | null;
  shots: number | null;
  key_passes: number | null;
  pass_accuracy: number | string | null;
  tackles: number | null;
  interceptions: number | null;
  clean_sheets: number | null;
  saves: number | null;
};

function toOptionalNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapStats(row?: PlayerSeasonStatsRow): PlayerStats | undefined {
  if (!row) return undefined;

  return {
    minutes: toOptionalNumber(row.minutes),
    appearances: toOptionalNumber(row.appearances),
    goals: toOptionalNumber(row.goals),
    assists: toOptionalNumber(row.assists),
    shots: toOptionalNumber(row.shots),
    keyPasses: toOptionalNumber(row.key_passes),
    tackles: toOptionalNumber(row.tackles),
    interceptions: toOptionalNumber(row.interceptions),
    passAccuracyPct: toOptionalNumber(row.pass_accuracy),
    xG: toOptionalNumber(row.expected_goals),
    xA: toOptionalNumber(row.expected_assists),
    cleanSheets: toOptionalNumber(row.clean_sheets),
    saves: toOptionalNumber(row.saves),
  };
}

function mapPlayer(row: PlayerRow, statsByPlayerId: Map<string, PlayerSeasonStatsRow>): Player {
  return {
    id: row.id,
    provider: row.provider_source ?? 'supabase',
    fullName: row.full_name,
    age: toOptionalNumber(row.age),
    nationality: row.nationality ?? undefined,
    team: row.team_name ?? undefined,
    position: row.primary_position ?? undefined,
    marketValueEur: toOptionalNumber(row.market_value_eur),
    stats: mapStats(statsByPlayerId.get(row.id)),
  };
}

async function getSupabasePlayers(): Promise<Player[] | null> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return null;

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, provider_player_id, provider_source, full_name, normalized_name, age, nationality, primary_position, team_name, league_name, market_value_eur')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (playersError || !players) return null;

  const playerIds = players.map((player) => player.id);
  const statsByPlayerId = new Map<string, PlayerSeasonStatsRow>();

  if (playerIds.length > 0) {
    const { data: stats, error: statsError } = await supabase
      .from('player_season_stats')
      .select('player_id, appearances, minutes, goals, assists, expected_goals, expected_assists, shots, key_passes, pass_accuracy, tackles, interceptions, clean_sheets, saves')
      .in('player_id', playerIds)
      .order('season', { ascending: false })
      .order('created_at', { ascending: false });

    if (statsError) return null;

    for (const row of stats ?? []) {
      if (!statsByPlayerId.has(row.player_id)) {
        statsByPlayerId.set(row.player_id, row);
      }
    }
  }

  return (players as PlayerRow[]).map((player) => mapPlayer(player, statsByPlayerId));
}

export { isSupabaseConfigured };

export async function getPlayers(): Promise<Player[]> {
  if (!isSupabaseConfigured()) return seedPlayers;

  return (await getSupabasePlayers()) ?? seedPlayers;
}

export async function getPlayerByName(name: string): Promise<Player | undefined> {
  if (!isSupabaseConfigured()) return getSeedPlayerByName(name);

  const normalized = normalizeName(name);
  const players = await getPlayers();
  return players.find((player) => normalizeName(player.fullName) === normalized);
}

export async function searchPlayers(term: string): Promise<Player[]> {
  const query = normalizeName(term);
  if (!query) return [];

  if (!isSupabaseConfigured()) return searchSeedPlayers(term);

  const players = await getPlayers();
  return players.filter((player) => {
    const fullName = normalizeName(player.fullName);
    const team = normalizeName(player.team ?? '');
    const position = normalizeName(player.position ?? '');
    return fullName.includes(query) || team.includes(query) || position.includes(query);
  });
}
