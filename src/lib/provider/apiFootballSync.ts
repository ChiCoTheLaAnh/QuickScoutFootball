import { fetchApiFootballPlayers, transformApiFootballPlayerRecord } from './apiFootball';
import { API_FOOTBALL_PROVIDER, type ProviderPlayerRecord } from './types';
import { upsertProviderPlayers } from '../supabase/providerSync';

export interface ProviderSyncSummary {
  providerSource: string;
  fetched: number;
  transformed: number;
  playersUpserted: number;
  statsUpserted: number;
  skipped: number;
}

export async function syncApiFootballPlayers(): Promise<ProviderSyncSummary> {
  const rawPlayers = await fetchApiFootballPlayers();
  const records = rawPlayers
    .map((raw) => transformApiFootballPlayerRecord(raw))
    .filter((record): record is ProviderPlayerRecord => Boolean(record));

  const upsertResult = await upsertProviderPlayers(records);

  return {
    providerSource: API_FOOTBALL_PROVIDER,
    fetched: rawPlayers.length,
    transformed: records.length,
    playersUpserted: upsertResult.playersUpserted,
    statsUpserted: upsertResult.statsUpserted,
    skipped: rawPlayers.length - records.length,
  };
}
