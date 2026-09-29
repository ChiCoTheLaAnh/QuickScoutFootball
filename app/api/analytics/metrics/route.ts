import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { classifyDashboardStatus } from '@/src/lib/analytics/dashboardStatus';
import { isSupabaseConfigured } from '@/src/lib/supabase/client';
import { createServerSupabaseClient } from '@/src/lib/supabase/server';

export const dynamic = 'force-dynamic';

type TableName = 'players' | 'player_season_stats';
type PipelineRow = {
  status: 'running' | 'completed' | 'failed';
  logical_date: string;
  started_at: string;
  completed_at: string | null;
  source_read_at: string;
  source_watermark: string | null;
  source_counts: { players: number; stats: number; active_players?: number; priced_players?: number };
  mart_counts: { facts: number; duplicate_keys: number; positive_facts: number } | null;
  metrics: { market_value_coverage_pct: number | null; positive_fact_pct: number | null } | null;
  error_code: string | null;
};

async function tableState(client: SupabaseClient, table: TableName) {
  const [countResult, watermarkResult] = await Promise.all([
    client.from(table).select('id', { count: 'exact', head: true }),
    client.from(table).select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (countResult.error || watermarkResult.error || countResult.count === null) {
    throw new Error('Source state is unavailable');
  }
  return { count: countResult.count, watermark: watermarkResult.data?.updated_at ?? null };
}

function sanitizedRun(row: PipelineRow | null) {
  if (!row) return null;
  return {
    status: row.status,
    logicalDate: row.logical_date,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
  };
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ status: 'seed', checkedAt: new Date().toISOString(), latestRun: null, latestAccepted: null, currentSource: null });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json({ status: 'unavailable', checkedAt: new Date().toISOString(), latestRun: null, latestAccepted: null, currentSource: null }, { status: 503 });
  }

  const client = createServerSupabaseClient();
  if (!client) {
    return NextResponse.json({ status: 'unavailable', checkedAt: new Date().toISOString(), latestRun: null, latestAccepted: null, currentSource: null }, { status: 503 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const [latestResult, acceptedResult, todayResult, players, stats] = await Promise.all([
      client.from('analytics_pipeline_runs').select('status,logical_date,started_at,completed_at,source_read_at,source_watermark,source_counts,mart_counts,metrics,error_code').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      client.from('analytics_pipeline_runs').select('status,logical_date,started_at,completed_at,source_read_at,source_watermark,source_counts,mart_counts,metrics,error_code').eq('status', 'completed').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
      client.from('analytics_pipeline_runs').select('id', { count: 'exact', head: true }).eq('status', 'completed').eq('logical_date', today),
      tableState(client, 'players'),
      tableState(client, 'player_season_stats'),
    ]);
    if (latestResult.error || acceptedResult.error || todayResult.error || todayResult.count === null) {
      throw new Error('Run state is unavailable');
    }
    const latestRun = latestResult.data as PipelineRow | null;
    const accepted = acceptedResult.data as PipelineRow | null;
    const currentSource = {
      players: players.count,
      stats: stats.count,
      watermark: [players.watermark, stats.watermark].filter(Boolean).sort().at(-1) ?? null,
    };
    const status = classifyDashboardStatus({
      accepted: accepted?.completed_at ? {
        completedAt: accepted.completed_at,
        sourceWatermark: accepted.source_watermark,
        sourceCounts: accepted.source_counts,
      } : null,
      source: currentSource,
      latestRunStatus: latestRun?.status ?? null,
      latestRunStartedAt: latestRun?.started_at ?? null,
      todayAccepted: todayResult.count > 0,
    });

    return NextResponse.json({
      status,
      checkedAt: new Date().toISOString(),
      latestRun: sanitizedRun(latestRun),
      latestAccepted: accepted ? {
        logicalDate: accepted.logical_date,
        completedAt: accepted.completed_at,
        sourceReadAt: accepted.source_read_at,
        sourceWatermark: accepted.source_watermark,
        sourceCounts: accepted.source_counts,
        martCounts: accepted.mart_counts,
        metrics: accepted.metrics,
      } : null,
      currentSource,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ status: 'unavailable', checkedAt: new Date().toISOString(), latestRun: null, latestAccepted: null, currentSource: null }, { status: 503 });
  }
}
