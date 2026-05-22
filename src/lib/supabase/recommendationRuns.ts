import { createHash, randomUUID } from 'crypto';

import { logServerEvent } from '../logging';
import { isSupabaseConfigured } from './client';
import { createServerSupabaseClient } from './server';
import type { RecommendationRequest, RecommendationResponse } from '../types';

export interface RecommendationRunRecord {
  id: string;
  runKey: string;
  providerSource: string;
  requestPayload: RecommendationRequest;
  recommendationCount: number;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  errorMessage: string | null;
  metadata: {
    response?: RecommendationResponse;
    [key: string]: unknown;
  };
}

type RecommendationRunRow = {
  id: string;
  run_key: string;
  provider_source: string;
  request_payload: RecommendationRequest;
  recommendation_count: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

const MAX_MEMORY_RUNS = 50;
const memoryRuns: RecommendationRunRecord[] = [];

function buildRunKey(request: RecommendationRequest): string {
  const hash = createHash('sha256')
    .update(JSON.stringify({ ...request, ts: Date.now() }))
    .digest('hex')
    .slice(0, 12);
  return `run-${Date.now()}-${hash}`;
}

function mapRow(row: RecommendationRunRow): RecommendationRunRecord {
  const metadata = (row.metadata ?? {}) as RecommendationRunRecord['metadata'];
  return {
    id: row.id,
    runKey: row.run_key,
    providerSource: row.provider_source,
    requestPayload: row.request_payload,
    recommendationCount: row.recommendation_count,
    status: row.status === 'failed' ? 'failed' : 'completed',
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms ?? 0,
    errorMessage: row.error_message,
    metadata,
  };
}

function pushMemoryRun(record: RecommendationRunRecord): void {
  memoryRuns.unshift(record);
  if (memoryRuns.length > MAX_MEMORY_RUNS) {
    memoryRuns.length = MAX_MEMORY_RUNS;
  }
}

export async function createRecommendationRun(
  request: RecommendationRequest,
  response: RecommendationResponse,
  startedAt: number,
): Promise<RecommendationRunRecord | null> {
  const completedAt = Date.now();
  const durationMs = completedAt - startedAt;
  const runKey = buildRunKey(request);
  const providerSource = isSupabaseConfigured() ? 'supabase' : 'seed';

  const record: RecommendationRunRecord = {
    id: randomUUID(),
    runKey,
    providerSource,
    requestPayload: request,
    recommendationCount: response.recommendations.length,
    status: 'completed',
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    durationMs,
    errorMessage: null,
    metadata: { response },
  };

  if (!isSupabaseConfigured()) {
    pushMemoryRun(record);
    return record;
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    logServerEvent({
      event: 'recommendation_run.persistence_fallback',
      route: '/api/recommend',
      status: 202,
      durationMs,
      level: 'warn',
      metadata: {
        providerSource,
        recommendationCount: response.recommendations.length,
        errorName: 'SupabaseClientUnavailable',
      },
    });
    pushMemoryRun(record);
    return record;
  }

  const { data, error } = await supabase
    .from('recommendation_runs')
    .insert({
      run_key: runKey,
      provider_source: providerSource,
      request_payload: request,
      recommendation_count: response.recommendations.length,
      status: 'completed',
      started_at: record.startedAt,
      completed_at: record.completedAt,
      duration_ms: durationMs,
      metadata: { response },
    })
    .select('id, run_key, provider_source, request_payload, recommendation_count, status, started_at, completed_at, duration_ms, error_message, metadata')
    .single();

  if (error || !data) {
    logServerEvent({
      event: 'recommendation_run.persistence_fallback',
      route: '/api/recommend',
      status: 202,
      durationMs,
      level: 'warn',
      metadata: {
        providerSource,
        recommendationCount: response.recommendations.length,
        errorName: error?.name ?? null,
      },
    });
    pushMemoryRun(record);
    return record;
  }

  return mapRow(data as RecommendationRunRow);
}

export async function listRecommendationRuns(limit = 20): Promise<RecommendationRunRecord[]> {
  if (!isSupabaseConfigured()) {
    return memoryRuns.slice(0, limit);
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) return memoryRuns.slice(0, limit);

  const { data, error } = await supabase
    .from('recommendation_runs')
    .select('id, run_key, provider_source, request_payload, recommendation_count, status, started_at, completed_at, duration_ms, error_message, metadata')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error || !data) return memoryRuns.slice(0, limit);

  return (data as RecommendationRunRow[]).map(mapRow);
}

export async function getRecommendationRunByKey(runKey: string): Promise<RecommendationRunRecord | null> {
  if (!isSupabaseConfigured()) {
    return memoryRuns.find((run) => run.runKey === runKey) ?? null;
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return memoryRuns.find((run) => run.runKey === runKey) ?? null;
  }

  const { data, error } = await supabase
    .from('recommendation_runs')
    .select('id, run_key, provider_source, request_payload, recommendation_count, status, started_at, completed_at, duration_ms, error_message, metadata')
    .eq('run_key', runKey)
    .maybeSingle();

  if (error || !data) {
    return memoryRuns.find((run) => run.runKey === runKey) ?? null;
  }

  return mapRow(data as RecommendationRunRow);
}

export async function getLatestRecommendationResponse(): Promise<RecommendationResponse | null> {
  const runs = await listRecommendationRuns(1);
  const latest = runs[0];
  return latest?.metadata?.response ?? null;
}
