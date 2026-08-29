import type { ProviderPlayerRecord, ProviderSeasonStats } from '../provider/types';
import { createServerSupabaseClient } from './server';

export const PROVIDER_PLAYER_UPSERT_BATCH_SIZE = 250;
export const PROVIDER_STATS_UPSERT_BATCH_SIZE = 500;

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
  age: number | null;
  nationality: string | null;
  primary_position: string | null;
  team_name: string | null;
  team_provider_id: string | null;
  league_name: string | null;
  league_provider_id: string | null;
  market_value_eur: number | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
};

type PlayerUpsertResponse = {
  id: string;
  provider_player_id: string;
  provider_source: string;
};

type ProviderStatsUpsertRow = {
  player_id: string;
  provider_source: string;
  provider_stat_id: string;
  season: string;
  competition: string | null;
  competition_provider_id: string;
  team_provider_id: string | null;
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  expected_goals: number | null;
  expected_assists: number | null;
  shots: number;
  shots_on_target: number;
  key_passes: number;
  pass_accuracy: number | null;
  dribbles_completed: number;
  tackles: number;
  interceptions: number;
  aerial_duels_won: number;
  yellow_cards: number;
  red_cards: number;
  clean_sheets: number | null;
  goals_conceded: number | null;
  saves: number | null;
  metadata: Record<string, unknown>;
};

export async function upsertProviderPlayers(records: ProviderPlayerRecord[]): Promise<ProviderUpsertResult> {
  if (records.length === 0) {
    return { playersUpserted: 0, statsUpserted: 0 };
  }

  assertValidFactIdentities(records);

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is required for provider sync');
  }

  const canonicalRecords = new Map<string, ProviderPlayerRecord>();
  for (const record of records) {
    canonicalRecords.set(toCanonicalPairKey(record.providerSource, record.providerPlayerId), record);
  }

  const playerIdsByCanonicalPair = new Map<string, string>();
  let playersUpserted = 0;
  const playerRows = Array.from(canonicalRecords.values(), toPlayerRow);

  for (const playerBatch of chunk(playerRows, PROVIDER_PLAYER_UPSERT_BATCH_SIZE)) {
    const { data: upsertedPlayers, error: playersError } = await supabase
      .from('players')
      .upsert(playerBatch, { onConflict: 'provider_source,provider_player_id' })
      .select('id, provider_source, provider_player_id');

    if (playersError) {
      throw new Error(`Provider player upsert failed: ${playersError.message}`);
    }

    const players = (upsertedPlayers ?? []) as PlayerUpsertResponse[];
    playersUpserted += players.length;
    for (const player of players) {
      playerIdsByCanonicalPair.set(
        toCanonicalPairKey(player.provider_source, player.provider_player_id),
        player.id,
      );
    }
  }

  const uniqueStatRows = new Map<string, ProviderStatsUpsertRow>();
  for (const record of records) {
    const canonicalPairKey = toCanonicalPairKey(record.providerSource, record.providerPlayerId);
    const playerId = playerIdsByCanonicalPair.get(canonicalPairKey);
    if (!playerId) continue;

    for (const stats of toSeasonStatsArray(record.seasonStats)) {
      const row = toStatsRow(
        playerId,
        record.providerSource,
        record.providerPlayerId,
        stats,
        record.metadata,
      );
      uniqueStatRows.set(toFactNaturalKey(row), row);
    }
  }

  let statsUpserted = 0;
  for (const statsBatch of chunk(
    Array.from(uniqueStatRows.values()),
    PROVIDER_STATS_UPSERT_BATCH_SIZE,
  )) {
    const { data: upsertedStats, error: statsError } = await supabase
      .from('player_season_stats')
      .upsert(statsBatch, {
        onConflict: 'player_id,provider_source,season,competition_provider_id',
      })
      .select('id');

    if (statsError) {
      throw new Error(`Provider stats upsert failed: ${statsError.message}`);
    }

    statsUpserted += upsertedStats?.length ?? 0;
  }

  return { playersUpserted, statsUpserted };
}

