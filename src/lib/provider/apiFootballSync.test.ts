import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderPlayerRaw } from '../types';
import type { ProviderPlayerRecord } from './types';
import { syncApiFootballPlayers } from './apiFootballSync';
import { fetchApiFootballPlayerCoverage, transformApiFootballPlayerRecord } from './apiFootball';
import { upsertProviderPlayers } from '../supabase/providerSync';

vi.mock('./apiFootball', () => ({
  fetchApiFootballPlayerCoverage: vi.fn(),
  transformApiFootballPlayerRecord: vi.fn(),
}));

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
  slug: 'one',
  player: {
    id: '1',
    provider: 'apiFootball',
    fullName: 'One',
  },
};

describe('syncApiFootballPlayers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns a safe sync summary with transformed and skipped counts', async () => {
    mockedFetch.mockResolvedValue({
      players: rawPlayers,
      targetsFetched: 2,
      pagesFetched: 3,
    });
    mockedTransform
      .mockReturnValueOnce(syncRecord)
      .mockReturnValueOnce(null);
    mockedUpsert.mockResolvedValue({
      playersUpserted: 1,
      statsUpserted: 1,
    });

    await expect(syncApiFootballPlayers()).resolves.toEqual({
      providerSource: 'apiFootball',
      fetched: 2,
      transformed: 1,
      playersUpserted: 1,
      statsUpserted: 1,
      skipped: 1,
      targetsFetched: 2,
      pagesFetched: 3,
    });
    expect(mockedUpsert).toHaveBeenCalledWith([syncRecord]);
  });

  it('propagates provider fetch failures without calling Supabase upsert', async () => {
    mockedFetch.mockRejectedValue(new Error('provider unavailable'));

    await expect(syncApiFootballPlayers()).rejects.toThrow('provider unavailable');
    expect(mockedUpsert).not.toHaveBeenCalled();
  });
});
