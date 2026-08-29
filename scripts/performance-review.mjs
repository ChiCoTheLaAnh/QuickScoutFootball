#!/usr/bin/env node

import {
  assertSafeSecretTransport,
  assertTargetIdentity,
  selectUniqueTarget,
} from './acceptance-helpers.mjs';

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const label = process.env.PERF_LABEL ?? 'default';
const searchQuery = process.env.PERF_SEARCH_QUERY ?? 'salah';
const targetName = process.env.PERF_TARGET_NAME ?? 'Mohamed Salah';
const targetProviderSource = process.env.PERF_TARGET_PROVIDER_SOURCE?.trim();
const targetProviderPlayerId = process.env.PERF_TARGET_PROVIDER_PLAYER_ID?.trim();
const warmupCount = parseCount('PERF_WARMUPS', 3, 1, 3);
const measuredCount = parseCount('PERF_ITERATIONS', 50, 30, 500);
const searchIntervalMs = parseCount('PERF_SEARCH_INTERVAL_MS', 1_250, 1_100, 60_000);
const recommendIntervalMs = parseCount('PERF_RECOMMEND_INTERVAL_MS', 3_100, 3_100, 60_000);
const searchP95LimitMs = parseCount('PERF_SEARCH_P95_MS', 1_000, 1, 60_000);
const recommendP95LimitMs = parseCount('PERF_RECOMMEND_P95_MS', 2_000, 1, 60_000);
const perfReviewSecret = process.env.PERF_REVIEW_SECRET?.trim();

function parseCount(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  const parsed = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timedRequest(path, init) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON response is retained in `text` and fails endpoint validation.
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
  if (!condition) throw new Error(message);
}

function median(sorted) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function nearestRank(sorted, percentile) {
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function summarizeNumbers(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: Math.round(median(sorted) * 10) / 10,
    p95: Math.round(nearestRank(sorted, 0.95) * 10) / 10,
    max: Math.round(sorted.at(-1) * 10) / 10,
  };
}

function summarizeSeries(check, results, resultCounts, intervalMs) {
  const statusCounts = {};
  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
  }

  const failures = results.filter((result) => !result.ok || result.validationError);

  return {
    label,
    baseUrl,
    check,
    warmups: warmupCount,
    measuredIterations: measuredCount,
    intervalMs,
    durationMs: summarizeNumbers(results.map((result) => result.durationMs)),
    payloadBytes: summarizeNumbers(results.map((result) => result.payloadBytes)),
    resultCount: summarizeNumbers(resultCounts),
    statusCounts,
    errors: failures.length,
    validationErrors: results.filter((result) => result.validationError).length,
    errorSamples: failures.slice(0, 5).map((result) => {
      const error = result.requestError ?? result.validationError ?? `HTTP ${result.status}`;
      return {
        iteration: result.iteration,
        status: result.status,
        error: error.slice(0, 500),
      };
    }),
  };
}

async function discoverTarget() {
  const result = await timedRequest(`/api/players/search?q=${encodeURIComponent(searchQuery)}`);
  assert(result.ok, `Target discovery failed (${result.status}): ${result.text}`);
  assert(Array.isArray(result.json?.results), 'Target discovery response missing results array');

  return selectUniqueTarget(result.json.results, {
    targetName,
    targetProviderSource,
    targetProviderPlayerId,
  });
}

async function runSeries({ check, request, validate, resultCount, intervalMs = 0 }) {
  for (let index = 0; index < warmupCount; index += 1) {
    const warmup = await request();
    validate(warmup);
    if (intervalMs > 0) await sleep(intervalMs);
  }

  const results = [];
  const resultCounts = [];
  for (let index = 0; index < measuredCount; index += 1) {
    const requestStartedAt = performance.now();
    let result;
    try {
      result = await request();
    } catch (error) {
      result = {
        status: 'NETWORK_ERROR',
        ok: false,
        durationMs: Math.round((performance.now() - requestStartedAt) * 10) / 10,
        payloadBytes: 0,
        json: null,
        text: '',
        requestError: error instanceof Error ? error.message : String(error),
      };
    }

    let validationError = null;
    try {
      validate(result);
    } catch (error) {
      validationError = error instanceof Error ? error.message : String(error);
    }

    const measuredResult = { ...result, iteration: index + 1, validationError };
    results.push(measuredResult);
    try {
      resultCounts.push(resultCount(measuredResult));
    } catch {
      resultCounts.push(0);
    }
    if (intervalMs > 0 && index < measuredCount - 1) await sleep(intervalMs);
  }

  const summary = summarizeSeries(check, results, resultCounts, intervalMs);
  console.log(JSON.stringify(summary));
  return summary;
}

async function main() {
  assertSafeSecretTransport(baseUrl, perfReviewSecret);
  console.log(`Performance review against ${baseUrl} (${label})`);
  const target = await discoverTarget();
  await sleep(searchIntervalMs);

  const searchSummary = await runSeries({
    check: 'players.search',
    request: () => timedRequest(`/api/players/search?q=${encodeURIComponent(searchQuery)}`),
    validate: (result) => {
      assert(result.ok, `Search request failed (${result.status}): ${result.text}`);
      assert(Array.isArray(result.json?.results), 'Search response missing results array');
      selectUniqueTarget(result.json.results, {
        targetName,
        targetProviderSource,
        targetProviderPlayerId,
      });
    },
    resultCount: (result) => Array.isArray(result.json?.results) ? result.json.results.length : 0,
    intervalMs: searchIntervalMs,
  });

  const recommendBody = {
    targetPlayerName: target.fullName,
    targetPlayerIdentity: target.targetPlayerIdentity,
    role: target.position ?? 'RW',
    maxAge: null,
    maxMarketValueEur: null,
    minMinutes: 900,
    mode: 'like_for_like',
  };
  const recommendHeaders = { 'Content-Type': 'application/json' };
  if (perfReviewSecret) recommendHeaders['x-quickscout-perf-token'] = perfReviewSecret;

  const recommendSummary = await runSeries({
    check: 'recommend',
    request: () => timedRequest('/api/recommend', {
      method: 'POST',
      headers: recommendHeaders,
      body: JSON.stringify(recommendBody),
    }),
    validate: (result) => {
      assert(result.ok, `Recommend request failed (${result.status}): ${result.text}`);
      assert(result.json?.target?.fullName, 'Recommend response missing target');
      assertTargetIdentity(result.json.target, target.targetPlayerIdentity);
      assert(Array.isArray(result.json?.recommendations), 'Recommend response missing recommendations array');
      assert(result.json.recommendations.length > 0, 'Recommend response returned no recommendations');
    },
    resultCount: (result) => Array.isArray(result.json?.recommendations)
      ? result.json.recommendations.length
      : 0,
    intervalMs: recommendIntervalMs,
  });

  assert(searchSummary.errors === 0, 'Search benchmark contained request or validation errors');
  assert(recommendSummary.errors === 0, 'Recommendation benchmark contained request or validation errors');
  assert(
    searchSummary.durationMs.p95 < searchP95LimitMs,
    `Search p95 ${searchSummary.durationMs.p95}ms exceeds ${searchP95LimitMs}ms`,
  );
  assert(
    recommendSummary.durationMs.p95 < recommendP95LimitMs,
    `Recommendation p95 ${recommendSummary.durationMs.p95}ms exceeds ${recommendP95LimitMs}ms`,
  );

  console.log(JSON.stringify({
    event: 'performance.review.passed',
    label,
    warmups: warmupCount,
    measuredIterations: measuredCount,
    targetIdentity: target.targetPlayerIdentity ?? null,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
