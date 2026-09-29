import { afterAll, describe, expect, it } from 'vitest';

import { GET } from './route';

const saved = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

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

describe('GET /api/analytics/metrics', () => {
  it('identifies seed-only data as unverified', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'seed', latestAccepted: null });
  });

  it('does not expose the ledger without a server service key', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'unavailable', latestAccepted: null });
  });
});
