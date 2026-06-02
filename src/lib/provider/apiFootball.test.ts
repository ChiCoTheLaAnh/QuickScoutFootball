import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderPlayerRaw } from '../types';
import {
  fetchApiFootballPlayerCoverage,
  fetchApiFootballPlayers,
  transformApiFootballPlayer,
  transformApiFootballPlayerRecord,
} from './apiFootball';

const sampleRaw: ProviderPlayerRaw = {
  provider: 'apiFootball',
  sourceId: '306',
  payload: {
    player: {
      id: 306,
      name: 'Mohamed Salah',
      age: 33,
      nationality: 'Egypt',
    },
    statistics: [
      {
        team: { id: 40, name: 'Liverpool' },
        league: { id: 39, name: 'Premier League', season: 2025 },
        games: {
          appearences: 38,
          starts: 36,
          minutes: 3200,
          position: 'Attacker',
        },
        shots: { total: 124, on: 58 },
        goals: { total: 29, assists: 18 },
        passes: { key: 72, accuracy: 78 },
        tackles: { total: 19, interceptions: 8 },
        dribbles: { success: 44 },
      },
    ],
  },
};

describe('API-Football provider transform', () => {
  it('maps provider payloads into the shared Player shape', () => {
    expect(transformApiFootballPlayer(sampleRaw)).toEqual({
      id: '306',
      provider: 'apiFootball',
      fullName: 'Mohamed Salah',
      age: 33,
      nationality: 'Egypt',
      team: 'Liverpool',
      position: 'Attacker',
      marketValueEur: undefined,
      stats: {
        appearances: 38,
        minutes: 3200,
        goals: 29,
        assists: 18,
        shots: 124,
        keyPasses: 72,
        tackles: 19,
        interceptions: 8,
        passAccuracyPct: 78,
      },
    });
  });

  it('maps provider payloads into Supabase-ready sync records', () => {
    expect(transformApiFootballPlayerRecord(sampleRaw)).toMatchObject({
      providerSource: 'apiFootball',
      providerPlayerId: '306',
      normalizedName: 'mohamed salah',
      slug: 'mohamed-salah',
      teamProviderId: '40',
      leagueName: 'Premier League',
      leagueProviderId: '39',
      seasonStats: {
        season: '2025',
        competition: 'Premier League',
        competitionProviderId: '39',
        appearances: 38,
        starts: 36,
        minutes: 3200,
        goals: 29,
        assists: 18,
        shots: 124,
        shotsOnTarget: 58,
        keyPasses: 72,
        passAccuracy: 78,
        dribblesCompleted: 44,
        tackles: 19,
        interceptions: 8,
      },
    });
  });

  it('returns null when a payload has no usable name', () => {
    expect(transformApiFootballPlayer({
      provider: 'apiFootball',
      sourceId: 'missing-name',
      payload: { player: { id: 'missing-name' } },
    })).toBeNull();
  });
});

