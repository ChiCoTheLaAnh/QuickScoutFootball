import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  claimProviderSyncRun,
  finalizeProviderSyncRun,
} from './providerSyncRuns';

const hasHostedSupabase = Boolean(
  process.env.RUN_SUPABASE_INTEGRATION_TESTS === '1'
  && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
);

describe.skipIf(!hasHostedSupabase)('hosted provider sync run claims', () => {
  it('atomically allows only one of two concurrent claims for the same invocation key', async () => {
    const invocationKey = `integration:providerSyncRuns:${randomUUID()}`;
    const targetKey = 'integration:apiFootball:2024:39';
    const utcDate = new Date().toISOString().slice(0, 10);
    const inputs = [randomUUID(), randomUUID()].map((lockToken) => ({
      invocationKey,
      runKind: 'manual' as const,
      targetKey,
      utcDate,
      lockToken,
    }));

    const results = await Promise.all(inputs.map((input) => claimProviderSyncRun(input)));
    const claimedResults = results.filter((result) => result.claimed);

    await Promise.all(claimedResults.map((result) => finalizeProviderSyncRun({
      invocationKey,
      lockToken: result.run.lockToken,
      status: 'completed',
      summary: { integrationTest: true },
    })));

    expect(claimedResults).toHaveLength(1);
    expect(results[0].run.id).toBe(results[1].run.id);
    expect(results.map((result) => result.claimed).sort()).toEqual([false, true]);

    const duplicate = await claimProviderSyncRun({
      ...inputs[0],
      lockToken: randomUUID(),
    });
    expect(duplicate).toMatchObject({
      claimed: false,
      run: {
        invocationKey,
        status: 'completed',
      },
    });
  });
});
