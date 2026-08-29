import type { Player, ProviderPlayerRaw } from '../types';

export const API_FOOTBALL_PROVIDER = 'apiFootball';

export type ProviderSource = typeof API_FOOTBALL_PROVIDER | 'footio';

export interface ProviderSeasonStats {
  season?: string;
  competition?: string;
  competitionProviderId?: string;
  teamProviderId?: string;
  teamProviderIds?: string[];
  appearances?: number;
  starts?: number;
  minutes?: number;
  goals?: number;
  assists?: number;
  expectedGoals?: number;
  expectedAssists?: number;
  shots?: number;
  shotsOnTarget?: number;
  keyPasses?: number;
  passesTotal?: number;
  passAccuracy?: number;
  dribblesCompleted?: number;
  tackles?: number;
  interceptions?: number;
  aerialDuelsWon?: number;
  yellowCards?: number;
  redCards?: number;
  cleanSheets?: number;
  goalsConceded?: number;
  saves?: number;
}

export interface ProviderPlayerRecord {
  player: Player;
  providerSource: ProviderSource;
  providerPlayerId: string;
  normalizedName: string;
  slug: string;
  teamProviderId?: string;
  leagueName?: string;
  leagueProviderId?: string;
  seasonStats: ProviderSeasonStats[];
  metadata?: Record<string, unknown>;
}

export interface ProviderModule {
  name: string;
  fetchPlayers(): Promise<ProviderPlayerRaw[]>;
  transformPlayer(raw: ProviderPlayerRaw): Player | null;
}
