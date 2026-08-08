import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as getRuns } from '../recommendation-runs/route';
import { POST as postRecommend } from '../recommend/route';

const savedEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const hasSupabase =
  Boolean(savedEnv.url?.trim()) && Boolean(savedEnv.anon?.trim());

const validBody = {
  targetPlayerName: 'Mohamed Salah',
  role: 'RW',
  maxAge: 30,
  maxMarketValueEur: 60_000_000,
  minMinutes: 900,
  mode: 'like_for_like',
};

describe.skipIf(!hasSupabase)('Supabase recommendation run persistence', () => {
  beforeAll(() => {
    // use real env from CI or local .env
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedEnv.anon;
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.service;
  });

  it('persists a run after POST /api/recommend', async () => {
    const recommendResponse = await postRecommend(
      new Request('http://localhost/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );
    expect(recommendResponse.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const runsResponse = await getRuns();
    expect(runsResponse.status).toBe(200);

    const runsPayload = await runsResponse.json();
    const runs = Array.isArray(runsPayload) ? runsPayload : runsPayload.runs;
    expect(Array.isArray(runs)).toBe(true);
    expect(runs.length).toBeGreaterThan(0);
  });
});
