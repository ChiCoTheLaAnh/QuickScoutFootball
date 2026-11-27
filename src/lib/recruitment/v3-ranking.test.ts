import { describe, expect, it } from 'vitest';
import data from '../../../app/dashboard/recruitment/v3/synthetic.json';
import { preferenceScore, shortlistOrder } from './v3-ranking';

describe('dashboard ordering on every synthetic candidate', () => {
  for (const method of ['baseline_a','baseline_b','v2','advanced_similarity','v3'] as const) {
    it(method, () => {
      const expected = Object.entries(data.rows).sort(([a,x],[b,y]) =>
        x[`${method}_rank`] - y[`${method}_rank`] || a.localeCompare(b));
      expect(shortlistOrder(data.rows,method,[40,40,20])).toEqual(expected.map(([id])=>id));
    });
  }
  it('reweights and normalizes while preserving stable ties', () => {
    for (const w of [[1,0,0],[0,1,0],[0,0,1],[70,10,55]]) {
      const expected = Object.entries(data.rows).map(([id,r]) => {
        const value = (r.performance*w[0]+r.similarity*w[1]+r.feasibility*w[2])/(w[0]+w[1]+w[2]);
        expect(preferenceScore(r,w)).toBeCloseTo(value,10);
        return {id,value};
      }).sort((a,b)=>b.value-a.value||a.id.localeCompare(b.id));
      expect(shortlistOrder(data.rows,'v3',w)).toEqual(expected.map(r=>r.id));
    }
  });
});
