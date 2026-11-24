import Link from 'next/link';
import { loadRecruitment } from '@/src/lib/recruitment/load';
import { DecisionBoard } from './DecisionBoard';
import './recruitment.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recruitment brief · QuickScout Football' };

export default async function Recruitment({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const artifact = await loadRecruitment(
    process.env.QUICKSCOUT_RECRUITMENT_ARTIFACT,
    (await searchParams).demo === '1',
  );
  if (!artifact)
    return (
      <main className="recruit">
        <h1>Recruitment data unavailable</h1>
        <p>The configured artifact could not be loaded or validated.</p>
        <Link href="?demo=1">Open the synthetic demo</Link>
      </main>
    );
  return <DecisionBoard artifact={artifact} />;
}
