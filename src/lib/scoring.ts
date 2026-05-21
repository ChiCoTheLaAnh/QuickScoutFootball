import type { Player, RecommendationMode, RecommendationRequest, RecommendationScoreBreakdown } from './types';

const EPSILON = 1e-9;

const ROLE_FEATURES: Record<string, string[]> = {
  winger: ['goals', 'assists', 'xA', 'keyPasses', 'shots', 'passAccuracyPct', 'minutes'],
  inside_forward: ['goals', 'xG', 'shots', 'assists', 'keyPasses', 'minutes'],
  striker: ['goals', 'xG', 'shots', 'minutes', 'assists'],
  attacking_midfielder: ['assists', 'xA', 'keyPasses', 'goals', 'passAccuracyPct', 'minutes'],
  central_midfielder: [
    'assists',
    'keyPasses',
    'passAccuracyPct',
    'tackles',
    'interceptions',
    'minutes',
  ],
  defensive_midfielder: [
    'tackles',
    'interceptions',
    'passAccuracyPct',
    'minutes',
    'keyPasses',
  ],
  fullback: ['assists', 'keyPasses', 'tackles', 'interceptions', 'passAccuracyPct', 'minutes'],
  centre_back: ['tackles', 'interceptions', 'passAccuracyPct', 'minutes'],
  goalkeeper: ['minutes', 'passAccuracyPct'],
};

const ROLE_TARGET_RANGES: Record<string, Record<string, [number, number]>> = {
  winger: { goals: [0, 20], assists: [0, 15], keyPasses: [0, 80], shots: [0, 100], xA: [0, 10], passAccuracyPct: [60, 95], minutes: [0, 3500] },
  inside_forward: { goals: [0, 25], assists: [0, 12], shots: [0, 120], xG: [0, 20], keyPasses: [0, 60], minutes: [0, 3500] },
  striker: { goals: [0, 30], assists: [0, 10], shots: [0, 130], xG: [0, 25], minutes: [0, 3500] },
  attacking_midfielder: { goals: [0, 18], assists: [0, 16], xA: [0, 12], keyPasses: [0, 110], passAccuracyPct: [65, 95], minutes: [0, 3500] },
  central_midfielder: { assists: [0, 12], keyPasses: [0, 90], passAccuracyPct: [65, 96], tackles: [0, 120], interceptions: [0, 90], minutes: [0, 3500] },
  defensive_midfielder: { tackles: [0, 140], interceptions: [0, 110], passAccuracyPct: [65, 97], keyPasses: [0, 50], minutes: [0, 3500] },
  fullback: { assists: [0, 12], keyPasses: [0, 70], tackles: [0, 120], interceptions: [0, 100], passAccuracyPct: [60, 94], minutes: [0, 3500] },
  centre_back: { tackles: [0, 120], interceptions: [0, 110], passAccuracyPct: [65, 98], minutes: [0, 3500] },
  goalkeeper: { passAccuracyPct: [45, 95], minutes: [0, 3500] },
};

export type ScoreBreakdown = RecommendationScoreBreakdown;

type ScoreWeights = {
  similarity: number;
  roleFit: number;
  output: number;
  affordability: number;
  ageUpside: number;
};

const MODE_WEIGHTS: Record<RecommendationMode, ScoreWeights> = {
  like_for_like: { similarity: 0.45, roleFit: 0.2, output: 0.15, affordability: 0.1, ageUpside: 0.1 },
  cheaper: { similarity: 0.3, roleFit: 0.15, output: 0.1, affordability: 0.35, ageUpside: 0.1 },
  young_upside: { similarity: 0.35, roleFit: 0.15, output: 0.1, affordability: 0.05, ageUpside: 0.35 },
};

export function filterCandidatesByMode(
  target: Player,
  candidates: Player[],
  mode: RecommendationMode,
): Player[] {
  if (mode === 'cheaper') {
    const targetMv = target.marketValueEur ?? Number.POSITIVE_INFINITY;
    const cheaper = candidates.filter(
      (candidate) => (candidate.marketValueEur ?? Number.POSITIVE_INFINITY) <= targetMv,
    );
    return cheaper.length > 0 ? cheaper : candidates;
  }

  if (mode === 'young_upside') {
    const targetAge = target.age ?? 30;
    const younger = candidates.filter((candidate) => (candidate.age ?? 0) < targetAge);
    return younger.length > 0 ? younger : candidates;
  }

  return candidates;
}

export function normalizeValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0;
  }

  const normalized = (value - min) / (max - min);
  return Math.min(1, Math.max(0, normalized));
}

export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  const length = Math.min(vectorA.length, vectorB.length);
  if (length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < length; i += 1) {
    const a = Number.isFinite(vectorA[i]) ? vectorA[i] : 0;
    const b = Number.isFinite(vectorB[i]) ? vectorB[i] : 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }

  if (magA <= EPSILON || magB <= EPSILON) return 0;
  const sim = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  return Math.max(0, Math.min(1, sim));
}

