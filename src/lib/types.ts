export interface Player {
  id: string;
  provider: string;
  providerPlayerId?: string;
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
  candidateType: RecommendationMode;
  breakdown: RecommendationScoreBreakdown;
  metadata?: Record<string, string | number | boolean | null>;
}

export type RecommendationMode = 'like_for_like' | 'cheaper' | 'young_upside';

export interface RecommendationScoreBreakdown {
  similarity: number;
  roleFit: number;
  output: number;
  affordability: number;
  ageUpside: number;
  total: number;
}

export interface RecommendationRequest {
  targetPlayerName: string;
  targetPlayerIdentity?: {
    providerSource: string;
    providerPlayerId: string;
  };
  role: string;
  maxAge: number | null;
  maxMarketValueEur: number | null;
  minMinutes: number | null;
  mode: RecommendationMode;
}

export interface RecommendationResponse {
  target: Player;
  recommendations: Recommendation[];
}

export interface ProviderPlayerRaw {
  provider: string;
  sourceId: string;
  payload: unknown;
}
