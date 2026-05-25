import { spawnSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(rootDir, '.tmp/provider-sync');
const tscBin = resolve(rootDir, 'node_modules/typescript/bin/tsc');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const compile = spawnSync(process.execPath, [
  tscBin,
  '--target',
  'ES2022',
  '--module',
  'commonjs',
  '--moduleResolution',
  'node',
  '--esModuleInterop',
  '--skipLibCheck',
  '--strict',
  '--noEmit',
  'false',
  '--outDir',
  outDir,
  '--rootDir',
  rootDir,
  'src/lib/provider/apiFootballSync.ts',
], {
  cwd: rootDir,
  stdio: 'inherit',
});

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const require = createRequire(import.meta.url);
const { syncApiFootballPlayers } = require(resolve(
  outDir,
  'src/lib/provider/apiFootballSync.js',
));

try {
  const summary = await syncApiFootballPlayers();
  console.log(JSON.stringify({
    event: 'apiFootball.sync.completed',
    ...summary,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    event: 'apiFootball.sync.failed',
    error: error instanceof Error ? error.message : 'Unknown API-Football sync failure',
  }, null, 2));
  process.exitCode = 1;
}
