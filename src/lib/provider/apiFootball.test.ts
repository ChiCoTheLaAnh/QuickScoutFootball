import { describe, expect, it } from 'vitest';

import type { ProviderPlayerRaw } from '../types';
import { transformApiFootballPlayer, transformApiFootballPlayerRecord } from './apiFootball';

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
