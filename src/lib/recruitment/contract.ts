import { z } from 'zod';

export const brief = {
  target: 'Mohamed Salah',
  role: 'RW',
  season: '2024/25',
  cutoff: '2025-06-30',
  budgetEur: 45000000,
  maxAge: 25,
  minMinutes: 1200,
} as const;
export const methods = {
  quickscout: 'QuickScout V2',
  production: 'Goals + assists / 90',
  similarity: 'Statistical similarity',
} as const;
export type Method = keyof typeof methods;
const text = z.string().trim().min(1).max(300);
const count = z.int().nonnegative().nullable();
const rank = z.int().positive().nullable();
const metric = z.number().nonnegative().nullable();
const candidate = z.object({
  id: text,
  name: text,
  team: text.nullable(),
  age: count,
  minutes: count,
  valueEur: metric,
  valuationDate: z.iso
    .date()
    .refine((d) => d <= brief.cutoff)
    .nullable(),
  goalsPer90: metric,
  assistsPer90: metric,
  rwEvidence: text.nullable(),
  ranks: z.object({ quickscout: rank, production: rank, similarity: rank }),
  breakdown: z
    .array(z.object({ label: text, score: z.number().min(0).max(100) }))
    .max(12),
  limitation: text,
  scoutingQuestion: text,
});
export type Candidate = z.infer<typeof candidate>;
export const artifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.enum(['synthetic', 'retrospective']),
    source: text,
    release: text,
    scoringVersion: text,
    sharingApproved: z.literal(true),
    case: z.object({
      target: z.literal(brief.target),
      role: z.literal(brief.role),
      season: z.literal(brief.season),
      cutoff: z.literal(brief.cutoff),
      budgetEur: z.literal(brief.budgetEur),
      maxAge: z.literal(brief.maxAge),
      minMinutes: z.literal(brief.minMinutes),
    }),
    candidates: z.array(candidate).max(500),
  })
  .refine(
    (a) => new Set(a.candidates.map((c) => c.id)).size === a.candidates.length,
    'Duplicate candidate ID',
  )
  .refine(
    (a) => a.candidates.every((c) =>
      eligibility(c) === 'Within brief' || Object.values(c.ranks).every((r) => r === null)
    ),
    'Ranked candidates must meet the recruitment brief',
  )
  .refine(
    (a) =>
      (Object.keys(methods) as Method[]).every((m) => {
        const ranks = a.candidates
          .map((c) => c.ranks[m])
          .filter((r) => r !== null);
        return new Set(ranks).size === ranks.length;
      }),
    'Method requires distinct supplied ranks',
  );
export type Artifact = z.infer<typeof artifactSchema>;
export function eligibility(c: Candidate) {
  if (
    (c.valueEur !== null && c.valueEur > brief.budgetEur) ||
    (c.age !== null && c.age > brief.maxAge) ||
    (c.minutes !== null && c.minutes < brief.minMinutes)
  )
    return 'Outside brief';
  if (
    !c.valueEur ||
    !c.valuationDate ||
    !c.rwEvidence ||
    c.age === null ||
    c.minutes === null
  )
    return 'Unverified';
  return 'Within brief';
}