export function buildRoleVector(player: Player, role: string): number[] {
  const roleKey = role in ROLE_FEATURES ? role : 'central_midfielder';
  const stats = player.stats ?? {};
  const ranges = ROLE_TARGET_RANGES[roleKey] ?? {};

  return ROLE_FEATURES[roleKey].map((feature) => {
    const raw = typeof stats[feature] === 'number' ? (stats[feature] as number) : 0;
    const [min, max] = ranges[feature] ?? [0, 1];
    return normalizeValue(raw, min, max);
  });
}

export function calculateSimilarityScore(target: Player, candidate: Player, role: string): number {
  const targetVector = buildRoleVector(target, role);
  const candidateVector = buildRoleVector(candidate, role);
  return cosineSimilarity(targetVector, candidateVector) * 100;
}

export function calculateAffordabilityScore(candidate: Player, maxMarketValueEur?: number): number {
  if (!maxMarketValueEur || maxMarketValueEur <= 0) return 50;
  const mv = candidate.marketValueEur;
  if (!mv || mv <= 0) return 65;

  if (mv <= maxMarketValueEur) {
    return 60 + 40 * (1 - normalizeValue(mv, 0, maxMarketValueEur));
  }

  const overshootRatio = (mv - maxMarketValueEur) / maxMarketValueEur;
  return Math.max(0, 60 - overshootRatio * 120);
}

export function calculateAgeUpsideScore(candidate: Player): number {
  const age = candidate.age;
  if (!age || age <= 0) return 55;
  if (age <= 21) return 100;
  if (age <= 24) return 90;
  if (age <= 27) return 75;
  if (age <= 30) return 55;
  if (age <= 33) return 35;
  return 20;
}

function calculateOutputScore(candidate: Player, role: string): number {
  const roleKey = role in ROLE_FEATURES ? role : 'central_midfielder';
  const vector = buildRoleVector(candidate, roleKey);
  if (vector.length === 0) return 0;
  const avg = vector.reduce((sum, val) => sum + val, 0) / vector.length;
  return avg * 100;
}

function normalizeRole(role: string): string {
  const normalized = role.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const roleAliases: Record<string, string> = {
    gk: 'goalkeeper',
    cb: 'centre_back',
    rb: 'fullback',
    lb: 'fullback',
    dm: 'defensive_midfielder',
    cm: 'central_midfielder',
    am: 'attacking_midfielder',
    rw: 'winger',
    lw: 'winger',
    st: 'striker',
  };

  return roleAliases[normalized] ?? normalized;
}

function inferRole(request: RecommendationRequest, candidate: Player): string {
  return normalizeRole(request.role || candidate.position || 'central_midfielder');
}

export function calculateReplacementScore(
  target: Player,
  candidate: Player,
  request: RecommendationRequest,
): ScoreBreakdown {
  const role = inferRole(request, candidate);
  const similarity = calculateSimilarityScore(target, candidate, role);
  const roleFit = calculateOutputScore(candidate, role);
  const output = calculateOutputScore(candidate, role);
  const affordability = calculateAffordabilityScore(candidate, request.maxMarketValueEur ?? undefined);
  const ageUpside = calculateAgeUpsideScore(candidate);
  const weights = MODE_WEIGHTS[request.mode] ?? MODE_WEIGHTS.like_for_like;

  const total =
    weights.similarity * similarity +
    weights.roleFit * roleFit +
    weights.output * output +
    weights.affordability * affordability +
    weights.ageUpside * ageUpside;

  return {
    similarity,
    roleFit,
    output,
    affordability,
    ageUpside,
    total: Math.max(0, Math.min(100, total)),
  };
}

export function explainRecommendation(
  target: Player,
  candidate: Player,
  scores: ScoreBreakdown,
): string[] {
  const reasons: string[] = [];
  reasons.push(`${candidate.fullName} total replacement fit: ${scores.total.toFixed(1)}/100.`);

  if (scores.similarity >= 75) reasons.push(`High stylistic similarity to ${target.fullName}.`);
  else if (scores.similarity >= 55) reasons.push(`Moderate similarity to ${target.fullName}.`);
  else reasons.push(`Lower similarity profile versus ${target.fullName}.`);

  if (scores.affordability >= 70) reasons.push('Strong affordability within budget constraints.');
  else if (scores.affordability < 40) reasons.push('Transfer value may be above the preferred budget.');

  if (scores.ageUpside >= 80) reasons.push('Excellent long-term age upside.');
  else if (scores.ageUpside < 40) reasons.push('Limited long-term upside due to player age curve.');

  return reasons;
}

export function scorePlayer(player: Player, request: RecommendationRequest): number {
  const baselineTarget: Player = {
    id: 'baseline',
    provider: 'derived',
    fullName: 'Target Profile',
    position: request.role,
    stats: {},
  };

  return calculateReplacementScore(baselineTarget, player, request).total;
}
