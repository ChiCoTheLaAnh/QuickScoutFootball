import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderPlayerRecord, ProviderSeasonStats, ProviderSource } from '../provider/types';
import { createServerSupabaseClient } from './server';
import {
  PROVIDER_PLAYER_UPSERT_BATCH_SIZE,
  PROVIDER_STATS_UPSERT_BATCH_SIZE,
  upsertProviderPlayers,
} from './providerSync';

vi.mock('./server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('upsertProviderPlayers', () => {
  it('writes every season fact, preserves its team, and nulls unknown nullable metrics', async () => {
    const harness = createUpsertHarness();
    mockedCreateServerSupabaseClient.mockReturnValue(harness.client);

    const record = makeRecord(306, [
      makeStats(39, {
        teamProviderId: 'team-40',
        teamProviderIds: ['team-40', 'team-41'],
        passesTotal: 900,
        passAccuracy: 82.4,
      }),
      makeStats(140, { teamProviderId: 'team-529' }),
    ]);

    await expect(upsertProviderPlayers([record])).resolves.toEqual({
      playersUpserted: 1,
      statsUpserted: 2,
    });

    expect(harness.playerBatches).toHaveLength(1);
    expect(harness.statsBatches).toHaveLength(1);
    expect(harness.playerOptions[0]).toEqual({
      onConflict: 'provider_source,provider_player_id',
    });
    expect(harness.statsOptions[0]).toEqual({
      onConflict: 'player_id,provider_source,season,competition_provider_id',
    });

    expect(harness.statsBatches[0]).toEqual([
      expect.objectContaining({
        provider_source: 'apiFootball',
        provider_stat_id: 'apiFootball:306:2024:39',
        competition_provider_id: '39',
        team_provider_id: 'team-40',
        pass_accuracy: 82.4,
        expected_goals: null,
        expected_assists: null,
        metadata: {
          teamProviderIds: ['team-40', 'team-41'],
          passesTotal: 900,
        },
      }),
      expect.objectContaining({
        provider_stat_id: 'apiFootball:306:2024:140',
        competition_provider_id: '140',
        team_provider_id: 'team-529',
        pass_accuracy: null,
      }),
    ]);
  });

  it('uses at most 250 players and 500 facts per request without per-player lookups', async () => {
    const harness = createUpsertHarness();
    mockedCreateServerSupabaseClient.mockReturnValue(harness.client);
    const records = Array.from({ length: 251 }, (_, index) => makeRecord(index + 1, [
      makeStats(39),
      makeStats(140),
    ]));

    await expect(upsertProviderPlayers(records)).resolves.toEqual({
      playersUpserted: 251,
      statsUpserted: 502,
    });

    expect(harness.playerBatches.map((batch) => batch.length)).toEqual([
      PROVIDER_PLAYER_UPSERT_BATCH_SIZE,
      1,
    ]);
    expect(harness.statsBatches.map((batch) => batch.length)).toEqual([
      PROVIDER_STATS_UPSERT_BATCH_SIZE,
      2,
    ]);
    expect(harness.from).toHaveBeenCalledTimes(4);
  });

  it('maps database ids by canonical provider pair rather than provider id alone', async () => {
    const harness = createUpsertHarness();
    mockedCreateServerSupabaseClient.mockReturnValue(harness.client);
    const records = [
      makeRecord(99, [makeStats(39)], 'apiFootball'),
      makeRecord(99, [makeStats(39)], 'footio'),
    ];

    await upsertProviderPlayers(records);

    const statsRows = harness.statsBatches.flat();
    expect(statsRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        player_id: 'apiFootball-player-99',
        provider_source: 'apiFootball',
      }),
      expect.objectContaining({
        player_id: 'footio-player-99',
        provider_source: 'footio',
      }),
    ]));
  });

  it.each([
    ['missing season', { season: undefined }],
    ['blank season', { season: '   ' }],
    ['missing competition ID', { competitionProviderId: undefined }],
    ['blank competition ID', { competitionProviderId: '   ' }],
  ])('rejects %s before opening Supabase', async (_label, invalidIdentity) => {
    const record = makeRecord(306, [
      { ...makeStats(39), ...invalidIdentity },
    ]);

    await expect(upsertProviderPlayers([record])).rejects.toThrow(
      /requires a non-blank (season|competitionProviderId)/,
    );
    expect(mockedCreateServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('keeps canonical and fact counts stable when the same batch is upserted twice', async () => {
    const harness = createStatefulUpsertHarness();
    mockedCreateServerSupabaseClient.mockReturnValue(harness.client);
    const records = [
      makeRecord(306, [makeStats(39), makeStats(140)]),
      makeRecord(999, [makeStats(39)]),
    ];

    await upsertProviderPlayers(records);
    const firstSnapshot = harness.snapshot();
    await upsertProviderPlayers(records);

    expect(harness.playerCount()).toBe(2);
    expect(harness.factCount()).toBe(3);
    expect(harness.snapshot()).toEqual(firstSnapshot);
  });

  it('does not open Supabase for an empty input', async () => {
    await expect(upsertProviderPlayers([])).resolves.toEqual({
      playersUpserted: 0,
      statsUpserted: 0,
    });
    expect(mockedCreateServerSupabaseClient).not.toHaveBeenCalled();
  });
});

function makeRecord(
  id: number,
  seasonStats: ProviderSeasonStats[],
  providerSource: ProviderSource = 'apiFootball',
): ProviderPlayerRecord {
  return {
    providerSource,
    providerPlayerId: String(id),
    normalizedName: `player ${id}`,
    slug: `${providerSource.toLowerCase()}-${id}-player-${id}`,
    player: {
      id: String(id),
      provider: providerSource,
      fullName: `Player ${id}`,
    },
    seasonStats,
  };
}

function makeStats(
  leagueId: number,
  overrides: Partial<ProviderSeasonStats & { teamProviderId: string }> = {},
): ProviderSeasonStats {
  return {
    season: '2024',
    competition: `League ${leagueId}`,
    competitionProviderId: String(leagueId),
    appearances: 20,
    starts: 18,
    minutes: 1_620,
    goals: 5,
    assists: 4,
    shots: 30,
    shotsOnTarget: 12,
    keyPasses: 25,
    dribblesCompleted: 15,
    tackles: 10,
    interceptions: 8,
    aerialDuelsWon: 6,
    yellowCards: 2,
    redCards: 0,
    ...overrides,
  };
}

function createUpsertHarness() {
  const playerBatches: Record<string, unknown>[][] = [];
  const statsBatches: Record<string, unknown>[][] = [];
  const playerOptions: unknown[] = [];
  const statsOptions: unknown[] = [];

  const playersUpsert = vi.fn((rows: Record<string, unknown>[], options: unknown) => {
    playerBatches.push(rows);
    playerOptions.push(options);
    return {
      select: vi.fn().mockResolvedValue({
        data: rows.map((row) => ({
          id: `${row.provider_source}-player-${row.provider_player_id}`,
          provider_source: row.provider_source,
          provider_player_id: row.provider_player_id,
        })),
        error: null,
      }),
    };
  });
  const statsUpsert = vi.fn((rows: Record<string, unknown>[], options: unknown) => {
    statsBatches.push(rows);
    statsOptions.push(options);
    return {
      select: vi.fn().mockResolvedValue({
        data: rows.map((_, index) => ({ id: `stats-${statsBatches.length}-${index}` })),
        error: null,
      }),
    };
  });
  const from = vi.fn((table: string) => {
    if (table === 'players') return { upsert: playersUpsert };
    if (table === 'player_season_stats') return { upsert: statsUpsert };
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from } as unknown as ReturnType<typeof createServerSupabaseClient>,
    from,
    playerBatches,
    statsBatches,
    playerOptions,
    statsOptions,
  };
}

function createStatefulUpsertHarness() {
  const players = new Map<string, Record<string, unknown>>();
  const facts = new Map<string, Record<string, unknown>>();

  const playersUpsert = vi.fn((rows: Record<string, unknown>[]) => ({
    select: vi.fn().mockImplementation(async () => {
      const data = rows.map((row) => {
        const key = JSON.stringify([row.provider_source, row.provider_player_id]);
        const existing = players.get(key);
        const id = existing?.id ?? `player-${players.size + 1}`;
        players.set(key, { ...row, id });
        return {
          id,
          provider_source: row.provider_source,
          provider_player_id: row.provider_player_id,
        };
      });
      return { data, error: null };
    }),
  }));
  const statsUpsert = vi.fn((rows: Record<string, unknown>[]) => ({
    select: vi.fn().mockImplementation(async () => {
      const data = rows.map((row) => {
        const key = JSON.stringify([
          row.player_id,
          row.provider_source,
          row.season,
          row.competition_provider_id,
        ]);
        const existing = facts.get(key);
        const id = existing?.id ?? `fact-${facts.size + 1}`;
        facts.set(key, { ...row, id });
        return { id };
      });
      return { data, error: null };
    }),
  }));
  const from = vi.fn((table: string) => {
    if (table === 'players') return { upsert: playersUpsert };
    if (table === 'player_season_stats') return { upsert: statsUpsert };
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from } as unknown as ReturnType<typeof createServerSupabaseClient>,
    playerCount: () => players.size,
    factCount: () => facts.size,
    snapshot: () => ({
      players: [...players.entries()],
      facts: [...facts.entries()],
    }),
  };
}
