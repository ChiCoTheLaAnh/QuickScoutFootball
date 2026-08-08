import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isSupabaseConfigured } from './client';
import {
  AmbiguousPlayerNameError,
  getPlayerByIdentity,
  getPlayerByName,
  getPlayers,
  searchPlayers,
} from './players';
import { createServerSupabaseClient } from './server';

vi.mock('./client', () => ({ isSupabaseConfigured: vi.fn() }));
vi.mock('./server', () => ({ createServerSupabaseClient: vi.fn() }));

const mockedIsSupabaseConfigured = vi.mocked(isSupabaseConfigured);
const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);

type QueryState = {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
};

type QueryResult = { data: unknown; error: { message: string } | null };

function installSupabase(
  resolver: (state: QueryState) => QueryResult | Promise<QueryResult>,
): QueryState[] {
  const states: QueryState[] = [];
  const from = vi.fn((table: string) => {
    const state: QueryState = { table, calls: [] };
    states.push(state);
    const builder: Record<string, unknown> = {};
    const chain = (method: string) => vi.fn((...args: unknown[]) => {
      state.calls.push({ method, args });
      return builder;
    });

    for (const method of ['select', 'eq', 'gt', 'in', 'or', 'order', 'limit']) {
      builder[method] = chain(method);
    }
    builder.maybeSingle = vi.fn(async () => resolver(state));
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(resolver(state)).then(resolve, reject);
    return builder;
  });

  mockedCreateServerSupabaseClient.mockReturnValue({ from } as never);
  return states;
}

function playerRow(index: number, fullName = `Player ${index}`) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    provider_player_id: String(index),
    provider_source: 'apiFootball',
    full_name: fullName,
    normalized_name: fullName.toLowerCase(),
    age: 24,
    nationality: 'Testland',
    primary_position: 'CM',
    team_name: 'Test FC',
    league_name: 'Test League',
    market_value_eur: 1_000_000,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedIsSupabaseConfigured.mockReturnValue(true);
});

