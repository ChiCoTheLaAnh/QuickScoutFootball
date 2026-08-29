import { describe, expect, it } from 'vitest';

import {
  assertSafeSecretTransport,
  assertTargetIdentity,
  checksumStableRows,
  checksumMatchesExpected,
  normalizeExpectedChecksum,
  selectActiveAuditScope,
  selectUniqueTarget,
} from './acceptance-helpers.mjs';

const salahResults = [
  {
    fullName: 'Mohamed Salah',
    providerSource: 'seed',
    providerPlayerId: 'seed-salah',
  },
  {
    fullName: 'Mohamed Salah',
    providerSource: 'apiFootball',
    providerPlayerId: '306',
  },
  {
    fullName: 'Mohamed Salah',
    providerSource: 'apiFootball',
    providerPlayerId: '999',
  },
];

describe('performance review identity selection', () => {
  it('requires a unique provider identity and supports an explicit provider player ID', () => {
    expect(() => selectUniqueTarget(salahResults, {
      targetName: 'Mohamed Salah',
      targetProviderSource: 'apiFootball',
    })).toThrow(/ambiguous/i);

    const target = selectUniqueTarget(salahResults, {
      targetName: 'Mohamed Salah',
      targetProviderSource: 'apiFootball',
      targetProviderPlayerId: '306',
    });

    expect(target.targetPlayerIdentity).toEqual({
      providerSource: 'apiFootball',
      providerPlayerId: '306',
    });
  });

  it('requires provider source when an explicit provider player ID is configured', () => {
    expect(() => selectUniqueTarget(salahResults, {
      targetName: 'Mohamed Salah',
      targetProviderPlayerId: '306',
    })).toThrow(/provider_source/i);
  });

  it('detects a response target identity mismatch', () => {
    expect(() => assertTargetIdentity(
      { provider: 'apiFootball', providerPlayerId: '999' },
      { providerSource: 'apiFootball', providerPlayerId: '306' },
    )).toThrow(/identity mismatch/i);
  });

  it('uses the canonical seed ID when the response has no provider player ID', () => {
    expect(() => assertTargetIdentity(
      { id: 'seed-salah', provider: 'seed' },
      { providerSource: 'seed', providerPlayerId: 'seed-salah' },
    )).not.toThrow();
  });
});

describe('acceptance safety helpers', () => {
  it('rejects sending the performance secret over remote plaintext HTTP', () => {
    expect(() => assertSafeSecretTransport('http://staging.example.com', 'secret'))
      .toThrow(/requires HTTPS/i);
    expect(() => assertSafeSecretTransport('http://localhost:3000', 'secret')).not.toThrow();
    expect(() => assertSafeSecretTransport('https://staging.example.com', 'secret')).not.toThrow();
  });

  it('normalizes and compares an optional expected checksum', () => {
    const checksum = 'a'.repeat(64);
    expect(normalizeExpectedChecksum(checksum.toUpperCase())).toBe(checksum);
    expect(checksumMatchesExpected(checksum, checksum)).toBe(true);
    expect(checksumMatchesExpected(checksum, 'b'.repeat(64))).toBe(false);
    expect(checksumMatchesExpected(checksum, null)).toBe(true);
    expect(() => normalizeExpectedChecksum('not-a-checksum')).toThrow(/SHA-256/i);
  });

  it('keeps checksums order-independent and detects a content mutation', () => {
    const players = [{ identity: 'apiFootball:1', team: 'A' }, { identity: 'apiFootball:2', team: 'B' }];
    const facts = [{ identity: 'apiFootball:1', minutes: 900 }, { identity: 'apiFootball:2', minutes: 1_000 }];
    const baseline = checksumStableRows(players, facts);

    expect(checksumStableRows([...players].reverse(), [...facts].reverse())).toBe(baseline);
    expect(checksumStableRows(players, [{ ...facts[0], minutes: 901 }, facts[1]])).not.toBe(baseline);
  });

  it('excludes inactive players and their facts from active acceptance counts', () => {
    const scope = selectActiveAuditScope(
      [{ id: 'active', is_active: true }, { id: 'inactive', is_active: false }],
      [{ player_id: 'active' }, { player_id: 'inactive' }],
    );

    expect(scope.activePlayers).toHaveLength(1);
    expect(scope.activeFacts).toEqual([{ player_id: 'active' }]);
  });
});
