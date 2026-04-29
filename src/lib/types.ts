export interface Player {
  id: string;
  provider: string;
  fullName: string;
  age?: number;
  nationality?: string;
  team?: string;
  position?: string;
  marketValueEur?: number;
  stats?: PlayerStats;
}

export interface PlayerStats {
  minutes?: number;
  appearances?: number;
  goals?: number;
  assists?: number;
  shots?: number;
  keyPasses?: number;
  tackles?: number;
  interceptions?: number;
  passAccuracyPct?: number;
  xG?: number;
  xA?: number;
  [key: string]: number | string | undefined;
}

export interface Recommendation {
  player: Player;
  score: number;
  reasons: string[];
  confidence: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RecommendationRequest {
  targetPosition?: string;
  maxAge?: number;
  maxMarketValueEur?: number;
  minMinutes?: number;
  teamStyle?: string;
  limit?: number;
  providers?: string[];
}

export interface ProviderPlayerRaw {
  provider: string;
  sourceId: string;
  payload: unknown;
}
