import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifactSchema, eligibility } from './contract';
import { fixture } from './fixture';
import { loadRecruitment } from './load';

describe('recruitment decision artifact', () => {
  it('loads the fictional case and treats missing evidence as unverified', async () => {
    expect(await loadRecruitment(undefined)).toEqual(
      artifactSchema.parse(fixture),
    );
    const boundary = fixture.candidates[1];
    expect(eligibility(boundary)).toBe('Within brief');
    for (const change of [
      { age: 26 },
      { minutes: 1199 },
      { valueEur: 45000001 },
    ]) {
      expect(eligibility({ ...boundary, ...change })).toBe('Outside brief');
    }
    for (const change of [
      { valueEur: null },
      { valueEur: 0 },
      { rwEvidence: null },
      { valuationDate: null },
    ]) {
      expect(eligibility({ ...boundary, ...change })).toBe('Unverified');
    }
  });
  it('rejects duplicate identities, duplicate ranks, late valuations and missing approval', () => {
    const [a, b] = fixture.candidates;
    for (const candidates of [
      [a, a],
      [{ ...a, valueEur: null }],
      [{ ...a, age: 26 }],
      [a, { ...b, ranks: a.ranks }],
      [{ ...a, valuationDate: '2025-07-01' }],
    ]) {
      expect(artifactSchema.safeParse({ ...fixture, candidates }).success).toBe(
        false,
      );
    }
    expect(
      artifactSchema.safeParse({ ...fixture, sharingApproved: false }).success,
    ).toBe(false);
  });
  it('reads only a validated retrospective projection, with explicit demo fallback', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quickscout-view-'));
    const path = join(dir, 'case.json');
    try {
      expect(await loadRecruitment(path)).toBeNull();
      await writeFile(path, JSON.stringify(fixture));
      expect(await loadRecruitment(path)).toBeNull();
      expect(await loadRecruitment(path, true)).toEqual(fixture);
      await writeFile(
        path,
        JSON.stringify({
          ...fixture,
          mode: 'retrospective',
          privateNote: 'omit',
        }),
      );
      expect(await loadRecruitment(path)).toEqual({
        ...fixture,
        mode: 'retrospective',
      });
      await writeFile(
        path,
        JSON.stringify({ ...fixture, mode: 'retrospective', candidates: [] }),
      );
      expect((await loadRecruitment(path))?.candidates).toEqual([]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
