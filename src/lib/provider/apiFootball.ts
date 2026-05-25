import {
  createSlug,
  normalizeText,
  toOptionalNumber,
  toOptionalString,
} from '../normalize';
import type { Player, PlayerStats, ProviderPlayerRaw } from '../types';
import {
  API_FOOTBALL_PROVIDER,
  type ProviderPlayerRecord,
  type ProviderSeasonStats,
} from './types';

export async function fetchApiFootballPlayers(): Promise<ProviderPlayerRaw[]> {
  const url = process.env.API_FOOTBALL_PLAYERS_URL?.trim();
  const apiKey = process.env.API_FOOTBALL_API_KEY?.trim();

  if (!url) {
    throw new Error('API_FOOTBALL_PLAYERS_URL is required for API-Football sync');
  }

  if (!apiKey) {
    throw new Error('API_FOOTBALL_API_KEY is required for API-Football sync');
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-apisports-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football request failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  const rows = extractRows(payload);

  return rows
    .map((row) => {
      const sourceId = extractSourceId(row);
      if (!sourceId) return null;
      return {
        provider: API_FOOTBALL_PROVIDER,
        sourceId,
        payload: row,
      };
    })
    .filter((row): row is ProviderPlayerRaw => Boolean(row));
}

export function transformApiFootballPlayer(raw: ProviderPlayerRaw): Player | null {
  return transformApiFootballPlayerRecord(raw)?.player ?? null;
}

export function transformApiFootballPlayerRecord(raw: ProviderPlayerRaw): ProviderPlayerRecord | null {
  if (raw.provider !== API_FOOTBALL_PROVIDER) return null;

  const payload = toRecord(raw.payload);
  if (!payload) return null;

  const playerPayload = toRecord(payload.player) ?? payload;
  const firstStatistic = firstRecord(payload.statistics);
  const games = toRecord(firstStatistic?.games);
  const team = toRecord(firstStatistic?.team);
  const league = toRecord(firstStatistic?.league);

  const fullName = toOptionalString(playerPayload.name)
    ?? [toOptionalString(playerPayload.firstname), toOptionalString(playerPayload.lastname)]
      .filter(Boolean)
      .join(' ');

  if (!fullName) return null;

  const providerPlayerId = toOptionalString(playerPayload.id) ?? raw.sourceId;
  const stats = mapPlayerStats(firstStatistic);
  const seasonStats = mapSeasonStats(firstStatistic);

  const player: Player = {
    id: providerPlayerId,
    provider: API_FOOTBALL_PROVIDER,
    fullName,
    age: toOptionalNumber(playerPayload.age),
    nationality: toOptionalString(playerPayload.nationality),
    team: toOptionalString(team?.name),
    position: toOptionalString(games?.position),
    marketValueEur: toOptionalNumber(
      playerPayload.marketValueEur
        ?? playerPayload.market_value_eur
        ?? playerPayload.marketValue
        ?? playerPayload.market_value,
    ),
    stats,
  };

  return {
    player,
    providerSource: API_FOOTBALL_PROVIDER,
    providerPlayerId,
    normalizedName: normalizeText(fullName),
    slug: createSlug(fullName),
    teamProviderId: toOptionalString(team?.id),
    leagueName: toOptionalString(league?.name),
    leagueProviderId: toOptionalString(league?.id),
    seasonStats,
    metadata: {
      provider: API_FOOTBALL_PROVIDER,
      sourceId: raw.sourceId,
    },
  };
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = toRecord(payload);
  if (!record) return [];
  if (Array.isArray(record.response)) return record.response;
  if (Array.isArray(record.results)) return record.results;
  if (Array.isArray(record.players)) return record.players;
  return [];
}

function extractSourceId(row: unknown): string | undefined {
  const record = toRecord(row);
  const player = toRecord(record?.player);
  return toOptionalString(player?.id)
    ?? toOptionalString(record?.id)
    ?? toOptionalString(record?.player_id)
    ?? toOptionalString(record?.sourceId);
}

function mapPlayerStats(statistic?: Record<string, unknown>): PlayerStats | undefined {
  if (!statistic) return undefined;

  const games = toRecord(statistic.games);
  const goals = toRecord(statistic.goals);
  const shots = toRecord(statistic.shots);
  const passes = toRecord(statistic.passes);
  const tackles = toRecord(statistic.tackles);

  return compactStats({
    appearances: toOptionalNumber(games?.appearences ?? games?.appearances),
    minutes: toOptionalNumber(games?.minutes),
    goals: toOptionalNumber(goals?.total),
    assists: toOptionalNumber(goals?.assists),
    shots: toOptionalNumber(shots?.total),
    keyPasses: toOptionalNumber(passes?.key),
    tackles: toOptionalNumber(tackles?.total),
    interceptions: toOptionalNumber(tackles?.interceptions),
    passAccuracyPct: toOptionalNumber(passes?.accuracy),
    saves: toOptionalNumber(goals?.saves),
  });
}

function mapSeasonStats(statistic?: Record<string, unknown>): ProviderSeasonStats | undefined {
  if (!statistic) return undefined;

  const games = toRecord(statistic.games);
  const goals = toRecord(statistic.goals);
  const shots = toRecord(statistic.shots);
  const passes = toRecord(statistic.passes);
  const tackles = toRecord(statistic.tackles);
  const cards = toRecord(statistic.cards);
  const league = toRecord(statistic.league);
  const dribbles = toRecord(statistic.dribbles);
  const duels = toRecord(statistic.duels);

  return compactSeasonStats({
    season: toOptionalString(league?.season),
    competition: toOptionalString(league?.name),
    competitionProviderId: toOptionalString(league?.id),
    appearances: toOptionalNumber(games?.appearences ?? games?.appearances),
    starts: toOptionalNumber(games?.starts),
    minutes: toOptionalNumber(games?.minutes),
    goals: toOptionalNumber(goals?.total),
    assists: toOptionalNumber(goals?.assists),
    shots: toOptionalNumber(shots?.total),
    shotsOnTarget: toOptionalNumber(shots?.on),
    keyPasses: toOptionalNumber(passes?.key),
    passAccuracy: toOptionalNumber(passes?.accuracy),
    dribblesCompleted: toOptionalNumber(dribbles?.success),
    tackles: toOptionalNumber(tackles?.total),
    interceptions: toOptionalNumber(tackles?.interceptions),
    aerialDuelsWon: toOptionalNumber(duels?.won),
    yellowCards: toOptionalNumber(cards?.yellow),
    redCards: toOptionalNumber(cards?.red),
    goalsConceded: toOptionalNumber(goals?.conceded),
    saves: toOptionalNumber(goals?.saves),
  });
}

function compactStats(stats: PlayerStats): PlayerStats | undefined {
  const entries = Object.entries(stats).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) as PlayerStats : undefined;
}

function compactSeasonStats(stats: ProviderSeasonStats): ProviderSeasonStats | undefined {
  const entries = Object.entries(stats).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) as ProviderSeasonStats : undefined;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) ? toRecord(value[0]) : undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
