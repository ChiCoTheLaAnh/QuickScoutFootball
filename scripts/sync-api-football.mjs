import { spawnSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(rootDir, '.tmp/provider-sync');
const tscBin = resolve(rootDir, 'node_modules/typescript/bin/tsc');
const allowedLeagueIds = new Set(['39', '140', '135', '78', '61']);

function parseOptions(args) {
  let full = false;
  let leagueId;
  let quotaRuns;

  for (const arg of args) {
    if (arg === '--full') {
      if (full) throw new Error('Duplicate --full flag');
      full = true;
      continue;
    }
    if (arg.startsWith('--league=')) {
      if (leagueId) throw new Error('Only one --league target is allowed');
      leagueId = arg.slice('--league='.length);
      if (!allowedLeagueIds.has(leagueId)) throw new Error('Invalid --league Big Five ID');
      continue;
    }
    if (arg.startsWith('--quota-runs=')) {
      if (quotaRuns) throw new Error('Duplicate --quota-runs flag');
      const value = Number(arg.slice('--quota-runs='.length));
      if (value !== 1 && value !== 2) throw new Error('--quota-runs must be 1 or 2');
      quotaRuns = value;
      continue;
    }
    throw new Error(`Unknown API-Football sync flag: ${arg}`);
  }

  if (full && leagueId) throw new Error('--full and --league cannot be combined');
  if (!full && !leagueId) {
    throw new Error('Choose exactly one sync target: --league=<Big Five ID> or --full');
  }
  if (leagueId && quotaRuns !== undefined) {
    throw new Error('Canary --league sync always uses the one-run quota gate');
  }
  if (leagueId) {
    return { targetMode: 'configured', leagueIds: [leagueId], quotaRuns: 1 };
  }
  return { targetMode: 'full', quotaRuns: quotaRuns ?? 2 };
}

let syncOptions;
try {
  syncOptions = parseOptions(process.argv.slice(2));
} catch (error) {
  console.error(JSON.stringify({
    event: 'apiFootball.sync.invalid_options',
    error: error instanceof Error ? error.message : 'Invalid API-Football sync options',
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
  'src/lib/provider/apiFootballSync.ts',
  'src/lib/supabase/providerSyncRuns.ts',
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
const {
  createApiFootballManualTargetKey,
  runManualProviderSync,
} = require(resolve(outDir, 'src/lib/supabase/providerSyncRuns.js'));

try {
  const targetKey = createApiFootballManualTargetKey(syncOptions.leagueIds);
  const result = await runManualProviderSync(
    targetKey,
    () => syncApiFootballPlayers(syncOptions),
  );
  console.log(JSON.stringify({
    event: 'apiFootball.sync.completed',
    invocationKey: result.invocationKey,
    targetKey: result.targetKey,
    ...result.summary,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    event: 'apiFootball.sync.failed',
    error: error instanceof Error ? error.message : 'Unknown API-Football sync failure',
  }, null, 2));
  process.exitCode = 1;
}
