import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {loadStudy,verifyStudy} from './wyscout';

describe('public Wyscout release',()=>{
  it('preserves every approved property and rejects modified bytes',()=>{
    const bytes=readFileSync('research/wyscout2017/release/wyscout-salah-2017-18.v1.json');
    expect(loadStudy()).toEqual(JSON.parse(bytes.toString()));
    expect(()=>verifyStudy(Buffer.concat([bytes,Buffer.from(' ')]))).toThrow('Unapproved');
  });
  it('keeps the target and incomplete profile distinct',()=>{
    const d=loadStudy();
    expect(d.profiles.filter(p=>!p.ranks).map(p=>p.name).sort()).toEqual(['Mohamed Salah','R. Sterling']);
    expect(d.profiles.find(p=>p.name==='R. Sterling')?.percentiles.npg90).toBeNull();
  });
});
