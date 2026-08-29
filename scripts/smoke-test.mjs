#!/usr/bin/env node

import { assertTargetIdentity, selectUniqueTarget } from './acceptance-helpers.mjs';

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const checkSupabaseRuns = process.env.SMOKE_SUPABASE === '1';
const checkCronHealth = process.env.SMOKE_CRON_HEALTH === '1';
const expectHealthyCron = process.env.SMOKE_CRON_HEALTH_EXPECT_HEALTHY === '1';
const smokeSearchQuery = process.env.SMOKE_SEARCH_QUERY?.trim() || 'salah';

const recommendFilters = {
  role: 'RW',
  maxAge: 30,
  maxMarketValueEur: null,
  minMinutes: 900,
  mode: 'like_for_like',
};

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body
  }
  return { response, json, text };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log(`Smoke test against ${baseUrl}`);

  const home = await request('/');
  assert(home.response.ok, `GET / failed (${home.response.status})`);
  assert(home.text.includes('QuickScout'), 'GET / missing app title');

  const search = await request(`/api/players/search?q=${encodeURIComponent(smokeSearchQuery)}`);
  assert(search.response.ok, `GET /api/players/search failed (${search.response.status})`);
  assert(Array.isArray(search.json?.results), 'Search response missing results array');
  assert(search.json.results.length > 0, `Search returned no players for "${smokeSearchQuery}"`);
  const target = selectUniqueTarget(search.json.results, {
    targetName: process.env.SMOKE_TARGET_NAME?.trim() || 'Mohamed Salah',
    targetProviderSource: process.env.SMOKE_TARGET_PROVIDER_SOURCE,
    targetProviderPlayerId: process.env.SMOKE_TARGET_PROVIDER_PLAYER_ID,
    configurationPrefix: 'SMOKE',
  });
  const validRecommendBody = {
    targetPlayerName: target.fullName,
    targetPlayerIdentity: target.targetPlayerIdentity,
    ...recommendFilters,
  };

  const recommend = await request('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validRecommendBody),
  });
  assert(recommend.response.ok, `POST /api/recommend failed (${recommend.response.status}): ${recommend.text}`);
  assert(recommend.json?.target?.fullName, 'Recommend response missing target');
  assertTargetIdentity(recommend.json.target, target.targetPlayerIdentity);
  assert(
    Array.isArray(recommend.json?.recommendations) && recommend.json.recommendations.length > 0,
    'Recommend response missing recommendations',
  );

  const invalid = await request('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetPlayerName: '' }),
  });
  assert(invalid.response.status === 400, `Expected 400 for invalid body, got ${invalid.response.status}`);

  const notFound = await request('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetPlayerName: 'Nonexistent Player XYZ',
      ...recommendFilters,
    }),
  });
  assert(notFound.response.status === 404, `Expected 404 for unknown player, got ${notFound.response.status}`);

  if (checkSupabaseRuns) {
    const runs = await request('/api/recommendation-runs');
    assert(runs.response.ok, `GET /api/recommendation-runs failed (${runs.response.status})`);
    const list = Array.isArray(runs.json) ? runs.json : runs.json?.runs ?? runs.json;
    assert(Array.isArray(list) && list.length > 0, 'No recommendation runs returned (Supabase may be unset)');
    console.log('Supabase run persistence: OK');
  }

  if (checkCronHealth) {
    const cronSecret = process.env.CRON_SECRET?.trim();
    assert(cronSecret, 'CRON_SECRET is required for cron health smoke checks');

    const health = await request('/api/cron/health', {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    assert(health.response.ok, `GET /api/cron/health failed (${health.response.status}): ${health.text}`);
    assert(typeof health.json?.status === 'string', 'Cron health response missing status');
    assert(typeof health.json?.needsAttention === 'boolean', 'Cron health response missing needsAttention');
    assert(typeof health.json?.isStale === 'boolean', 'Cron health response missing isStale');

    if (expectHealthyCron) {
      assert(
        health.json.needsAttention === false,
        `Cron health needs attention: ${JSON.stringify(health.json)}`,
      );
    }

    console.log(`Cron health: ${health.json.status}`);
  }

  console.log('Smoke test passed.');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
