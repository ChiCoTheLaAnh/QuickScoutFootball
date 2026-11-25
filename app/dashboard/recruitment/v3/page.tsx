import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Workspace from './Workspace';

export const dynamic = 'force-static';

export default async function RecruitmentWorkspace() {
  // Parse the bundled fixture directly so near-tied scores retain their IEEE-754 precision.
  const file = join(process.cwd(), 'app/dashboard/recruitment/v3/synthetic.json');
  const data = JSON.parse(await readFile(file, 'utf8')) as typeof import('./synthetic.json');
  return <Workspace data={data} />;
}
