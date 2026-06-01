import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderPlayerRaw } from '../types';
import {
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
  };

  beforeEach(() => {
    process.env.API_FOOTBALL_API_KEY = 'test-api-key';
    process.env.API_FOOTBALL_PLAYERS_URL = 'https://v3.football.api-sports.io/players?league=39&season=2025';
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
