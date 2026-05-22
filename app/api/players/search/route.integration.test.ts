import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetRateLimits } from '@/src/lib/rateLimit';
import { GET } from './route';

const savedEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  logLevel: process.env.LOG_LEVEL,
};

beforeAll(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.LOG_LEVEL = 'silent';
});

afterAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedEnv.anon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.service;
  process.env.LOG_LEVEL = savedEnv.logLevel;
});

beforeEach(() => {
  resetRateLimits();
});

describe('GET /api/players/search (seed mode)', () => {
  it('returns empty results for blank query', async () => {
    const response = await GET(new Request('http://localhost/api/players/search?q='));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.results).toEqual([]);
  });

  it('returns matches for salah', async () => {
    const response = await GET(new Request('http://localhost/api/players/search?q=salah'));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.results[0].fullName).toContain('Salah');
  });

  it('returns 429 after the per-IP search limit is exceeded', async () => {
    for (let index = 0; index < 60; index += 1) {
      const response = await GET(new Request('http://localhost/api/players/search?q=salah', {
        headers: { 'x-forwarded-for': '203.0.113.30' },
      }));
      expect(response.status).toBe(200);
    }

    const response = await GET(new Request('http://localhost/api/players/search?q=salah', {
      headers: { 'x-forwarded-for': '203.0.113.30' },
    }));
    expect(response.status).toBe(429);

    const payload = await response.json();
    expect(payload.error).toBe('Too many player search requests. Please try again shortly.');
    expect(payload.code).toBe('RATE_LIMITED');
  });

  it('does not rate limit blank search queries', async () => {
    for (let index = 0; index < 65; index += 1) {
      const response = await GET(new Request('http://localhost/api/players/search?q=', {
        headers: { 'x-forwarded-for': '203.0.113.40' },
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ results: [] });
    }
  });
});
