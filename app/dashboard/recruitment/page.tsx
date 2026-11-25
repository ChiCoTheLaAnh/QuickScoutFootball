import Link from 'next/link';
import { loadRecruitment } from '@/src/lib/recruitment/load';
import { DecisionBoard } from './DecisionBoard';
import './recruitment.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recruitment brief · QuickScout Football' };

export default async function Recruitment() {
  const artifact = await loadRecruitment(undefined, true);
  if (!artifact) throw new Error('Synthetic recruitment fixture unavailable');
  return <><div className="mx-auto max-w-6xl p-4"><Link href="/dashboard/recruitment/v3">Open synthetic V3 scouting workspace →</Link></div><DecisionBoard artifact={artifact} /></>;
}
