import { spawnSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(rootDir, '.tmp/provider-probe');
const tscBin = resolve(rootDir, 'node_modules/typescript/bin/tsc');

if (process.argv.length > 2) {
  console.error(JSON.stringify({
    event: 'apiFootball.probe.invalid_options',
    error: 'API-Football probe does not accept command-line flags',
  }, null, 2));
  process.exit(1);
}

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
  'src/lib/provider/apiFootball.ts',
], {
  cwd: rootDir,
  stdio: 'inherit',
});

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const require = createRequire(import.meta.url);
const { probeApiFootballPlayerCoverage } = require(resolve(
  outDir,
  'src/lib/provider/apiFootball.js',
));

try {
  const summary = await probeApiFootballPlayerCoverage();
  console.log(JSON.stringify({
    event: 'apiFootball.probe.completed',
    ...summary,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    event: 'apiFootball.probe.failed',
    error: error instanceof Error ? error.message : 'Unknown API-Football probe failure',
  }, null, 2));
  process.exitCode = 1;
}
