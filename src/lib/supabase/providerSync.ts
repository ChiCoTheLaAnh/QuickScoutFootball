import type { ProviderPlayerRecord, ProviderSeasonStats } from '../provider/types';
import { createServerSupabaseClient } from './server';

export interface ProviderUpsertResult {
  playersUpserted: number;
  statsUpserted: number;
}

type PlayerUpsertRow = {
  provider_player_id: string;
  provider_source: string;
  slug: string;
  full_name: string;
  normalized_name: string;
  age?: number;
  nationality?: string;
  primary_position?: string;
  team_name?: string;
  team_provider_id?: string;
  league_name?: string;
  league_provider_id?: string;
  market_value_eur?: number;
  is_active: boolean;
  metadata?: Record<string, unknown>;
};

type PlayerUpsertResponse = {
  id: string;
  provider_player_id: string;
};

type ProviderStatsUpsertRow = {
  player_id: string;
  provider_source: string;
  provider_stat_id: string;
  season: string;
  competition?: string;
  competition_provider_id: string;
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  expected_goals?: number;
  expected_assists?: number;
  shots: number;
  shots_on_target: number;
  key_passes: number;
  pass_accuracy?: number;
  dribbles_completed: number;
  tackles: number;
  interceptions: number;
  aerial_duels_won: number;
  yellow_cards: number;
  red_cards: number;
  clean_sheets?: number;
  goals_conceded?: number;
  saves?: number;
  metadata?: Record<string, unknown>;
};

export async function upsertProviderPlayers(records: ProviderPlayerRecord[]): Promise<ProviderUpsertResult> {
  if (records.length === 0) {
    return { playersUpserted: 0, statsUpserted: 0 };
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is required for provider sync');
  }

  const playerRows = records.map(toPlayerRow);
  const { data: upsertedPlayers, error: playersError } = await supabase
    .from('players')
    .upsert(playerRows, { onConflict: 'provider_source,provider_player_id' })
    .select('id, provider_player_id');

  if (playersError) {
    throw new Error(`Provider player upsert failed: ${playersError.message}`);
  }

  const playerIdsByProviderId = new Map(
    ((upsertedPlayers ?? []) as PlayerUpsertResponse[])
      .map((player) => [player.provider_player_id, player.id]),
  );

  const statRows = records.flatMap((record) => {
    const playerId = playerIdsByProviderId.get(record.providerPlayerId);
    if (!playerId || !record.seasonStats) return [];
    return [toStatsRow(playerId, record.providerSource, record.seasonStats, record.metadata)];
  });

  if (statRows.length === 0) {
    return {
      playersUpserted: upsertedPlayers?.length ?? 0,
      statsUpserted: 0,
    };
  }

  const { data: upsertedStats, error: statsError } = await supabase
    .from('player_season_stats')
    .upsert(statRows, { onConflict: 'player_id,provider_source,season,competition_provider_id' })
    .select('id');

  if (statsError) {
    throw new Error(`Provider stats upsert failed: ${statsError.message}`);
  }

  return {
    playersUpserted: upsertedPlayers?.length ?? 0,
    statsUpserted: upsertedStats?.length ?? 0,
  };
}

export async function getProviderLastSyncedAt(providerSource: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('players')
    .select('updated_at')
    .eq('provider_source', providerSource)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error || !data?.[0]) return null;

  const updatedAt = (data[0] as { updated_at?: string | null }).updated_at;
  return updatedAt ?? null;
}

function toPlayerRow(record: ProviderPlayerRecord): PlayerUpsertRow {
  return {
    provider_player_id: record.providerPlayerId,
    provider_source: record.providerSource,
    slug: record.slug,
    full_name: record.player.fullName,
    normalized_name: record.normalizedName,
    age: record.player.age,
    nationality: record.player.nationality,
    primary_position: record.player.position,
    team_name: record.player.team,
    team_provider_id: record.teamProviderId,
    league_name: record.leagueName,
    league_provider_id: record.leagueProviderId,
    market_value_eur: record.player.marketValueEur,
    is_active: true,
    metadata: record.metadata,
  };
}

function toStatsRow(
  playerId: string,
  providerSource: string,
  stats: ProviderSeasonStats,
  metadata?: Record<string, unknown>,
): ProviderStatsUpsertRow {
  return {
    player_id: playerId,
    provider_source: providerSource,
    provider_stat_id: [providerSource, playerId, stats.season, stats.competitionProviderId]
      .filter(Boolean)
      .join(':'),
    season: stats.season ?? 'unknown',
    competition: stats.competition,
    competition_provider_id: stats.competitionProviderId ?? 'unknown',
    appearances: stats.appearances ?? 0,
    starts: stats.starts ?? 0,
    minutes: stats.minutes ?? 0,
    goals: stats.goals ?? 0,
    assists: stats.assists ?? 0,
    expected_goals: stats.expectedGoals,
    expected_assists: stats.expectedAssists,
    shots: stats.shots ?? 0,
    shots_on_target: stats.shotsOnTarget ?? 0,
    key_passes: stats.keyPasses ?? 0,
    pass_accuracy: stats.passAccuracy,
    dribbles_completed: stats.dribblesCompleted ?? 0,
    tackles: stats.tackles ?? 0,
    interceptions: stats.interceptions ?? 0,
    aerial_duels_won: stats.aerialDuelsWon ?? 0,
    yellow_cards: stats.yellowCards ?? 0,
    red_cards: stats.redCards ?? 0,
    clean_sheets: stats.cleanSheets,
    goals_conceded: stats.goalsConceded,
    saves: stats.saves,
    metadata,
  };
}
