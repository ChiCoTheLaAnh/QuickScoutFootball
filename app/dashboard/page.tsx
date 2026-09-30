'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

import type { Recommendation, RecommendationMode } from '@/src/lib/types';
import { MODE_WEIGHTS } from '@/src/lib/scoring';

type SearchPlayer = {
  id: string;
  providerSource: string;
  providerPlayerId: string;
  fullName: string;
  position?: string;
  team?: string;
};

type DashboardRecommendation = {
  target: { fullName: string };
  recommendations: Recommendation[];
  eligibleCandidateCount: number;
  marketValueCoveragePct: number | null;
};

type PipelineMetrics = {
  status: 'verified' | 'unverified' | 'late' | 'attention' | 'unavailable' | 'seed';
  checkedAt: string;
  latestRun: { status: string; logicalDate: string; startedAt: string; completedAt: string | null; errorCode: string | null } | null;
  latestAccepted: {
    logicalDate: string;
    completedAt: string | null;
    sourceReadAt: string;
    sourceCounts: { players: number; stats: number };
    martCounts: { facts: number; duplicate_keys: number; positive_facts: number } | null;
    metrics: { market_value_coverage_pct: number | null; positive_fact_pct: number | null } | null;
  } | null;
};

const statusText: Record<PipelineMetrics['status'], string> = {
  verified: 'Verified',
  unverified: 'Source newer than verified snapshot',
  late: 'Daily build overdue',
  attention: 'Latest run needs attention',
  unavailable: 'No verified snapshot available',
  seed: 'Seed data; pipeline verification unavailable',
};

function number(value: number | null | undefined, digits = 0): string {
  return typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : 'Unavailable';
}

function time(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC' : 'Unavailable';
}