function toPlayerRow(record: ProviderPlayerRecord): PlayerUpsertRow {
  return {
    provider_player_id: record.providerPlayerId,
    provider_source: record.providerSource,
    slug: record.slug,
    full_name: record.player.fullName,
    normalized_name: record.normalizedName,
    age: record.player.age ?? null,
    nationality: record.player.nationality ?? null,
    primary_position: record.player.position ?? null,
    team_name: record.player.team ?? null,
    team_provider_id: record.teamProviderId ?? null,
    league_name: record.leagueName ?? null,
    league_provider_id: record.leagueProviderId ?? null,
    market_value_eur: record.player.marketValueEur ?? null,
    is_active: true,
    metadata: record.metadata ?? {},
  };
}

function toStatsRow(
  playerId: string,
  providerSource: string,
  providerPlayerId: string,
  stats: ProviderSeasonStats,
  metadata?: Record<string, unknown>,
): ProviderStatsUpsertRow {
  const season = requireFactIdentityValue(stats.season, 'season');
  const competitionProviderId = requireFactIdentityValue(
    stats.competitionProviderId,
    'competitionProviderId',
  );
  return {
    player_id: playerId,
    provider_source: providerSource,
    provider_stat_id: [providerSource, providerPlayerId, season, competitionProviderId].join(':'),
    season,
    competition: stats.competition ?? null,
    competition_provider_id: competitionProviderId,
    team_provider_id: stats.teamProviderId ?? null,
    appearances: stats.appearances ?? 0,
    starts: stats.starts ?? 0,
    minutes: stats.minutes ?? 0,
    goals: stats.goals ?? 0,
    assists: stats.assists ?? 0,
    expected_goals: stats.expectedGoals ?? null,
    expected_assists: stats.expectedAssists ?? null,
    shots: stats.shots ?? 0,
    shots_on_target: stats.shotsOnTarget ?? 0,
    key_passes: stats.keyPasses ?? 0,
    pass_accuracy: stats.passAccuracy ?? null,
    dribbles_completed: stats.dribblesCompleted ?? 0,
    tackles: stats.tackles ?? 0,
    interceptions: stats.interceptions ?? 0,
    aerial_duels_won: stats.aerialDuelsWon ?? 0,
    yellow_cards: stats.yellowCards ?? 0,
    red_cards: stats.redCards ?? 0,
    clean_sheets: stats.cleanSheets ?? null,
    goals_conceded: stats.goalsConceded ?? null,
    saves: stats.saves ?? null,
    metadata: {
      ...(metadata ?? {}),
      ...(stats.teamProviderIds ? { teamProviderIds: stats.teamProviderIds } : {}),
      ...(stats.passesTotal !== undefined ? { passesTotal: stats.passesTotal } : {}),
    },
  };
}

function toSeasonStatsArray(
  seasonStats: ProviderPlayerRecord['seasonStats'],
): ProviderSeasonStats[] {
  return seasonStats;
}

function assertValidFactIdentities(records: ProviderPlayerRecord[]): void {
  for (const record of records) {
    for (const stats of record.seasonStats) {
      requireFactIdentityValue(
        stats.season,
        `season for ${record.providerSource}:${record.providerPlayerId}`,
      );
      requireFactIdentityValue(
        stats.competitionProviderId,
        `competitionProviderId for ${record.providerSource}:${record.providerPlayerId}`,
      );
    }
  }
}

function requireFactIdentityValue(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Provider season fact requires a non-blank ${label}`);
  }
  return normalized;
}

function toCanonicalPairKey(providerSource: string, providerPlayerId: string): string {
  return JSON.stringify([providerSource, providerPlayerId]);
}

function toFactNaturalKey(row: ProviderStatsUpsertRow): string {
  return JSON.stringify([
    row.player_id,
    row.provider_source,
    row.season,
    row.competition_provider_id,
  ]);
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
