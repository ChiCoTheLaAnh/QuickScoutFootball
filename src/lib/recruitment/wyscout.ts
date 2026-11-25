import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const releaseHash = '08859017c024dd07261808506f801d704e63810b6d92bc7ba677cde5ea30a254';
const metric = z.enum(['npg90','np_shots90','sot90','key_passes90','progressive90','completion_pct','interceptions90']);
const method = z.enum(['category','attack','euclidean','cosine','npg','pca']);
const values = z.record(metric,z.number().nullable());
const agreement = z.object({
  common:z.number(),spearman:z.number(),kendall:z.number(),shared5:z.number(),shared10:z.number(),shared20:z.number(),
  common_shared5:z.number(),common_shared10:z.number(),common_shared20:z.number(),candidates:z.number().optional(),
});
const profile = z.strictObject({
  id:z.number(),name:z.string(),clubs:z.array(z.object({id:z.number(),name:z.string(),league:z.string()})).min(1),
  minutes:z.number(),starts:z.number(),wideActions:z.number(),attackingHalfActions:z.number(),wideShare:z.number(),
  values,percentiles:values,ranks:z.record(method,z.number().int()).nullable(),scores:z.record(method,z.number()).nullable(),
  squaredContributions:z.record(metric,z.number().nonnegative()).nullable(),videoQuestion:z.string().optional(),
});
const schema = z.strictObject({
  schemaVersion:z.literal(1),study:z.string(),season:z.literal('2017/18'),targetId:z.literal(120353),
  referenceSize:z.literal(152),candidateCount:z.literal(150),competitionFixtures:z.record(z.string(),z.number()),
  methods:z.record(method,z.string()),eligibility:z.string(),preprocessing:z.string(),percentile:z.string(),
  metrics:z.array(z.object({key:metric,label:z.string(),unit:z.string(),dimension:z.string(),n:z.number()})).length(7),
  limitations:z.array(z.string()),profiles:z.array(profile).length(152),benchmark:z.record(z.string(),agreement),
  robustness:z.record(z.string(),agreement),attribution:z.object({
    collector:z.literal('Wyscout'),paper:z.string(),doi:z.string(),license:z.literal('CC BY 4.0'),
    licenseUrl:z.literal('https://creativecommons.org/licenses/by/4.0/'),changes:z.string(),
    sources:z.array(z.object({item:z.string(),authors:z.array(z.string()).min(1),version:z.number(),
      url:z.url().startsWith('https://figshare.com/'),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).length(7),
  }),
});
export type Study = z.infer<typeof schema>;
export type Player = Study['profiles'][number];
export type Agreement = z.infer<typeof agreement>;
export function verifyStudy(bytes:Buffer):Study {
  if(createHash('sha256').update(bytes).digest('hex')!==releaseHash) throw Error('Unapproved Wyscout release');
  const study=schema.parse(JSON.parse(bytes.toString('utf8')));
  const sterling=study.profiles.find(p=>p.name==='R. Sterling');
  if(study.profiles.filter(p=>p.ranks).length!==150 || sterling?.values.npg90!==null ||
     sterling.ranks!==null || study.profiles.find(p=>p.id===study.targetId)?.ranks!==null ||
     Object.keys(study.robustness).length!==27) throw Error('Incomplete study');
  return study;
}
export function loadStudy(){
  return verifyStudy(readFileSync(join(process.cwd(),'research/wyscout2017/release/wyscout-salah-2017-18.v1.json')));
}