export default function DashboardPage() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchPlayer[]>([]);
  const [selected, setSelected] = useState<SearchPlayer | null>(null);
  const [role, setRole] = useState('RW');
  const [mode, setMode] = useState<RecommendationMode>('like_for_like');
  const [maxAge, setMaxAge] = useState('30');
  const [maxMarketValue, setMaxMarketValue] = useState('');
  const [minMinutes, setMinMinutes] = useState('900');
  const [result, setResult] = useState<DashboardRecommendation | null>(null);
  const [pipeline, setPipeline] = useState<PipelineMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/analytics/metrics', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: PipelineMetrics) => { if (live) setPipeline(payload); })
      .catch(() => { if (live) setPipeline({ status: 'unavailable', checkedAt: new Date().toISOString(), latestRun: null, latestAccepted: null }); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (selected || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/players/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((payload: { results?: SearchPlayer[] }) => setSuggestions(payload.results ?? []))
        .catch(() => { if (!controller.signal.aborted) setSuggestions([]); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, selected]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) { setError('Select a player from the search results.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/dashboard/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPlayerName: selected.fullName,
          targetPlayerIdentity: { providerSource: selected.providerSource, providerPlayerId: selected.providerPlayerId },
          role, mode,
          maxAge: maxAge === '' ? null : Number(maxAge),
          maxMarketValueEur: maxMarketValue === '' ? null : Number(maxMarketValue),
          minMinutes: minMinutes === '' ? null : Number(minMinutes),
        }),
      });
      if (!response.ok) throw new Error('Could not load the shortlist. Please try again.');
      const payload = await response.json() as DashboardRecommendation;
      try {
        const statusResponse = await fetch('/api/analytics/metrics', { cache: 'no-store' });
        setPipeline(await statusResponse.json() as PipelineMetrics);
      } catch {
        setPipeline({ status: 'unavailable', checkedAt: new Date().toISOString(), latestRun: null, latestAccepted: null });
      }
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the data.');
    } finally {
      setLoading(false);
    }
  };

  const leader = result?.recommendations[0];
  const snapshot = pipeline?.latestAccepted;
  const weights = MODE_WEIGHTS[mode];
  const metrics = [
    { name: 'Top fit score', value: leader ? number(leader.score, 1) : 'No selection', unit: '/100', definition: `Total = similarity × ${weights.similarity} + role fit × ${weights.roleFit} + output × ${weights.output} + affordability × ${weights.affordability} + age upside × ${weights.ageUpside}.`, scope: 'Top-ranked candidate under the current filters', missing: 'No candidate: no score' },
    { name: 'Similarity', value: leader ? number(leader.breakdown.similarity, 1) : 'No selection', unit: '/100', definition: 'Similarity of the candidate and target stat vectors; advanced stats are used only when both players have them.', scope: 'Top-ranked candidate', missing: 'Missing xG/xA are excluded from the shared vector' },
    { name: 'Role fit / output', value: leader ? `${number(leader.breakdown.roleFit, 1)} / ${number(leader.breakdown.output, 1)}` : 'No selection', unit: '/100', definition: 'Both components currently use output normalized for the selected role.', scope: 'Top-ranked candidate', missing: 'Missing advanced stats are not imputed' },
    { name: 'Affordability / age upside', value: leader ? `${number(leader.breakdown.affordability, 1)} / ${number(leader.breakdown.ageUpside, 1)}` : 'No selection', unit: '/100', definition: 'Budget-based affordability score and age-band upside score.', scope: 'Top-ranked candidate', missing: 'Missing market value uses the scoring engine’s neutral rule' },
    { name: 'Eligible candidates', value: result ? number(result.eligibleCandidateCount) : 'No selection', unit: 'players', definition: 'Players left after excluding the target and applying age, market value, minutes, and search-mode filters; before the top-10 limit.', scope: 'Current filters', missing: '0 when no player is eligible' },
    { name: 'Market value coverage', value: result ? number(result.marketValueCoveragePct, 1) : 'No selection', unit: '%', definition: 'Eligible candidates with a market value / all eligible candidates × 100.', scope: 'Current filters', missing: 'Unavailable when there are no eligible candidates' },
    { name: 'Facts with positive appearances and minutes', value: number(snapshot?.metrics?.positive_fact_pct, 1), unit: '%', definition: 'Verified facts with appearances > 0 and minutes > 0 / all facts × 100.', scope: 'Entire mart in the latest accepted build', missing: 'Unavailable without an accepted build or when the denominator is 0' },
    { name: 'Verified facts', value: number(snapshot?.martCounts?.facts), unit: 'rows', definition: 'Rows in fact_player_season; must match source season-stat rows with no duplicate player_season_id.', scope: 'Entire mart in the latest accepted build', missing: 'Unavailable without an accepted build' },
    { name: 'Verification status', value: pipeline ? statusText[pipeline.status] : 'Checking', unit: 'status', definition: 'Verified when the source is unchanged, the latest run passed, and today has an accepted build by the 08:47 UTC deadline.', scope: 'All data at the time of the status check', missing: 'Unreadable ledger: no verified status' },
    { name: 'Latest accepted build', value: time(snapshot?.completedAt), unit: 'UTC', definition: 'Completion time of the latest dbt build accepted by the quality gate.', scope: 'Entire mart', missing: 'Unavailable if no build has passed' },
  ];

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">QuickScout · Scouting Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Choose a target, review the shortlist, and check data reliability.</p>
        </div>
        <Link href="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Back to QuickScout</Link>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Data status">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Data status</h2>
          <strong className={`rounded-full px-3 py-1 text-sm ${pipeline?.status === 'verified' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
            {pipeline ? statusText[pipeline.status] : 'Checking…'}
          </strong>
        </div>
        <p className="mt-3 text-sm text-slate-700">Latest accepted build: {time(snapshot?.completedAt)} · Source read: {time(snapshot?.sourceReadAt)} · Logical date: {snapshot?.logicalDate ?? 'Unavailable'}</p>
        <p className="mt-1 text-sm text-slate-700">Latest run: {pipeline?.latestRun?.status ?? 'Unavailable'}{pipeline?.latestRun?.errorCode ? ` (${pipeline.latestRun.errorCode})` : ''} · Status checked: {time(pipeline?.checkedAt)}</p>
        <p className="mt-2 text-sm text-amber-900">API-Football season 2024 data has not been shown to cover the full Big Five. Review coverage and timestamps before using a shortlist to make a decision.</p>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Build a shortlist</h2>
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="relative flex flex-col gap-1 text-sm font-medium">Target player
            <input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); setSuggestions([]); setResult(null); }} autoComplete="off" placeholder="e.g. Mohamed Salah" className="rounded-lg border border-slate-300 px-3 py-2" />
            {suggestions.length > 0 && <ul className="absolute top-full z-10 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {suggestions.map((player) => <li key={player.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-indigo-50" onClick={() => { setSelected(player); setQuery(player.fullName); setRole(player.position ?? 'RW'); setSuggestions([]); }}>{player.fullName} · {player.team ?? player.providerSource}</button></li>)}
            </ul>}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Role<input value={role} onChange={(event) => { setRole(event.target.value); setResult(null); }} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Search mode<select value={mode} onChange={(event) => { setMode(event.target.value as RecommendationMode); setResult(null); }} className="rounded-lg border border-slate-300 px-3 py-2"><option value="like_for_like">Like for like</option><option value="cheaper">Lower cost</option><option value="young_upside">Young upside</option></select></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Maximum age<input type="number" min="15" value={maxAge} onChange={(event) => { setMaxAge(event.target.value); setResult(null); }} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Maximum market value (EUR)<input type="number" min="0" value={maxMarketValue} onChange={(event) => { setMaxMarketValue(event.target.value); setResult(null); }} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Minimum minutes<input type="number" min="0" value={minMinutes} onChange={(event) => { setMinMinutes(event.target.value); setResult(null); }} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
          <button type="submit" disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-3">{loading ? 'Calculating…' : 'View candidates'}</button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {result && <div className="mt-5 overflow-x-auto"><h3 className="font-semibold">Top {result.recommendations.length} for {result.target.fullName}</h3>{pipeline?.status !== 'verified' && <p role="status" className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-950">This shortlist does not currently have a verified status. Use it for exploration, not as a final recruitment decision.</p>}<table className="mt-2 w-full min-w-[550px] text-left text-sm"><thead className="border-b bg-slate-50"><tr><th className="p-2">#</th><th className="p-2">Player</th><th className="p-2">Club</th><th className="p-2">Fit score</th><th className="p-2">Reason</th></tr></thead><tbody>{result.recommendations.map((item, index) => <tr key={item.player.id} className="border-b"><td className="p-2">{index + 1}</td><td className="p-2 font-medium">{item.player.fullName}</td><td className="p-2">{item.player.team ?? 'Unavailable'}</td><td className="p-2">{number(item.score, 1)}</td><td className="p-2 text-slate-600">{item.reasons.slice(1, 3).join(' ')}</td></tr>)}</tbody></table>{result.recommendations.length === 0 && <p className="mt-2 text-sm">No candidates match these filters.</p>}</div>}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Metrics and definitions</h2>
        <p className="mt-1 text-sm text-slate-600">Scouting metrics reflect the current filters; fact metrics come from the latest accepted build.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b bg-slate-50"><tr><th className="p-2">Metric</th><th className="p-2">Value</th><th className="p-2">Unit</th><th className="p-2">Definition</th><th className="p-2">Scope</th><th className="p-2">Missing data</th></tr></thead><tbody>{metrics.map((metric) => <tr key={metric.name} className="border-b align-top"><th className="p-2 font-semibold">{metric.name}</th><td className="p-2">{metric.value}</td><td className="p-2">{metric.unit}</td><td className="p-2">{metric.definition}</td><td className="p-2">{metric.scope}</td><td className="p-2">{metric.missing}</td></tr>)}</tbody></table></div>
      </section>
    </main>
  );
}
