import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeName, searchSeedPlayers, seedPlayers } from '@/src/data/seedPlayers';
import { normalizeText } from '@/src/lib/normalize';
import type { Player, PlayerStats, RecommendationRequest } from '@/src/lib/types';

import { isSupabaseConfigured } from './client';
import { createServerSupabaseClient } from './server';

const PLAYER_PAGE_SIZE = 500;
const STATS_CHUNK_SIZE = 100;
const STATS_PAGE_SIZE = 500;
const STATS_MAX_CONCURRENCY = 4;
const SEARCH_RESULT_LIMIT = 12;
const PLAYER_COLUMNS = 'id, provider_player_id, provider_source, full_name, normalized_name, age, nationality, primary_position, team_name, league_name, market_value_eur';
const STATS_COLUMNS = 'id, player_id, season, appearances, minutes, goals, assists, expected_goals, expected_assists, shots, key_passes, pass_accuracy, tackles, interceptions, clean_sheets, saves, created_at';

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
  id: string;
  player_id: string;
  season: string;
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
  created_at: string;
};

export class AmbiguousPlayerNameError extends Error {
  constructor(name: string) {
    super(`Multiple active players match "${name}".`);
    this.name = 'AmbiguousPlayerNameError';
  }
}

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
    providerPlayerId: row.provider_player_id ?? undefined,
    fullName: row.full_name,
    age: toOptionalNumber(row.age),
    nationality: row.nationality ?? undefined,
    team: row.team_name ?? undefined,
    position: row.primary_position ?? undefined,
    marketValueEur: toOptionalNumber(row.market_value_eur),
    stats: mapStats(statsByPlayerId.get(row.id)),
  };
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchStatsRows(
  supabase: SupabaseClient,
  playerIds: string[],
): Promise<PlayerSeasonStatsRow[]> {
  const chunks = chunkValues(playerIds, STATS_CHUNK_SIZE);
  const rows: PlayerSeasonStatsRow[] = [];

  for (let index = 0; index < chunks.length; index += STATS_MAX_CONCURRENCY) {
    const batch = chunks.slice(index, index + STATS_MAX_CONCURRENCY);
    const results = await Promise.all(batch.map((ids) => fetchStatsChunk(supabase, ids)));

    for (const result of results) rows.push(...result);
  }

  return rows;
}

async function fetchStatsChunk(
  supabase: SupabaseClient,
  playerIds: string[],
): Promise<PlayerSeasonStatsRow[]> {
  const rows: PlayerSeasonStatsRow[] = [];
  let cursor: string | undefined;

  while (true) {
    let query = supabase
      .from('player_season_stats')
      .select(STATS_COLUMNS)
      .in('player_id', playerIds)
      .order('id', { ascending: true });

    if (cursor) query = query.gt('id', cursor);

    const { data, error } = await query.limit(STATS_PAGE_SIZE);
    if (error) throw new Error(`Player stats query failed: ${error.message}`);

    const page = (data ?? []) as PlayerSeasonStatsRow[];
    rows.push(...page);
    if (page.length < STATS_PAGE_SIZE) break;

    const nextCursor = page.at(-1)?.id;
    if (!nextCursor || nextCursor === cursor) {
      throw new Error('Player stats pagination did not advance.');
    }
    cursor = nextCursor;
  }

  return rows;
}

function compareScoringStats(left: PlayerSeasonStatsRow, right: PlayerSeasonStatsRow): number {
  return (
    right.season.localeCompare(left.season)
    || (right.minutes ?? 0) - (left.minutes ?? 0)
    || right.created_at.localeCompare(left.created_at)
    || left.id.localeCompare(right.id)
  );
}

function selectScoringStats(rows: PlayerSeasonStatsRow[]): Map<string, PlayerSeasonStatsRow> {
  const statsByPlayerId = new Map<string, PlayerSeasonStatsRow>();
  for (const row of rows) {
    const current = statsByPlayerId.get(row.player_id);
    if (!current || compareScoringStats(row, current) < 0) {
      statsByPlayerId.set(row.player_id, row);
    }
  }
  return statsByPlayerId;
}

async function mapRowsWithStats(supabase: SupabaseClient, rows: PlayerRow[]): Promise<Player[]> {
  const statsRows = await fetchStatsRows(supabase, rows.map((row) => row.id));
  const statsByPlayerId = selectScoringStats(statsRows);
  return rows.map((row) => mapPlayer(row, statsByPlayerId));
}

