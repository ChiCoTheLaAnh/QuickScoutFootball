#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const label = process.env.PERF_LABEL ?? 'default';
const searchQuery = process.env.PERF_SEARCH_QUERY ?? 'salah';

const recommendBody = {
  targetPlayerName: 'Mohamed Salah',
  role: 'RW',
  maxAge: 30,
  maxMarketValueEur: 60_000_000,
  minMinutes: 900,
  mode: 'like_for_like',
};

async function timedRequest(path, init) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON response
  }

  return {
    status: response.status,
    ok: response.ok,
    durationMs,
    payloadBytes: Buffer.byteLength(text, 'utf8'),
    json,
    text,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function printMetric(name, result, extra = {}) {
  console.log(JSON.stringify({
    label,
    baseUrl,
    check: name,
    status: result.status,
    durationMs: result.durationMs,
    payloadBytes: result.payloadBytes,
    ...extra,
  }));
}

async function main() {
  console.log(`Performance review against ${baseUrl} (${label})`);

  const search = await timedRequest(`/api/players/search?q=${encodeURIComponent(searchQuery)}`);
  assert(search.ok, `Search failed (${search.status}): ${search.text}`);
  assert(Array.isArray(search.json?.results), 'Search response missing results array');
  printMetric('players.search', search, {
    query: searchQuery,
    resultCount: search.json.results.length,
  });

  const recommend = await timedRequest('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recommendBody),
  });
  assert(recommend.ok, `Recommend failed (${recommend.status}): ${recommend.text}`);
  assert(recommend.json?.target?.fullName, 'Recommend response missing target');
  assert(Array.isArray(recommend.json?.recommendations), 'Recommend response missing recommendations array');
  printMetric('recommend', recommend, {
    recommendationCount: recommend.json.recommendations.length,
  });

  console.log('Performance review checks passed.');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
