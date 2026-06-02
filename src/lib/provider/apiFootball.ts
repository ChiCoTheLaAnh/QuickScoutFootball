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

const DEFAULT_MAX_PAGES_PER_TARGET = 10;

export interface ApiFootballFetchResult {
  players: ProviderPlayerRaw[];
  targetsFetched: number;
  pagesFetched: number;
}

export async function fetchApiFootballPlayers(): Promise<ProviderPlayerRaw[]> {
  return (await fetchApiFootballPlayerCoverage()).players;
}

export async function fetchApiFootballPlayerCoverage(): Promise<ApiFootballFetchResult> {
  const targetUrls = getApiFootballTargetUrls();
  const maxPagesPerTarget = getApiFootballMaxPagesPerTarget();
  const playersByKey = new Map<string, ProviderPlayerRaw>();
  let pagesFetched = 0;

  for (const targetUrl of targetUrls) {
    let page = 1;
    let totalPages = 1;

    while (page <= Math.min(totalPages, maxPagesPerTarget)) {
      const pageResult = await fetchApiFootballPlayersPage(targetUrl, page);
      pagesFetched += 1;

      if (pageResult.players.length === 0) {
        if (page === 1) {
          throw new Error(buildEmptyResponseMessage(pageResult.payload));
        }
        break;
      }

      for (const player of pageResult.players) {
        playersByKey.set(`${player.provider}:${player.sourceId}`, player);
      }

      totalPages = Math.max(1, pageResult.totalPages ?? 1);
      page += 1;
    }
  }

  return {
    players: [...playersByKey.values()],
    targetsFetched: targetUrls.length,
    pagesFetched,
  };
}

async function fetchApiFootballPlayersPage(
  targetUrl: string,
  page: number,
): Promise<{ players: ProviderPlayerRaw[]; totalPages?: number; payload: unknown }> {
  const url = withPageParam(targetUrl, page);
  const apiKey = process.env.API_FOOTBALL_API_KEY?.trim();

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
  assertNoProviderErrors(payload);

  const rows = extractRows(payload);
  const players = rows
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

  return {
    players,
    totalPages: extractTotalPages(payload),
    payload,
  };
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

function extractTotalPages(payload: unknown): number | undefined {
  const record = toRecord(payload);
  const paging = toRecord(record?.paging);
  return toOptionalNumber(paging?.total);
}

function getApiFootballTargetUrls(): string[] {
  const configuredUrls = [
    ...splitConfiguredUrls(process.env.API_FOOTBALL_PLAYERS_URL),
    ...splitConfiguredUrls(process.env.API_FOOTBALL_PLAYERS_URLS),
  ];
  const targetUrls = [...new Set(configuredUrls)];

  if (targetUrls.length === 0) {
    throw new Error('API_FOOTBALL_PLAYERS_URL or API_FOOTBALL_PLAYERS_URLS is required for API-Football sync');
  }

  return targetUrls;
}

function splitConfiguredUrls(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[\n,]+/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function getApiFootballMaxPagesPerTarget(): number {
  const parsed = Number(process.env.API_FOOTBALL_MAX_PAGES_PER_TARGET);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_MAX_PAGES_PER_TARGET;
}

function withPageParam(targetUrl: string, page: number): string {
  const url = new URL(targetUrl);
  url.searchParams.set('page', String(page));
  return url.toString();
}

function assertNoProviderErrors(payload: unknown): void {
  const record = toRecord(payload);
  if (!record) return;

  const errorSummary = summarizeProviderErrors(record.errors);
  if (!errorSummary) return;

  throw new Error(`API-Football returned errors: ${errorSummary}`);
}

function summarizeProviderErrors(errors: unknown): string | undefined {
  if (errors === null || errors === undefined) return undefined;

  if (Array.isArray(errors)) {
    const messages = errors
      .map(summarizeProviderValue)
      .filter((message): message is string => Boolean(message));
    return messages.length > 0 ? messages.join('; ') : undefined;
  }

  const record = toRecord(errors);
  if (record) {
    const entries = Object.entries(record)
      .map(([key, value]) => {
        const message = summarizeProviderValue(value);
        return message ? `${key}: ${message}` : key;
      });
    return entries.length > 0 ? entries.join('; ') : undefined;
  }

  return summarizeProviderValue(errors);
}

function summarizeProviderValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);

  const record = toRecord(value);
  if (record) {
    const entries = Object.entries(record)
      .map(([key, nested]) => {
        const message = summarizeProviderValue(nested);
        return message ? `${key}: ${message}` : key;
      });
    return entries.length > 0 ? entries.join(', ') : undefined;
  }

  return undefined;
}

function buildEmptyResponseMessage(payload: unknown): string {
  const record = toRecord(payload);
  const details: string[] = [];

  const results = toOptionalNumber(record?.results);
  if (results !== undefined) {
    details.push(`results=${results}`);
  }

  const paging = toRecord(record?.paging);
  const currentPage = toOptionalNumber(paging?.current);
  const totalPages = toOptionalNumber(paging?.total);
  if (currentPage !== undefined || totalPages !== undefined) {
    details.push(`paging.current=${currentPage ?? 'unknown'}`);
    details.push(`paging.total=${totalPages ?? 'unknown'}`);
  }

  const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
  return `API-Football response did not include player rows${suffix}. Check API_FOOTBALL_PLAYERS_URL query parameters such as league, season, team, search, and page.`;
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
