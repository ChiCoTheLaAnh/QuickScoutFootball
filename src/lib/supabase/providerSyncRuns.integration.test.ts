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
  it('atomically locks a provider-season scope and releases it after finalize', async () => {
    const lockScope = `integration:apiFootball:2024:${randomUUID()}`;
    const utcDate = new Date().toISOString().slice(0, 10);
    const inputs = ['39', '140'].map((leagueId) => ({
      invocationKey: `integration:providerSyncRuns:${randomUUID()}`,
      runKind: 'manual' as const,
      targetKey: `apiFootball:2024:${leagueId}`,
      lockScope,
      utcDate,
      lockToken: randomUUID(),
    }));

    const results = await Promise.all(inputs.map((input) => claimProviderSyncRun(input)));
    const claimedResults = results.filter((result) => result.claimed);

    await Promise.all(claimedResults.map((result) => finalizeProviderSyncRun({
      invocationKey: result.run.invocationKey,
      lockToken: result.run.lockToken,
      status: 'completed',
      summary: { integrationTest: true },
    })));

    expect(claimedResults).toHaveLength(1);
    expect(results[0].run.id).toBe(results[1].run.id);
    expect(results.map((result) => result.claimed).sort()).toEqual([false, true]);

    const afterFinalize = await claimProviderSyncRun({
      invocationKey: `integration:providerSyncRuns:${randomUUID()}`,
      runKind: 'manual',
      targetKey: 'apiFootball:2024:135',
      lockScope,
      utcDate,
      lockToken: randomUUID(),
    });
    expect(afterFinalize.claimed).toBe(true);
    await expect(finalizeProviderSyncRun({
      invocationKey: afterFinalize.run.invocationKey,
      lockToken: afterFinalize.run.lockToken,
      status: 'completed',
      summary: { integrationTest: true, afterFinalize: true },
    })).resolves.toBe(true);
  });
});
