import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from './route';

const saved = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

beforeAll(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
afterAll(() => {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: saved.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: saved.anon,
    SUPABASE_SERVICE_ROLE_KEY: saved.service,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function request(body: unknown) {
  return POST(new Request('http://localhost/api/dashboard/recommend', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

const body = {
  targetPlayerName: 'Mohamed Salah',
  targetPlayerIdentity: { providerSource: 'seed', providerPlayerId: 'seed-mohamed-salah' },
  role: 'RW', maxAge: 30, maxMarketValueEur: null, minMinutes: 900, mode: 'like_for_like',
};

describe('POST /api/dashboard/recommend', () => {
  it('returns the existing scoring results with full eligible cohort metrics', async () => {
    const response = await request(body);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.target.fullName).toBe('Mohamed Salah');
    expect(payload.eligibleCandidateCount).toBeGreaterThanOrEqual(payload.recommendations.length);
    expect(payload.marketValueCoveragePct).toBeGreaterThanOrEqual(0);
    expect(payload.marketValueCoveragePct).toBeLessThanOrEqual(100);
  });

  it('rejects an unknown exact identity instead of silently falling back to name', async () => {
    const response = await request({ ...body, targetPlayerIdentity: { providerSource: 'seed', providerPlayerId: 'missing' } });
    expect(response.status).toBe(404);
  });
});
