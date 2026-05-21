'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import type { Player, Recommendation, RecommendationMode, RecommendationRequest, RecommendationResponse } from '@/src/lib/types';

type PlayerSearchResult = {
  id: string;
  fullName: string;
  team?: string;
  position?: string;
  nationality?: string;
};

type ResultRow = {
  rank?: number;
  playerName: string;
  age?: number;
  club?: string;
  league?: string;
  position?: string;
  marketValueEur?: number;
  score?: number;
  candidateType?: RecommendationMode;
  explanation?: string;
  breakdown?: {
    similarity?: number;
    roleFit?: number;
    output?: number;
    affordability?: number;
    ageUpside?: number;
  };
};

export default function HomePage() {
  const [targetPlayerName, setTargetPlayerName] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<PlayerSearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [role, setRole] = useState('');
  const [maxAge, setMaxAge] = useState('30');
  const [maxMarketValueEur, setMaxMarketValueEur] = useState('60000000');
  const [minMinutes, setMinMinutes] = useState('900');
  const [mode, setMode] = useState<RecommendationMode>('like_for_like');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [lastTarget, setLastTarget] = useState<Player | null>(null);

  const searchContainerRef = useRef<HTMLLabelElement>(null);
  const hasResults = results.length > 0;

  const roleOptions = useMemo(
    () => ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'],
    [],
  );

  const trimmedTargetName = targetPlayerName.trim();
  const isSelectionLocked = Boolean(selectedTarget && selectedTarget.fullName === targetPlayerName);
  const shouldFetchSuggestions = trimmedTargetName.length > 0 && !isSelectionLocked;
  const visibleSearchResults = shouldFetchSuggestions ? searchResults : [];
  const isSearchDropdownOpen = shouldFetchSuggestions && searchOpen && visibleSearchResults.length > 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!shouldFetchSuggestions) return;

    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/players/search?q=${encodeURIComponent(targetPlayerName)}`);
        if (!response.ok) return;
        const payload = await response.json() as { results: PlayerSearchResult[] };
        setSearchResults(payload.results ?? []);
        setSearchOpen((payload.results ?? []).length > 0);
      } catch {
        setSearchResults([]);
        setSearchOpen(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [targetPlayerName, shouldFetchSuggestions]);

  const parseNullableNumber = (value: string): number | null => {
    if (value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const mapRecommendation = (recommendation: Recommendation, index: number): ResultRow => {
    const { player } = recommendation;
    return {
      rank: index + 1,
      playerName: player.fullName,
      age: player.age,
      club: player.team,
      position: player.position,
      marketValueEur: player.marketValueEur,
      score: recommendation.score,
      candidateType: recommendation.candidateType,
      explanation: recommendation.reasons.join(' · '),
      breakdown: recommendation.breakdown,
    };
  };

  const handleSelectPlayer = (player: PlayerSearchResult) => {
    setTargetPlayerName(player.fullName);
    setSelectedTarget(player);
    if (player.position) setRole(player.position);
    setSearchOpen(false);
    setSearchResults([]);
  };

  const handleTargetNameChange = (value: string) => {
    setTargetPlayerName(value);
    if (selectedTarget && selectedTarget.fullName !== value) {
      setSelectedTarget(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResults([]);
    setLastTarget(null);

    try {
      const requestBody: RecommendationRequest = {
        targetPlayerName,
        role,
        maxAge: parseNullableNumber(maxAge),
        maxMarketValueEur: parseNullableNumber(maxMarketValueEur),
        minMinutes: parseNullableNumber(minMinutes),
        mode,
      };

      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (response.status === 404) {
          throw new Error(payload?.error ?? 'Target player not found.');
        }
        throw new Error(payload?.error ?? `API error (${response.status})`);
      }

      const payload = await response.json() as RecommendationResponse;
      if (!payload.target || !Array.isArray(payload.recommendations)) {
        throw new Error('Unexpected response format from /api/recommend');
      }

      if (payload.recommendations.length === 0) {
        setError('No recommendations found for the selected filters.');
        return;
      }

      setLastTarget(payload.target);
      setResults(payload.recommendations.map(mapRecommendation));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'API error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 text-slate-900">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight">QuickScout Football Recommender</h1>
        <p className="mt-2 text-sm text-slate-600">Find replacement candidates with explainable scoring.</p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="relative flex flex-col gap-1 text-sm font-medium" ref={searchContainerRef}>
            Target player name
            <input
              required
              autoComplete="off"
              value={targetPlayerName}
              onChange={(e) => handleTargetNameChange(e.target.value)}
              onFocus={() => {
                if (visibleSearchResults.length > 0) setSearchOpen(true);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-indigo-200 focus:ring"
              placeholder="e.g. Mohamed Salah"
            />
            {isSearchDropdownOpen && (
              <ul className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {visibleSearchResults.map((player) => (
                  <li key={player.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectPlayer(player)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50"
                    >
                      <span className="font-medium">{player.fullName}</span>
                      <span className="ml-2 text-slate-500">
                        {[player.position, player.team].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Role
            <input
              list="role-options"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-indigo-200 focus:ring"
              placeholder="e.g. AM"
            />
            <datalist id="role-options">
              {roleOptions.map((roleOption) => (
                <option value={roleOption} key={roleOption} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as RecommendationMode)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-indigo-200 focus:ring"
            >
              <option value="like_for_like">Like-for-like</option>
              <option value="cheaper">Cheaper alternative</option>
              <option value="young_upside">Young upside</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Max age
            <input
              type="number"
              min={15}
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-indigo-200 focus:ring"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Max market value (EUR)
            <input
              type="number"
              min={0}
              value={maxMarketValueEur}
              onChange={(e) => setMaxMarketValueEur(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-indigo-200 focus:ring"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Min minutes
            <input
              type="number"
              min={0}
              value={minMinutes}
              onChange={(e) => setMinMinutes(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-indigo-200 focus:ring"
            />
          </label>

          <div className="md:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Searching…' : 'Get Recommendations'}
            </button>
          </div>
        </form>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Results</h2>

        {lastTarget && (
          <div className="mt-3 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <span className="font-semibold">Target:</span>{' '}
            {lastTarget.fullName}
            {lastTarget.team ? ` · ${lastTarget.team}` : ''}
            {lastTarget.position ? ` · ${lastTarget.position}` : ''}
            {typeof lastTarget.marketValueEur === 'number'
              ? ` · €${lastTarget.marketValueEur.toLocaleString()}`
              : ''}
          </div>
        )}

        {!loading && !error && !hasResults && (
          <p className="mt-3 text-sm text-slate-600">No results yet. Submit the form to see candidate recommendations.</p>
        )}

        {loading && <p className="mt-3 text-sm text-slate-600">Loading recommendations…</p>}

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {hasResults && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Age</th>
                  <th className="px-3 py-2">Club</th>
                  <th className="px-3 py-2">League</th>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">Market value</th>
                  <th className="px-3 py-2">Score / 100</th>
                  <th className="px-3 py-2">Candidate type</th>
                  <th className="px-3 py-2">Explanation</th>
                  <th className="px-3 py-2">Similarity</th>
                  <th className="px-3 py-2">Role fit</th>
                  <th className="px-3 py-2">Output</th>
                  <th className="px-3 py-2">Affordability</th>
                  <th className="px-3 py-2">Age upside</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {results.map((row, idx) => (
                  <tr key={`${row.playerName}-${idx}`} className="align-top hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-medium">{row.rank ?? idx + 1}</td>
                    <td className="px-3 py-2 font-medium">{row.playerName}</td>
                    <td className="px-3 py-2">{row.age ?? '—'}</td>
                    <td className="px-3 py-2">{row.club ?? '—'}</td>
                    <td className="px-3 py-2">{row.league ?? '—'}</td>
                    <td className="px-3 py-2">{row.position ?? '—'}</td>
                    <td className="px-3 py-2">
                      {typeof row.marketValueEur === 'number' ? `€${row.marketValueEur.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-2">{typeof row.score === 'number' ? row.score.toFixed(1) : '—'}</td>
                    <td className="px-3 py-2">{row.candidateType ?? '—'}</td>
                    <td className="max-w-md px-3 py-2 text-slate-700">{row.explanation ?? '—'}</td>
                    <td className="px-3 py-2">{row.breakdown?.similarity ?? '—'}</td>
                    <td className="px-3 py-2">{row.breakdown?.roleFit ?? '—'}</td>
                    <td className="px-3 py-2">{row.breakdown?.output ?? '—'}</td>
                    <td className="px-3 py-2">{row.breakdown?.affordability ?? '—'}</td>
                    <td className="px-3 py-2">{row.breakdown?.ageUpside ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
