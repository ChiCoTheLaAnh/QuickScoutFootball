import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET } from './route';

const savedEnv = {
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
  process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedEnv.anon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.service;
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
});
