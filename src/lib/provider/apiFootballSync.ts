import {
  API_FOOTBALL_TARGET_SEASON,
  fetchApiFootballPlayerCoverage,
  transformApiFootballPlayerRecord,
  type ApiFootballFetchOptions,
  type ApiFootballLeagueId,
  type ApiFootballQuotaGate,
  type ApiFootballQuotaSnapshot,
  type ApiFootballTargetCoverage,
} from './apiFootball';
import { API_FOOTBALL_PROVIDER, type ProviderPlayerRecord } from './types';
import { upsertProviderPlayers } from '../supabase/providerSync';

export interface ProviderSyncSummary {
  providerSource: string;
  season: string;
  leagueIds: ApiFootballLeagueId[];
  fetched: number;
  transformed: number;
  canonicalPlayers: number;
  seasonFacts: number;
  playersUpserted: number;
  statsUpserted: number;
  skipped: number;
  targetsFetched: number;
  pagesFetched: number;
  pagesExpected: number;
  requestsMade: number;
  retries: number;
  quotaResponsesWithMissingHeaders: number;
  quotaLedgerEstimatedResponses: number;
  durationMs: number;
  providerFetchDurationMs: number;
  rowsFetched: number;
  playersWithoutTargetStats: number;
  skippedNoTargetStats: number;
  skippedInvalidIdentity: number;
  matchedFacts: number;
  matchedStatisticBlocks: number;
  filteredStatisticBlocks: number;
  truncated: false;
  targetCoverage: ApiFootballTargetCoverage[];
  quotaBefore: ApiFootballQuotaSnapshot;
  quotaAfter: ApiFootballQuotaSnapshot;
  quota: ApiFootballQuotaSnapshot;
  quotaGates: {
    oneRun: ApiFootballQuotaGate;
    twoRuns: ApiFootballQuotaGate;
  };
}

export type ApiFootballSyncOptions = ApiFootballFetchOptions;

export async function syncApiFootballPlayers(
  options: ApiFootballSyncOptions = {},
): Promise<ProviderSyncSummary> {
  const startedAt = Date.now();
  const fetchResult = await fetchApiFootballPlayerCoverage(options);
  const rawPlayers = fetchResult.players;
  const records = rawPlayers
    .map((raw) => transformApiFootballPlayerRecord(raw))
    .filter((record): record is ProviderPlayerRecord => Boolean(record));

  const upsertResult = await upsertProviderPlayers(records);
  const seasonFacts = records.reduce((sum, record) => sum + record.seasonStats.length, 0);

  return {
    providerSource: API_FOOTBALL_PROVIDER,
    season: API_FOOTBALL_TARGET_SEASON,
    leagueIds: fetchResult.targetCoverage.map((target) => target.leagueId),
    fetched: rawPlayers.length,
    transformed: records.length,
    canonicalPlayers: records.length,
    seasonFacts,
    playersUpserted: upsertResult.playersUpserted,
    statsUpserted: upsertResult.statsUpserted,
    skipped: rawPlayers.length - records.length,
    targetsFetched: fetchResult.targetsFetched,
    pagesFetched: fetchResult.pagesFetched,
    pagesExpected: fetchResult.pagesExpected,
    requestsMade: fetchResult.requestsMade,
    retries: fetchResult.retries,
    quotaResponsesWithMissingHeaders: fetchResult.quotaResponsesWithMissingHeaders,
    quotaLedgerEstimatedResponses: fetchResult.quotaLedgerEstimatedResponses,
    durationMs: Math.max(fetchResult.durationMs, Date.now() - startedAt),
    providerFetchDurationMs: fetchResult.durationMs,
    rowsFetched: fetchResult.rowsFetched,
    playersWithoutTargetStats: fetchResult.playersWithoutTargetStats,
    skippedNoTargetStats: fetchResult.skippedNoTargetStats,
    skippedInvalidIdentity: fetchResult.skippedInvalidIdentity,
    matchedFacts: fetchResult.matchedFacts,
    matchedStatisticBlocks: fetchResult.matchedStatisticBlocks,
    filteredStatisticBlocks: fetchResult.filteredStatisticBlocks,
    truncated: fetchResult.truncated,
    targetCoverage: fetchResult.targetCoverage,
    quotaBefore: fetchResult.quotaBefore,
    quotaAfter: fetchResult.quotaAfter,
    quota: fetchResult.quota,
    quotaGates: fetchResult.quotaGates,
  };
}
