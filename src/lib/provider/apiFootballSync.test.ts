import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderPlayerRaw } from '../types';
import type { ProviderPlayerRecord } from './types';
import { syncApiFootballPlayers } from './apiFootballSync';
import { fetchApiFootballPlayerCoverage, transformApiFootballPlayerRecord } from './apiFootball';
import { upsertProviderPlayers } from '../supabase/providerSync';

vi.mock('./apiFootball', async (importOriginal) => {
  const original = await importOriginal<typeof import('./apiFootball')>();
  return {
    ...original,
    fetchApiFootballPlayerCoverage: vi.fn(),
    transformApiFootballPlayerRecord: vi.fn(),
  };
});

vi.mock('../supabase/providerSync', () => ({
  upsertProviderPlayers: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchApiFootballPlayerCoverage);
const mockedTransform = vi.mocked(transformApiFootballPlayerRecord);
const mockedUpsert = vi.mocked(upsertProviderPlayers);

const rawPlayers: ProviderPlayerRaw[] = [
  { provider: 'apiFootball', sourceId: '1', payload: { player: { id: 1, name: 'One' } } },
  { provider: 'apiFootball', sourceId: '2', payload: { player: { id: 2 } } },
];

const syncRecord: ProviderPlayerRecord = {
  providerSource: 'apiFootball',
  providerPlayerId: '1',
  normalizedName: 'one',
  slug: 'api-football-1',
  player: {
    id: '1',
    provider: 'apiFootball',
    fullName: 'One',
  },
  seasonStats: [
    { season: '2024', competitionProviderId: '39' },
    { season: '2024', competitionProviderId: '140' },
  ],
};

const targetCoverage = [
  {
    leagueId: '39' as const,
    season: '2024' as const,
    pagesFetched: 2,
    totalPages: 2,
    rowsFetched: 40,
    playersWithoutTargetStats: 2,
    skippedNoTargetStats: 2,
    skippedInvalidIdentity: 1,
    matchedFacts: 38,
    matchedStatisticBlocks: 40,
    filteredStatisticBlocks: 3,
    truncated: false as const,
  },
];

describe('syncApiFootballPlayers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns a detailed safe summary and forwards target options', async () => {
    mockedFetch.mockResolvedValue({
      players: rawPlayers,
      targetsFetched: 1,
      pagesFetched: 2,
      pagesExpected: 2,
      requestsMade: 3,
      retries: 1,
      durationMs: 1234,
      rowsFetched: 40,
      playersWithoutTargetStats: 2,
      skippedNoTargetStats: 2,
      skippedInvalidIdentity: 1,
      matchedFacts: 38,
      matchedStatisticBlocks: 40,
      filteredStatisticBlocks: 3,
      truncated: false,
      targetCoverage,
      quotaBefore: {
        dailyLimit: 7500,
        dailyRemaining: 7500,
        minuteLimit: 300,
        minuteRemaining: 300,
      },
      quotaAfter: {
        dailyLimit: 7500,
        dailyRemaining: 7497,
        minuteLimit: 300,
        minuteRemaining: 297,
      },
      quota: { dailyLimit: 7500, dailyRemaining: 7497 },
      quotaGates: {
        oneRun: {
          runs: 1,
          bufferMultiplier: 1.2,
          requestsPerRun: 2,
          requiredRequests: 3,
          remainingRequests: 7497,
          allowed: true,
          shortfall: 0,
        },
        twoRuns: {
          runs: 2,
          bufferMultiplier: 1.2,
          requestsPerRun: 2,
          requiredRequests: 5,
          remainingRequests: 7497,
          allowed: true,
          shortfall: 0,
        },
      },
    });
    mockedTransform
      .mockReturnValueOnce(syncRecord)
      .mockReturnValueOnce(null);
    mockedUpsert.mockResolvedValue({ playersUpserted: 1, statsUpserted: 2 });

    const options = { targetMode: 'configured' as const, leagueIds: ['39' as const] };
    await expect(syncApiFootballPlayers(options)).resolves.toMatchObject({
      providerSource: 'apiFootball',
      season: '2024',
      leagueIds: ['39'],
      fetched: 2,
      transformed: 1,
      canonicalPlayers: 1,
      seasonFacts: 2,
      playersUpserted: 1,
      statsUpserted: 2,
      skipped: 1,
      targetsFetched: 1,
      pagesFetched: 2,
      pagesExpected: 2,
      requestsMade: 3,
      retries: 1,
      durationMs: 1234,
      providerFetchDurationMs: 1234,
      rowsFetched: 40,
      playersWithoutTargetStats: 2,
      skippedNoTargetStats: 2,
      skippedInvalidIdentity: 1,
      matchedFacts: 38,
      matchedStatisticBlocks: 40,
      filteredStatisticBlocks: 3,
      truncated: false,
      targetCoverage,
      quotaBefore: { dailyLimit: 7500, dailyRemaining: 7500 },
      quotaAfter: { dailyLimit: 7500, dailyRemaining: 7497 },
      quota: { dailyLimit: 7500, dailyRemaining: 7497 },
    });
    expect(mockedFetch).toHaveBeenCalledWith(options);
    expect(mockedUpsert).toHaveBeenCalledWith([syncRecord]);
  });

  it('propagates provider fetch failures without calling Supabase upsert', async () => {
    mockedFetch.mockRejectedValue(new Error('provider unavailable'));

    await expect(syncApiFootballPlayers()).rejects.toThrow('provider unavailable');
    expect(mockedUpsert).not.toHaveBeenCalled();
  });
});
