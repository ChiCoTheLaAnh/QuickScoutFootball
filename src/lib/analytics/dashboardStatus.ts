export type DashboardStatus = 'verified' | 'unverified' | 'late' | 'attention' | 'unavailable' | 'seed';

export interface SourceState {
  players: number;
  stats: number;
  watermark: string | null;
}

export interface AcceptedState {
  completedAt: string;
  sourceWatermark: string | null;
  sourceCounts: { players: number; stats: number };
}

export function classifyDashboardStatus(
  input: {
    accepted: AcceptedState | null;
    source: SourceState;
    latestRunStatus: 'running' | 'completed' | 'failed' | null;
    latestRunStartedAt?: string | null;
    todayAccepted: boolean;
  },
  now = new Date(),
): DashboardStatus {
  const { accepted, source } = input;
  if (!accepted) return 'unavailable';
  if (input.latestRunStatus === 'failed') return 'attention';
  if (
    input.latestRunStatus === 'running'
    && input.latestRunStartedAt
    && now.getTime() - Date.parse(input.latestRunStartedAt) > 2 * 60 * 60 * 1000
  ) return 'attention';
  if (
    source.players !== accepted.sourceCounts.players
    || source.stats !== accepted.sourceCounts.stats
    || (source.watermark && (!accepted.sourceWatermark || Date.parse(source.watermark) > Date.parse(accepted.sourceWatermark)))
  ) return 'unverified';

  const deadline = new Date(`${now.toISOString().slice(0, 10)}T08:47:00.000Z`);
  if (!input.todayAccepted && now >= deadline) return 'late';
  return 'verified';
}