describe('fetchApiFootballPlayers', () => {
  const savedEnv = {
    apiKey: process.env.API_FOOTBALL_API_KEY,
    playersUrl: process.env.API_FOOTBALL_PLAYERS_URL,
    playersUrls: process.env.API_FOOTBALL_PLAYERS_URLS,
    maxPagesPerTarget: process.env.API_FOOTBALL_MAX_PAGES_PER_TARGET,
  };

  beforeEach(() => {
    process.env.API_FOOTBALL_API_KEY = 'test-api-key';
    process.env.API_FOOTBALL_PLAYERS_URL = 'https://v3.football.api-sports.io/players?league=39&season=2025';
    delete process.env.API_FOOTBALL_PLAYERS_URLS;
    delete process.env.API_FOOTBALL_MAX_PAGES_PER_TARGET;
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    if (savedEnv.apiKey === undefined) {
      delete process.env.API_FOOTBALL_API_KEY;
    } else {
      process.env.API_FOOTBALL_API_KEY = savedEnv.apiKey;
    }

    if (savedEnv.playersUrl === undefined) {
      delete process.env.API_FOOTBALL_PLAYERS_URL;
    } else {
      process.env.API_FOOTBALL_PLAYERS_URL = savedEnv.playersUrl;
    }

    if (savedEnv.playersUrls === undefined) {
      delete process.env.API_FOOTBALL_PLAYERS_URLS;
    } else {
      process.env.API_FOOTBALL_PLAYERS_URLS = savedEnv.playersUrls;
    }

    if (savedEnv.maxPagesPerTarget === undefined) {
      delete process.env.API_FOOTBALL_MAX_PAGES_PER_TARGET;
    } else {
      process.env.API_FOOTBALL_MAX_PAGES_PER_TARGET = savedEnv.maxPagesPerTarget;
    }
  });

  it('extracts player rows from an API-Football response payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        errors: [],
        response: [sampleRaw.payload],
      }),
    }));

    await expect(fetchApiFootballPlayers()).resolves.toEqual([
      {
        provider: 'apiFootball',
        sourceId: '306',
        payload: sampleRaw.payload,
      },
    ]);
  });

  it('reports target and page counts for a single configured URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        errors: [],
        paging: { current: 1, total: 1 },
        response: [sampleRaw.payload],
      }),
    }));

    await expect(fetchApiFootballPlayerCoverage()).resolves.toMatchObject({
      players: [
        {
          provider: 'apiFootball',
          sourceId: '306',
          payload: sampleRaw.payload,
        },
      ],
      targetsFetched: 1,
      pagesFetched: 1,
    });
  });

  it('fetches multiple configured player URLs', async () => {
    delete process.env.API_FOOTBALL_PLAYERS_URL;
    process.env.API_FOOTBALL_PLAYERS_URLS = [
      'https://v3.football.api-sports.io/players?league=39&season=2025',
      'https://v3.football.api-sports.io/players?league=140&season=2025',
    ].join('\n');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [],
          paging: { current: 1, total: 1 },
          response: [sampleRaw.payload],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [],
          paging: { current: 1, total: 1 },
          response: [{
            player: { id: 999, name: 'Second Player' },
            statistics: [],
          }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchApiFootballPlayerCoverage()).resolves.toMatchObject({
      targetsFetched: 2,
      pagesFetched: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('follows API-Football pagination until the reported total page count', async () => {
    const secondPagePayload = {
      player: { id: 307, name: 'Page Two Player' },
      statistics: [],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [],
          paging: { current: 1, total: 2 },
          response: [sampleRaw.payload],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [],
          paging: { current: 2, total: 2 },
          response: [secondPagePayload],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchApiFootballPlayerCoverage();

    expect(result.players.map((player) => player.sourceId)).toEqual(['306', '307']);
    expect(result.pagesFetched).toBe(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://v3.football.api-sports.io/players?league=39&season=2025&page=1',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://v3.football.api-sports.io/players?league=39&season=2025&page=2',
      expect.any(Object),
    );
  });

  it('caps pagination at API_FOOTBALL_MAX_PAGES_PER_TARGET', async () => {
    process.env.API_FOOTBALL_MAX_PAGES_PER_TARGET = '2';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [],
          paging: { current: 1, total: 5 },
          response: [sampleRaw.payload],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [],
          paging: { current: 2, total: 5 },
          response: [{
            player: { id: 307, name: 'Page Two Player' },
            statistics: [],
          }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchApiFootballPlayerCoverage();

    expect(result.pagesFetched).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('de-dupes players fetched across targets and pages', async () => {
    delete process.env.API_FOOTBALL_PLAYERS_URL;
    process.env.API_FOOTBALL_PLAYERS_URLS = [
      'https://v3.football.api-sports.io/players?league=39&season=2025',
      'https://v3.football.api-sports.io/players?team=40&season=2025',
    ].join(',');

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [],
          paging: { current: 1, total: 1 },
          response: [sampleRaw.payload],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [],
          paging: { current: 1, total: 1 },
          response: [
            sampleRaw.payload,
            {
              player: { id: 307, name: 'Unique Player' },
              statistics: [],
            },
          ],
        }),
      }));

    const result = await fetchApiFootballPlayerCoverage();

    expect(result.players.map((player) => player.sourceId)).toEqual(['306', '307']);
    expect(result.targetsFetched).toBe(2);
    expect(result.pagesFetched).toBe(2);
  });

  it('fails when API-Football returns structured provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        errors: {
          requests: 'You have reached the daily request limit.',
        },
        response: [],
      }),
    }));

    await expect(fetchApiFootballPlayers()).rejects.toThrow(
      'API-Football returned errors: requests: You have reached the daily request limit.',
    );
  });

  it('fails when API-Football returns a successful but empty player response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        errors: [],
        results: 0,
        paging: { current: 1, total: 1 },
        response: [],
      }),
    }));

    await expect(fetchApiFootballPlayers()).rejects.toThrow(
      'API-Football response did not include player rows (results=0, paging.current=1, paging.total=1).',
    );
  });
});
