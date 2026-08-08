import { randomUUID } from 'node:crypto';

import { API_FOOTBALL_PROVIDER } from '../provider/types';
import { createServerSupabaseClient } from './server';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const API_FOOTBALL_BACKFILL_SEASON = '2024';
export const BIG_FIVE_LEAGUE_IDS = ['39', '140', '135', '78', '61'] as const;

export type BigFiveLeagueId = (typeof BIG_FIVE_LEAGUE_IDS)[number];
export type ProviderSyncRunKind = 'cron' | 'manual';
export type ProviderSyncRunStatus = 'running' | 'completed' | 'failed';

export interface ProviderSyncTarget {
  providerSource: typeof API_FOOTBALL_PROVIDER;
  season: typeof API_FOOTBALL_BACKFILL_SEASON;
  leagueId: BigFiveLeagueId;
  targetKey: string;
  utcDate: string;
}

export interface ProviderSyncRun {
  id: string;
  invocationKey: string;
  runKind: ProviderSyncRunKind;
  targetKey: string;
  utcDate: string;
  status: ProviderSyncRunStatus;
  lockToken: string;
  leaseExpiresAt: string;
  startedAt: string;
  completedAt: string | null;
  summary: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimProviderSyncRunInput {
  invocationKey: string;
  runKind: ProviderSyncRunKind;
  targetKey: string;
  utcDate: string;
  lockToken: string;
}

export interface ClaimProviderSyncRunResult {
  claimed: boolean;
  run: ProviderSyncRun;
}

export interface FinalizeProviderSyncRunInput {
  invocationKey: string;
  lockToken: string;
  status: Exclude<ProviderSyncRunStatus, 'running'>;
  summary?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
}

export interface ManualProviderSyncResult<T> {
  invocationKey: string;
  targetKey: string;
  summary: T;
}

export interface CronProviderSyncHealthRuns {
  latestRun: ProviderSyncRun | null;
  latestCompletedRun: ProviderSyncRun | null;
  latestFailedRun: ProviderSyncRun | null;
}

type ProviderSyncRunRow = {
  id: string;
  invocation_key: string;
  run_kind: ProviderSyncRunKind;
  target_key: string;
  utc_date: string;
  status: ProviderSyncRunStatus;
  lock_token: string;
  lease_expires_at: string;
  started_at: string;
  completed_at: string | null;
  summary: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ClaimProviderSyncRunRow = ProviderSyncRunRow & {
  claimed: boolean;
};

const PROVIDER_SYNC_RUN_SELECT = [
  'id',
  'invocation_key',
  'run_kind',
  'target_key',
  'utc_date',
  'status',
  'lock_token',
  'lease_expires_at',
  'started_at',
  'completed_at',
  'summary',
  'error',
  'created_at',
  'updated_at',
].join(', ');

export function getScheduledApiFootballTarget(now = new Date()): ProviderSyncTarget {
  const utcDate = toUtcDate(now);
  const epochDay = Math.floor(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ) / MS_PER_DAY);
  const index = ((epochDay % BIG_FIVE_LEAGUE_IDS.length) + BIG_FIVE_LEAGUE_IDS.length)
    % BIG_FIVE_LEAGUE_IDS.length;
  const leagueId = BIG_FIVE_LEAGUE_IDS[index];

  return {
    providerSource: API_FOOTBALL_PROVIDER,
    season: API_FOOTBALL_BACKFILL_SEASON,
    leagueId,
    targetKey: createProviderSyncTargetKey(
      API_FOOTBALL_PROVIDER,
      API_FOOTBALL_BACKFILL_SEASON,
      leagueId,
    ),
    utcDate,
  };
}

export function createCronInvocationKey(target: ProviderSyncTarget): string {
  return `cron:${target.providerSource}:${target.season}:${target.leagueId}:${target.utcDate}`;
}

export function createManualInvocationKey(targetKey: string): string {
  return `manual:${targetKey}:${randomUUID()}`;
}

export function createApiFootballManualTargetKey(
  leagueIds: readonly BigFiveLeagueId[] = BIG_FIVE_LEAGUE_IDS,
): string {
  if (leagueIds.length === 0) {
    throw new Error('Manual provider sync requires at least one target league');
  }

  if (leagueIds.some((leagueId) => !BIG_FIVE_LEAGUE_IDS.includes(leagueId))) {
    throw new Error('Manual provider sync target is outside the Big Five allowlist');
  }

  return `${API_FOOTBALL_PROVIDER}:${API_FOOTBALL_BACKFILL_SEASON}:${leagueIds.join(',')}`;
}

export function createProviderSyncTargetKey(
  providerSource: string,
  season: string,
  leagueId: string | number,
): string {
  return `${providerSource}:${season}:${leagueId}`;
}

export async function claimProviderSyncRun(
  input: ClaimProviderSyncRunInput,
): Promise<ClaimProviderSyncRunResult> {
  const supabase = requireServiceRoleClient();
  const { data, error } = await supabase.rpc('claim_provider_sync_run', {
    p_invocation_key: input.invocationKey,
    p_run_kind: input.runKind,
    p_target_key: input.targetKey,
    p_utc_date: input.utcDate,
    p_lock_token: input.lockToken,
  });

  if (error) {
    throw new Error(`Provider sync run claim failed: ${error.message}`);
  }

  const row = firstRow<ClaimProviderSyncRunRow>(data);
  if (!row) {
    throw new Error('Provider sync run claim returned no row');
  }

  return {
    claimed: row.claimed,
    run: fromRow(row),
  };
}

export async function finalizeProviderSyncRun(
  input: FinalizeProviderSyncRunInput,
): Promise<boolean> {
  const supabase = requireServiceRoleClient();
  const { data, error } = await supabase.rpc('finalize_provider_sync_run', {
    p_invocation_key: input.invocationKey,
    p_lock_token: input.lockToken,
    p_status: input.status,
    p_summary: input.summary ?? null,
    p_error: input.error ?? null,
  });

  if (error) {
    throw new Error(`Provider sync run finalize failed: ${error.message}`);
  }

  return Array.isArray(data) ? data[0] === true : data === true;
}

export async function runManualProviderSync<T extends object>(
  targetKey: string,
  sync: () => Promise<T>,
  invokedAt = new Date(),
): Promise<ManualProviderSyncResult<T>> {
  const invocationKey = createManualInvocationKey(targetKey);
  const lockToken = randomUUID();
  const startedAt = Date.now();
  const claim = await claimProviderSyncRun({
    invocationKey,
    runKind: 'manual',
    targetKey,
    utcDate: toUtcDate(invokedAt),
    lockToken,
  });

  if (!claim.claimed) {
    throw new Error('Random manual provider sync invocation key already exists');
  }

  let summary: T;
  try {
    summary = await sync();
  } catch (error) {
    const failure = {
      providerSource: targetKey.split(':', 1)[0] || API_FOOTBALL_PROVIDER,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown manual provider sync failure',
      durationMs: Math.max(0, Date.now() - startedAt),
    };
    const finalized = await finalizeProviderSyncRun({
      invocationKey,
      lockToken,
      status: 'failed',
      error: failure,
    });
    if (!finalized) {
      throw new Error('Manual provider sync failure could not be finalized', { cause: error });
    }
    throw error;
  }

  const finalized = await finalizeProviderSyncRun({
    invocationKey,
    lockToken,
    status: 'completed',
    summary: summary as unknown as Record<string, unknown>,
  });
  if (!finalized) {
    throw new Error('Manual provider sync completion could not be finalized');
  }

  return { invocationKey, targetKey, summary };
}

export async function getCronProviderSyncHealthRuns(): Promise<CronProviderSyncHealthRuns> {
  const supabase = requireServiceRoleClient();
  const [latest, latestCompleted, latestFailed] = await Promise.all([
    readLatestCronProviderSyncRun(supabase),
    readLatestCronProviderSyncRun(supabase, 'completed'),
    readLatestCronProviderSyncRun(supabase, 'failed'),
  ]);

  return {
    latestRun: latest,
    latestCompletedRun: latestCompleted,
    latestFailedRun: latestFailed,
  };
}

async function readLatestCronProviderSyncRun(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  status?: Extract<ProviderSyncRunStatus, 'completed' | 'failed'>,
): Promise<ProviderSyncRun | null> {
  let query = supabase
    .from('provider_sync_runs')
    .select(PROVIDER_SYNC_RUN_SELECT)
    .eq('run_kind', 'cron')
    .like('target_key', `${API_FOOTBALL_PROVIDER}:${API_FOOTBALL_BACKFILL_SEASON}:%`);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query
    .order('started_at', { ascending: false })
    .limit(1);

  if (error) {
    const suffix = status ? ` (${status})` : '';
    throw new Error(`Provider sync run health read failed${suffix}: ${error.message}`);
  }

  const row = firstRow<ProviderSyncRunRow>(data);
  return row ? fromRow(row) : null;
}

function requireServiceRoleClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for provider sync run persistence');
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is required for provider sync run persistence');
  }

  return supabase;
}

function fromRow(row: ProviderSyncRunRow): ProviderSyncRun {
  return {
    id: row.id,
    invocationKey: row.invocation_key,
    runKind: row.run_kind,
    targetKey: row.target_key,
    utcDate: row.utc_date,
    status: row.status,
    lockToken: row.lock_token,
    leaseExpiresAt: row.lease_expires_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    summary: row.summary,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] as T | undefined) ?? null;
  }
  if (data && typeof data === 'object') {
    return data as T;
  }
  return null;
}

function toUtcDate(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new Error('Scheduled provider sync requires a valid date');
  }
  return value.toISOString().slice(0, 10);
}
