import { readFile } from 'node:fs/promises';
import { artifactSchema } from './contract';
import { fixture } from './fixture';

export async function loadRecruitment(path: string | undefined, demo = false) {
  if (!path || demo) return fixture;
  try {
    const artifact = artifactSchema.parse(
      JSON.parse(await readFile(path, 'utf8')),
    );
    return artifact.mode === 'retrospective' ? artifact : null;
  } catch {
    return null;
  }
}
