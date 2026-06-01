import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderPlayerRecord } from '../provider/types';
import { createServerSupabaseClient } from './server';
import { getProviderLastSyncedAt, upsertProviderPlayers } from './providerSync';

vi.mock('./server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);

describe('upsertProviderPlayers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('defaults schema-required season stat counts when provider stats are missing', async () => {
    const playersSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'player-uuid', provider_player_id: '306' }],
      error: null,
    });
    const statsSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'stats-uuid' }],
      error: null,
    });
    const playersUpsert = vi.fn(() => ({ select: playersSelect }));
    const statsUpsert = vi.fn(() => ({ select: statsSelect }));
    const from = vi.fn((table: string) => {
      if (table === 'players') return { upsert: playersUpsert };
      if (table === 'player_season_stats') return { upsert: statsUpsert };
      throw new Error(`Unexpected table: ${table}`);
    });

    mockedCreateServerSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof createServerSupabaseClient>);

    const record: ProviderPlayerRecord = {
      providerSource: 'apiFootball',
      providerPlayerId: '306',
      normalizedName: 'mohamed salah',
      slug: 'mohamed-salah',
      player: {
        id: '306',
        provider: 'apiFootball',
        fullName: 'Mohamed Salah',
      },
      seasonStats: {
        season: '2025',
        competitionProviderId: '39',
      },
    };

    await expect(upsertProviderPlayers([record])).resolves.toEqual({
      playersUpserted: 1,
      statsUpserted: 1,
    });

    const statRows = statsUpsert.mock.calls[0]?.[0] as Record<string, unknown>[];
    expect(statRows[0]).toMatchObject({
      appearances: 0,
      starts: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      shots: 0,
      shots_on_target: 0,
      key_passes: 0,
      dribbles_completed: 0,
      tackles: 0,
      interceptions: 0,
      aerial_duels_won: 0,
      yellow_cards: 0,
      red_cards: 0,
    });
  });

  it('reads the latest provider sync timestamp from player updates', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ updated_at: '2026-01-01T00:00:00.000Z' }],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    mockedCreateServerSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof createServerSupabaseClient>);

    await expect(getProviderLastSyncedAt('apiFootball')).resolves.toBe('2026-01-01T00:00:00.000Z');
    expect(from).toHaveBeenCalledWith('players');
    expect(select).toHaveBeenCalledWith('updated_at');
    expect(eq).toHaveBeenCalledWith('provider_source', 'apiFootball');
    expect(order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
  });
});
