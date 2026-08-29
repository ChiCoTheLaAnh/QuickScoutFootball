import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRateLimits } from '@/src/lib/rateLimit';
import * as recommendationRuns from '@/src/lib/supabase/recommendationRuns';
import * as playersData from '@/src/lib/supabase/players';
import { POST } from './route';

const savedEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  logLevel: process.env.LOG_LEVEL,
  perfReviewSecret: process.env.PERF_REVIEW_SECRET,
};

const validBody = {
  targetPlayerName: 'Mohamed Salah',
  role: 'RW',
  maxAge: 30,
  maxMarketValueEur: 60_000_000,
  minMinutes: 900,
  mode: 'like_for_like',
};

beforeAll(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.LOG_LEVEL = 'silent';
  delete process.env.PERF_REVIEW_SECRET;
});

afterAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedEnv.anon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.service;
  process.env.LOG_LEVEL = savedEnv.logLevel;
  if (savedEnv.perfReviewSecret === undefined) {
    delete process.env.PERF_REVIEW_SECRET;
  } else {
    process.env.PERF_REVIEW_SECRET = savedEnv.perfReviewSecret;
  }
});

beforeEach(() => {
  resetRateLimits();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.PERF_REVIEW_SECRET;
});

function postRecommend(body: unknown, ip = '203.0.113.10') {
  return POST(
    new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': ip,
      },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/recommend (seed mode)', () => {
  it('returns 400 for invalid payload', async () => {
    const response = await postRecommend({ targetPlayerName: '' });
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error).toBe('Invalid RecommendationRequest payload.');
    expect(payload.code).toBe('INVALID_RECOMMENDATION_REQUEST');
  });

  it('returns 404 for unknown target player', async () => {
    const response = await postRecommend({
      ...validBody,
      targetPlayerName: 'Nonexistent Player XYZ',
    });
    expect(response.status).toBe(404);

    const payload = await response.json();
    expect(payload.error).toBe('Target player not found.');
    expect(payload.code).toBe('TARGET_PLAYER_NOT_FOUND');
  });

  it('returns recommendations for Mohamed Salah', async () => {
    const response = await postRecommend(validBody);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.target.fullName).toBe('Mohamed Salah');
    expect(payload.recommendations.length).toBeGreaterThan(0);
    expect(payload.recommendations[0].score).toBeGreaterThan(0);
  });

  it('uses an exact target identity and never falls back to the supplied name', async () => {
    const response = await postRecommend({
      ...validBody,
      targetPlayerName: 'Mohamed Salah',
      targetPlayerIdentity: {
        providerSource: 'seed',
        providerPlayerId: 'missing-player',
      },
    });

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('TARGET_PLAYER_NOT_FOUND');
  });

  it('returns 409 when a legacy name-only target is ambiguous', async () => {
    const lookup = vi.spyOn(playersData, 'getPlayerByName')
      .mockRejectedValueOnce(new playersData.AmbiguousPlayerNameError('Mohamed Salah'));

    const response = await postRecommend(validBody);

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('TARGET_PLAYER_AMBIGUOUS');
    lookup.mockRestore();
  });

  it('skips run persistence only for an authenticated performance review', async () => {
    process.env.PERF_REVIEW_SECRET = 'perf-test-secret';
    const persist = vi.spyOn(recommendationRuns, 'createRecommendationRun')
      .mockResolvedValueOnce(null);

    const response = await POST(new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.60',
        'x-quickscout-perf-token': 'perf-test-secret',
      },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(200);
    expect(persist).not.toHaveBeenCalled();
  });

  it('persists a run when the performance review token does not match', async () => {
    process.env.PERF_REVIEW_SECRET = 'perf-test-secret';
    const persist = vi.spyOn(recommendationRuns, 'createRecommendationRun')
      .mockResolvedValueOnce(null);

    const response = await POST(new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.61',
        'x-quickscout-perf-token': 'wrong-secret',
      },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(200);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('returns 429 after the per-IP recommendation limit is exceeded', async () => {
    for (let index = 0; index < 20; index += 1) {
      const response = await postRecommend(validBody, '203.0.113.20');
      expect(response.status).toBe(200);
    }

    const response = await postRecommend(validBody, '203.0.113.20');
    expect(response.status).toBe(429);

    const payload = await response.json();
    expect(payload.error).toBe('Too many recommendation requests. Please try again shortly.');
    expect(payload.code).toBe('RATE_LIMITED');
  });
});