async function getSupabasePlayers(): Promise<Player[]> {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error('Supabase client is unavailable.');

  const players: PlayerRow[] = [];
  let cursor: string | undefined;

  while (true) {
    let query = supabase
      .from('players')
      .select(PLAYER_COLUMNS)
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (cursor) query = query.gt('id', cursor);

    const { data, error } = await query.limit(PLAYER_PAGE_SIZE);
    if (error) throw new Error(`Players query failed: ${error.message}`);

    const page = (data ?? []) as PlayerRow[];
    players.push(...page);
    if (page.length < PLAYER_PAGE_SIZE) break;

    const nextCursor = page.at(-1)?.id;
    if (!nextCursor || nextCursor === cursor) {
      throw new Error('Players pagination did not advance.');
    }
    cursor = nextCursor;
  }

  return mapRowsWithStats(supabase, players);
}

export { isSupabaseConfigured };

export async function getPlayers(): Promise<Player[]> {
  if (!isSupabaseConfigured()) return seedPlayers;
  try {
    return await getSupabasePlayers();
  } catch {
    return seedPlayers;
  }
}

export async function getPlayerByIdentity(
  identity: NonNullable<RecommendationRequest['targetPlayerIdentity']>,
): Promise<Player | undefined> {
  const providerSource = identity.providerSource.trim();
  const providerPlayerId = identity.providerPlayerId.trim();

  if (!isSupabaseConfigured()) {
    return seedPlayers.find((player) => (
      player.provider === providerSource
      && (player.providerPlayerId ?? player.id) === providerPlayerId
    ));
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error('Supabase client is unavailable.');

  const { data, error } = await supabase
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('provider_source', providerSource)
    .eq('provider_player_id', providerPlayerId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`Target player query failed: ${error.message}`);
  if (!data) return undefined;
  return (await mapRowsWithStats(supabase, [data as PlayerRow]))[0];
}

export async function getPlayerByName(name: string): Promise<Player | undefined> {
  if (!isSupabaseConfigured()) {
    const normalized = normalizeName(name);
    const matches = seedPlayers.filter((player) => normalizeName(player.fullName) === normalized);
    if (matches.length > 1) throw new AmbiguousPlayerNameError(name);
    return matches[0];
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error('Supabase client is unavailable.');

  const { data, error } = await supabase
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('normalized_name', normalizeText(name))
    .eq('is_active', true)
    .order('provider_source', { ascending: true })
    .order('provider_player_id', { ascending: true })
    .limit(2);

  if (error) throw new Error(`Target player query failed: ${error.message}`);
  const matches = (data ?? []) as PlayerRow[];
  if (matches.length > 1) throw new AmbiguousPlayerNameError(name);
  if (matches.length === 0) return undefined;
  return (await mapRowsWithStats(supabase, matches))[0];
}

export async function searchPlayers(term: string): Promise<Player[]> {
  const query = normalizeText(term);
  if (!query) return [];

  if (!isSupabaseConfigured()) {
    return searchSeedPlayers(term)
      .sort((a, b) => (
        a.fullName.localeCompare(b.fullName)
        || a.provider.localeCompare(b.provider)
        || (a.providerPlayerId ?? a.id).localeCompare(b.providerPlayerId ?? b.id)
      ))
      .slice(0, SEARCH_RESULT_LIMIT);
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error('Supabase client is unavailable.');

  const pattern = `%${query}%`;
  const { data, error } = await supabase
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('is_active', true)
    .or(`normalized_name.ilike.${pattern},team_name.ilike.${pattern},primary_position.ilike.${pattern}`)
    .order('full_name', { ascending: true })
    .order('provider_source', { ascending: true })
    .order('provider_player_id', { ascending: true })
    .limit(SEARCH_RESULT_LIMIT);

  if (error) throw new Error(`Player search query failed: ${error.message}`);
  return ((data ?? []) as PlayerRow[]).map((row) => mapPlayer(row, new Map()));
}

export async function getPlayerById(id: string): Promise<Player | undefined> {
  if (!isSupabaseConfigured()) return seedPlayers.find((player) => player.id === id);

  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error('Supabase client is unavailable.');

  const { data, error } = await supabase
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`Player query failed: ${error.message}`);
  if (!data) return undefined;
  return (await mapRowsWithStats(supabase, [data as PlayerRow]))[0];
}