describe('Supabase player reads at scale', () => {
  it('cursor-pages all active players and loads stats in chunks of 100 with max concurrency four', async () => {
    const playerRows = Array.from({ length: 1_205 }, (_, index) => playerRow(index + 1));
    let activeStatsQueries = 0;
    let maxStatsConcurrency = 0;

    const states = installSupabase(async (state) => {
      if (state.table === 'players') {
        const cursor = state.calls.find((call) => call.method === 'gt')?.args[1] as string | undefined;
        const start = cursor ? Number(cursor.slice(-12)) : 0;
        return { data: playerRows.slice(start, start + 500), error: null };
      }

      const ids = state.calls.find((call) => call.method === 'in')?.args[1] as string[];
      activeStatsQueries += 1;
      maxStatsConcurrency = Math.max(maxStatsConcurrency, activeStatsQueries);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeStatsQueries -= 1;

      return {
        data: ids.flatMap((playerId, index) => index === 0 ? [
          { id: `${playerId}-new-high`, player_id: playerId, season: '2025', minutes: 900, created_at: '2026-01-02' },
          { id: `${playerId}-new-low`, player_id: playerId, season: '2025', minutes: 100, created_at: '2026-01-03' },
          { id: `${playerId}-old`, player_id: playerId, season: '2024', minutes: 2000, created_at: '2025-01-01' },
        ] : [
          { id: `${playerId}-new`, player_id: playerId, season: '2025', minutes: 800, created_at: '2026-01-01' },
        ]),
        error: null,
      };
    });

    const players = await getPlayers();

    expect(players).toHaveLength(1_205);
    expect(players[0]).toMatchObject({
      provider: 'apiFootball',
      providerPlayerId: '1',
      stats: { minutes: 900 },
    });
    const playerQueries = states.filter((state) => state.table === 'players');
    const statsQueries = states.filter((state) => state.table === 'player_season_stats');
    expect(playerQueries).toHaveLength(3);
    expect(statsQueries).toHaveLength(13);
    expect(statsQueries.every((state) => {
      const ids = state.calls.find((call) => call.method === 'in')?.args[1] as string[];
      return ids.length <= 100;
    })).toBe(true);
    expect(maxStatsConcurrency).toBe(4);
  });

  it('cursor-pages more than 1,000 facts within one 100-player stats chunk', async () => {
    const playerRows = Array.from({ length: 100 }, (_, index) => playerRow(index + 1));
    const statsRows = playerRows.flatMap((player, playerIndex) => (
      Array.from({ length: 11 }, (_, factIndex) => ({
        id: `stat-${String(playerIndex).padStart(3, '0')}-${String(factIndex).padStart(2, '0')}`,
        player_id: player.id,
        season: '2024',
        minutes: factIndex * 100,
        created_at: `2025-01-${String(factIndex + 1).padStart(2, '0')}`,
      }))
    )).sort((left, right) => left.id.localeCompare(right.id));

    const states = installSupabase((state) => {
      if (state.table === 'players') return { data: playerRows, error: null };

      const cursor = state.calls.find((call) => call.method === 'gt')?.args[1] as string | undefined;
      const start = cursor
        ? statsRows.findIndex((row) => row.id.localeCompare(cursor) > 0)
        : 0;
      return {
        data: start < 0 ? [] : statsRows.slice(start, start + 500),
        error: null,
      };
    });

    const players = await getPlayers();

    expect(players).toHaveLength(100);
    expect(players.every((player) => player.stats?.minutes === 1_000)).toBe(true);
    const statsQueries = states.filter((state) => state.table === 'player_season_stats');
    expect(statsQueries).toHaveLength(3);
    expect(statsQueries.every((state) => (
      state.calls.some((call) => call.method === 'limit' && call.args[0] === 500)
    ))).toBe(true);
    expect(statsQueries.filter((state) => state.calls.some((call) => call.method === 'gt')))
      .toHaveLength(2);
  });

  it('falls back to seed players only when the recommendation corpus read fails', async () => {
    installSupabase(() => ({ data: null, error: { message: 'temporary outage' } }));

    const players = await getPlayers();

    expect(players.length).toBeGreaterThan(0);
    expect(players.every((player) => player.provider === 'seed')).toBe(true);
  });

  it('keeps exact identity and search reads fail-closed', async () => {
    installSupabase(() => ({ data: null, error: { message: 'temporary outage' } }));

    await expect(getPlayerByIdentity({
      providerSource: 'apiFootball',
      providerPlayerId: '1',
    })).rejects.toThrow(/Target player query failed/);
    await expect(searchPlayers('player')).rejects.toThrow(/Player search query failed/);
  });

  it('runs a direct deterministic search capped at 12 without name de-duplication', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => (
      playerRow(index + 1, index < 2 ? 'Alex Smith' : `Alex ${index}`)
    ));
    const states = installSupabase((state) => ({
      data: state.table === 'players' ? rows : [],
      error: null,
    }));

    const results = await searchPlayers('alex');

    expect(results).toHaveLength(12);
    expect(results.filter((player) => player.fullName === 'Alex Smith')).toHaveLength(2);
    expect(states).toHaveLength(1);
    expect(states[0].calls).toContainEqual({ method: 'limit', args: [12] });
    expect(states[0].calls.filter((call) => call.method === 'order').map((call) => call.args[0]))
      .toEqual(['full_name', 'provider_source', 'provider_player_id']);
  });

  it('rejects ambiguous legacy name-only lookup', async () => {
    installSupabase(() => ({
      data: [playerRow(1, 'Alex Smith'), playerRow(2, 'Alex Smith')],
      error: null,
    }));

    await expect(getPlayerByName('Alex Smith')).rejects.toBeInstanceOf(AmbiguousPlayerNameError);
  });
});
