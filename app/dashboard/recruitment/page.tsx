import Link from 'next/link';
import { fixture } from '@/src/lib/recruitment/fixture';
import { loadStudy, releaseHash } from '@/src/lib/recruitment/wyscout';
import { DecisionBoard } from './DecisionBoard';
import StudyWorkspace from './study/StudyWorkspace';
import './recruitment.css';
import './v3/style.css';
import './study/study.css';

export const metadata = { title: 'Salah similarity study · QuickScout Football' };

export default async function Recruitment({searchParams}:{searchParams:Promise<{demo?:string}>}) {
  if ((await searchParams).demo==='1') {
    return <><Link href="/dashboard/recruitment/v3">Open synthetic V3 scouting workspace →</Link><DecisionBoard artifact={fixture}/></>;
  }
  return <StudyWorkspace data={loadStudy()} hash={releaseHash}/>;
}
