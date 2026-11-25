import Link from 'next/link';
import { fixture } from '@/src/lib/recruitment/fixture';
import { DecisionBoard } from './DecisionBoard';
import './recruitment.css';

export const metadata = { title: 'Recruitment brief · QuickScout Football' };

export default function Recruitment() {
  return <><div className="mx-auto max-w-6xl p-4"><Link href="/dashboard/recruitment/v3">Open synthetic V3 scouting workspace →</Link></div><DecisionBoard artifact={fixture} /></>;
}
