import {
  createSlug,
  normalizeText,
  toOptionalNumber,
  toOptionalString,
} from '../normalize';
import type { Player, PlayerStats, ProviderPlayerRaw } from '../types';
import {
  API_FOOTBALL_PROVIDER,
  type ProviderPlayerRecord,
  type ProviderSeasonStats,
} from './types';

export const API_FOOTBALL_BIG_FIVE_LEAGUE_IDS = ['39', '140', '135', '78', '61'] as const;
export const API_FOOTBALL_TARGET_SEASON = '2024';
export const API_FOOTBALL_HARD_PAGE_CAP = 60;

const API_FOOTBALL_HOST = 'v3.football.api-sports.io';
const API_FOOTBALL_PATH = '/players';
export const API_FOOTBALL_MIN_REQUEST_START_INTERVAL_MS = 6_200;
const MAX_REQUEST_RETRIES = 3;

export type ApiFootballLeagueId = typeof API_FOOTBALL_BIG_FIVE_LEAGUE_IDS[number];
export type ApiFootballTargetMode = 'configured' | 'full';

export interface ApiFootballFetchOptions {
  targetMode?: ApiFootballTargetMode;
  leagueIds?: readonly ApiFootballLeagueId[];
  quotaRuns?: 1 | 2;
  maxPagesPerTarget?: number;
  pacingMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
  deadlineAtMs?: number;
}

export interface ApiFootballQuotaSnapshot {
  dailyLimit?: number;
  dailyRemaining?: number;
  minuteLimit?: number;
  minuteRemaining?: number;
}

export interface ApiFootballQuotaGate {
  runs: 1 | 2;
  bufferMultiplier: 1.2;
  requestsPerRun: number;
  requiredRequests: number;
  remainingRequests?: number;
  probeRequests: number;
  effectiveRemainingRequests?: number;
  allowed: boolean | null;
  shortfall: number | null;
}

export interface ApiFootballTargetCoverage {
  leagueId: ApiFootballLeagueId;
  season: typeof API_FOOTBALL_TARGET_SEASON;
  pagesFetched: number;
  totalPages: number;
  rowsFetched: number;
  playersWithoutTargetStats: number;
  skippedNoTargetStats: number;
  skippedInvalidIdentity: number;
  matchedFacts: number;
  matchedStatisticBlocks: number;
  filteredStatisticBlocks: number;
  truncated: false;
}

export interface ApiFootballFetchResult {
  players: ProviderPlayerRaw[];
  targetsFetched: number;
  pagesFetched: number;
  pagesExpected: number;
  requestsMade: number;
  retries: number;
  quotaResponsesWithMissingHeaders: number;
  quotaLedgerEstimatedResponses: number;
  durationMs: number;
  rowsFetched: number;
  playersWithoutTargetStats: number;
  skippedNoTargetStats: number;
  skippedInvalidIdentity: number;
  matchedFacts: number;
  matchedStatisticBlocks: number;
  filteredStatisticBlocks: number;
  truncated: false;
  targetCoverage: ApiFootballTargetCoverage[];
  quotaBefore: ApiFootballQuotaSnapshot;
  quotaAfter: ApiFootballQuotaSnapshot;
  quota: ApiFootballQuotaSnapshot;
  quotaGates: {
    oneRun: ApiFootballQuotaGate;
    twoRuns: ApiFootballQuotaGate;
  };
}

export interface ApiFootballProbeResult {
  providerSource: typeof API_FOOTBALL_PROVIDER;
  season: typeof API_FOOTBALL_TARGET_SEASON;
  leagueIds: ApiFootballLeagueId[];
  targetsProbed: number;
  pagesRequired: number;
  requestsMade: number;
  retries: number;
  quotaResponsesWithMissingHeaders: number;
  quotaLedgerEstimatedResponses: number;
  durationMs: number;
  skippedNoTargetStats: number;
  skippedInvalidIdentity: number;
  matchedFacts: number;
  targetCoverage: ApiFootballTargetCoverage[];
  quotaBefore: ApiFootballQuotaSnapshot;
  quotaAfter: ApiFootballQuotaSnapshot;
  quota: ApiFootballQuotaSnapshot;
  quotaGates: {
    oneRun: ApiFootballQuotaGate;
    twoRuns: ApiFootballQuotaGate;
  };
}

type ApiFootballTarget = {
  leagueId: ApiFootballLeagueId;
  season: typeof API_FOOTBALL_TARGET_SEASON;
  url: string;
};

type ApiFootballPageResult = {
  players: ProviderPlayerRaw[];
  currentPage: number;
  totalPages: number;
  rowsFetched: number;
  playersWithoutTargetStats: number;
  skippedInvalidIdentity: number;
  matchedFacts: number;
  matchedStatisticBlocks: number;
  filteredStatisticBlocks: number;
  payload: unknown;
};

type RequestState = {
  configuredPacingMs: number;
  wait: (milliseconds: number) => Promise<void>;
  lastRequestStartedAt: number | null;
  deadlineAtMs?: number;
  quotaBefore: ApiFootballQuotaSnapshot | null;
  quota: ApiFootballQuotaSnapshot;
  requestsMade: number;
  retries: number;
  quotaResponsesWithMissingHeaders: number;
  quotaLedgerEstimatedResponses: number;
  minuteExhaustedFromHeader: boolean;
};

type AggregatedStatisticFacts = {
  facts: ProviderSeasonStats[];
  primaryBlock?: Record<string, unknown>;
  teamBlockCount: number;
};

export async function fetchApiFootballPlayers(
  options: ApiFootballFetchOptions = {},
): Promise<ProviderPlayerRaw[]> {
  return (await fetchApiFootballPlayerCoverage(options)).players;
}

export async function fetchApiFootballPlayerCoverage(
  options: ApiFootballFetchOptions = {},
): Promise<ApiFootballFetchResult> {
  const startedAt = Date.now();
  const targets = resolveApiFootballTargets(options);
  const maxPagesPerTarget = resolveMaxPagesPerTarget(options.maxPagesPerTarget);
  const requestState = createRequestState(options);
  const playersByKey = new Map<string, ProviderPlayerRaw>();
  const targetCoverage: ApiFootballTargetCoverage[] = [];
  const probedTargets: Array<{
    target: ApiFootballTarget;
    firstPage: ApiFootballPageResult;
    coverage: ApiFootballTargetCoverage;
  }> = [];

  for (const target of targets) {
    const firstPage = await fetchApiFootballPlayersPage(target, 1, requestState);
    assertPageWithinCap(target, firstPage.totalPages, maxPagesPerTarget);
    const coverage: ApiFootballTargetCoverage = {
      leagueId: target.leagueId,
      season: target.season,
      pagesFetched: 1,
      totalPages: firstPage.totalPages,
      rowsFetched: firstPage.rowsFetched,
      playersWithoutTargetStats: firstPage.playersWithoutTargetStats,
      skippedNoTargetStats: firstPage.playersWithoutTargetStats,
      skippedInvalidIdentity: firstPage.skippedInvalidIdentity,
      matchedFacts: firstPage.matchedFacts,
      matchedStatisticBlocks: firstPage.matchedStatisticBlocks,
      filteredStatisticBlocks: firstPage.filteredStatisticBlocks,
      truncated: false,
    };
    probedTargets.push({ target, firstPage, coverage });
    targetCoverage.push(coverage);
  }

  const pagesExpected = targetCoverage.reduce((sum, target) => sum + target.totalPages, 0);
  assertCompleteQuotaHeaders(requestState.quota);
  const probeQuotaGates = buildQuotaGates(requestState.quota, pagesExpected, requestState.requestsMade);
  const quotaRuns = resolveQuotaRuns(options.quotaRuns);
  const selectedGate = quotaRuns === 2 ? probeQuotaGates.twoRuns : probeQuotaGates.oneRun;
  if (selectedGate.allowed !== true) {
    throw new Error(
      `API-Football quota gate blocked ${quotaRuns} run(s): requires ${selectedGate.requiredRequests}, remaining ${selectedGate.remainingRequests ?? 'unknown'} after ${selectedGate.probeRequests} probe(s)`,
    );
  }

  for (const { target, firstPage, coverage } of probedTargets) {
    mergePagePlayers(playersByKey, firstPage.players);
    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const requestsNeededToFinishTarget = firstPage.totalPages - page + 1;
      assertRemainingDailyQuota(requestState.quota, requestsNeededToFinishTarget, target);
      const pageResult = await fetchApiFootballPlayersPage(
        target,
        page,
        requestState,
        requestsNeededToFinishTarget,
      );
      if (pageResult.totalPages !== firstPage.totalPages) {
        throw new Error(
          `API-Football paging total changed for league ${target.leagueId}: ${firstPage.totalPages} to ${pageResult.totalPages}`,
        );
      }
      mergePagePlayers(playersByKey, pageResult.players);
      coverage.pagesFetched += 1;
      coverage.rowsFetched += pageResult.rowsFetched;
      coverage.playersWithoutTargetStats += pageResult.playersWithoutTargetStats;
      coverage.skippedNoTargetStats += pageResult.playersWithoutTargetStats;
      coverage.skippedInvalidIdentity += pageResult.skippedInvalidIdentity;
      coverage.matchedFacts += pageResult.matchedFacts;
      coverage.matchedStatisticBlocks += pageResult.matchedStatisticBlocks;
      coverage.filteredStatisticBlocks += pageResult.filteredStatisticBlocks;
      assertRemainingDailyQuota(requestState.quota, firstPage.totalPages - page, target);
    }
  }

  const pagesFetched = targetCoverage.reduce((sum, target) => sum + target.pagesFetched, 0);
  const rowsFetched = targetCoverage.reduce((sum, target) => sum + target.rowsFetched, 0);
  const playersWithoutTargetStats = targetCoverage.reduce(
    (sum, target) => sum + target.playersWithoutTargetStats,
    0,
  );
  const matchedFacts = targetCoverage.reduce((sum, target) => sum + target.matchedFacts, 0);
  const skippedInvalidIdentity = targetCoverage.reduce(
    (sum, target) => sum + target.skippedInvalidIdentity,
    0,
  );
  const matchedStatisticBlocks = targetCoverage.reduce(
    (sum, target) => sum + target.matchedStatisticBlocks,
    0,
  );
  const filteredStatisticBlocks = targetCoverage.reduce(
    (sum, target) => sum + target.filteredStatisticBlocks,
    0,
  );
  return {
    players: [...playersByKey.values()],
    targetsFetched: targets.length,
    pagesFetched,
    pagesExpected,
    requestsMade: requestState.requestsMade,
    retries: requestState.retries,
    quotaResponsesWithMissingHeaders: requestState.quotaResponsesWithMissingHeaders,
    quotaLedgerEstimatedResponses: requestState.quotaLedgerEstimatedResponses,
    durationMs: Math.max(0, Date.now() - startedAt),
    rowsFetched,
    playersWithoutTargetStats,
    skippedNoTargetStats: playersWithoutTargetStats,
    skippedInvalidIdentity,
    matchedFacts,
    matchedStatisticBlocks,
    filteredStatisticBlocks,
    truncated: false,
    targetCoverage,
    quotaBefore: requireQuotaBefore(requestState),
    quotaAfter: { ...requestState.quota },
    quota: requestState.quota,
    quotaGates: probeQuotaGates,
  };
}

export async function probeApiFootballPlayerCoverage(
  options: Omit<ApiFootballFetchOptions, 'targetMode' | 'leagueIds'> = {},
): Promise<ApiFootballProbeResult> {
  const startedAt = Date.now();
  const targets = resolveApiFootballTargets({ ...options, targetMode: 'full' });
  const maxPagesPerTarget = resolveMaxPagesPerTarget(options.maxPagesPerTarget);
  const requestState = createRequestState(options);
  const targetCoverage: ApiFootballTargetCoverage[] = [];

  for (const target of targets) {
    const page = await fetchApiFootballPlayersPage(target, 1, requestState);
    assertPageWithinCap(target, page.totalPages, maxPagesPerTarget);
    targetCoverage.push({
      leagueId: target.leagueId,
      season: target.season,
      pagesFetched: 1,
      totalPages: page.totalPages,
      rowsFetched: page.rowsFetched,
      playersWithoutTargetStats: page.playersWithoutTargetStats,
      skippedNoTargetStats: page.playersWithoutTargetStats,
      skippedInvalidIdentity: page.skippedInvalidIdentity,
      matchedFacts: page.matchedFacts,
      matchedStatisticBlocks: page.matchedStatisticBlocks,
      filteredStatisticBlocks: page.filteredStatisticBlocks,
      truncated: false,
    });
  }

  const pagesRequired = targetCoverage.reduce((sum, target) => sum + target.totalPages, 0);
  const skippedNoTargetStats = targetCoverage.reduce(
    (sum, target) => sum + target.skippedNoTargetStats,
    0,
  );
  const matchedFacts = targetCoverage.reduce((sum, target) => sum + target.matchedFacts, 0);
  const skippedInvalidIdentity = targetCoverage.reduce(
    (sum, target) => sum + target.skippedInvalidIdentity,
    0,
  );
  assertCompleteQuotaHeaders(requestState.quota);
  return {
    providerSource: API_FOOTBALL_PROVIDER,
    season: API_FOOTBALL_TARGET_SEASON,
    leagueIds: targets.map((target) => target.leagueId),
    targetsProbed: targets.length,
    pagesRequired,
    requestsMade: requestState.requestsMade,
    retries: requestState.retries,
    durationMs: Math.max(0, Date.now() - startedAt),
    skippedNoTargetStats,
    skippedInvalidIdentity,
    matchedFacts,
    targetCoverage,
    quotaBefore: requireQuotaBefore(requestState),
    quotaAfter: { ...requestState.quota },
    quota: requestState.quota,
    quotaGates: buildQuotaGates(requestState.quota, pagesRequired, requestState.requestsMade),
    quotaResponsesWithMissingHeaders: requestState.quotaResponsesWithMissingHeaders,
    quotaLedgerEstimatedResponses: requestState.quotaLedgerEstimatedResponses,
  };
}

export function getApiFootballOneRunQuotaGate(
  quota: ApiFootballQuotaSnapshot,
  requestsPerRun: number,
  probeRequests = 0,
): ApiFootballQuotaGate {
  return buildQuotaGate(quota, requestsPerRun, 1, probeRequests);
}

export function getApiFootballTwoRunQuotaGate(
  quota: ApiFootballQuotaSnapshot,
  requestsPerRun: number,
  probeRequests = 0,
): ApiFootballQuotaGate {
  return buildQuotaGate(quota, requestsPerRun, 2, probeRequests);
}

export function transformApiFootballPlayer(raw: ProviderPlayerRaw): Player | null {
  return transformApiFootballPlayerRecord(raw)?.player ?? null;
}

export function transformApiFootballPlayerRecord(raw: ProviderPlayerRaw): ProviderPlayerRecord | null {
  if (raw.provider !== API_FOOTBALL_PROVIDER) return null;

  const payload = toRecord(raw.payload);
  if (!payload) return null;

  const playerPayload = toRecord(payload.player);
  if (!playerPayload) return null;
  const fullName = toOptionalString(playerPayload.name)
    ?? [toOptionalString(playerPayload.firstname), toOptionalString(playerPayload.lastname)]
      .filter(Boolean)
      .join(' ');

  if (!fullName) return null;

  const providerPlayerId = toOptionalString(playerPayload.id);
  if (!providerPlayerId) return null;
  const aggregated = aggregateStatisticFacts(recordArray(payload.statistics));
  if (aggregated.facts.length === 0) return null;
  const primaryBlock = aggregated.primaryBlock;
  const primaryGames = toRecord(primaryBlock?.games);
  const primaryTeam = toRecord(primaryBlock?.team);
  const primaryLeague = toRecord(primaryBlock?.league);
  const primaryFact = aggregated.facts.find(
    (fact) => fact.competitionProviderId === toOptionalString(primaryLeague?.id),
  ) ?? aggregated.facts[0];

  const player: Player = {
    id: providerPlayerId,
    provider: API_FOOTBALL_PROVIDER,
    providerPlayerId,
    fullName,
    age: toOptionalNumber(playerPayload.age),
    nationality: toOptionalString(playerPayload.nationality),
    team: toOptionalString(primaryTeam?.name),
    position: toOptionalString(primaryGames?.position),
    marketValueEur: toOptionalNumber(
      playerPayload.marketValueEur
        ?? playerPayload.market_value_eur
        ?? playerPayload.marketValue
        ?? playerPayload.market_value,
    ),
    stats: mapPlayerStats(primaryFact),
  };

  return {
    player,
    providerSource: API_FOOTBALL_PROVIDER,
    providerPlayerId,
    normalizedName: normalizeText(fullName),
    slug: createSlug(`api-football-${providerPlayerId}`),
    teamProviderId: toOptionalString(primaryTeam?.id),
    leagueName: primaryFact?.competition,
    leagueProviderId: primaryFact?.competitionProviderId,
    seasonStats: aggregated.facts,
    metadata: {
      provider: API_FOOTBALL_PROVIDER,
      sourceId: raw.sourceId,
      seasonFactCount: aggregated.facts.length,
      teamBlockCount: aggregated.teamBlockCount,
    },
  };
}

function resolveApiFootballTargets(options: ApiFootballFetchOptions): ApiFootballTarget[] {
  const configuredUrls = [
    ...splitConfiguredUrls(process.env.API_FOOTBALL_PLAYERS_URL),
    ...splitConfiguredUrls(process.env.API_FOOTBALL_PLAYERS_URLS),
  ];
  if (configuredUrls.length === 0) {
    throw new Error('API_FOOTBALL_PLAYERS_URL or API_FOOTBALL_PLAYERS_URLS is required for API-Football sync');
  }

  const targets = configuredUrls.map(parseApiFootballTarget);
  const targetsByLeague = new Map<ApiFootballLeagueId, ApiFootballTarget>();
  for (const target of targets) {
    if (targetsByLeague.has(target.leagueId)) {
      throw new Error(`Duplicate API-Football target configured for league ${target.leagueId}`);
    }
    targetsByLeague.set(target.leagueId, target);
  }

  const selectedLeagueIds = options.leagueIds
    ? validateCanaryLeagueIds(options.leagueIds)
    : API_FOOTBALL_BIG_FIVE_LEAGUE_IDS.filter((leagueId) => targetsByLeague.has(leagueId));

  const selectedTargets = selectedLeagueIds.map((leagueId) => {
    const target = targetsByLeague.get(leagueId);
    if (!target) {
      throw new Error(`API-Football canary league ${leagueId} is not configured`);
    }
    return target;
  });

  if (selectedTargets.length === 0) {
    throw new Error('At least one validated API-Football Big Five target is required');
  }

  if ((options.targetMode ?? 'configured') === 'full') {
    const missing = API_FOOTBALL_BIG_FIVE_LEAGUE_IDS.filter((leagueId) => !targetsByLeague.has(leagueId));
    if (missing.length > 0 || targetsByLeague.size !== API_FOOTBALL_BIG_FIVE_LEAGUE_IDS.length) {
      throw new Error(`Full API-Football run requires all Big Five league targets; missing: ${missing.join(',') || 'none'}`);
    }
    if (options.leagueIds && options.leagueIds.length !== API_FOOTBALL_BIG_FIVE_LEAGUE_IDS.length) {
      throw new Error('Full API-Football run cannot use a canary league subset');
    }
  }

  return selectedTargets;
}

function parseApiFootballTarget(value: string): ApiFootballTarget {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('API-Football target must be an absolute URL');
  }

  if (
    url.protocol !== 'https:'
    || url.hostname !== API_FOOTBALL_HOST
    || url.port
    || url.pathname !== API_FOOTBALL_PATH
    || url.username
    || url.password
    || url.hash
  ) {
    throw new Error('API-Football target must use the direct HTTPS /players endpoint');
  }

  const queryKeys = [...url.searchParams.keys()];
  if (
    queryKeys.length !== 2
    || new Set(queryKeys).size !== 2
    || !queryKeys.includes('league')
    || !queryKeys.includes('season')
  ) {
    throw new Error('API-Football target must contain exactly league and season query parameters');
  }

  const leagueId = url.searchParams.get('league');
  const season = url.searchParams.get('season');
  if (!isApiFootballLeagueId(leagueId)) {
    throw new Error(`API-Football target league must be one of ${API_FOOTBALL_BIG_FIVE_LEAGUE_IDS.join(',')}`);
  }
  if (season !== API_FOOTBALL_TARGET_SEASON) {
    throw new Error(`API-Football target season must be ${API_FOOTBALL_TARGET_SEASON}`);
  }

  const canonicalUrl = new URL(`https://${API_FOOTBALL_HOST}${API_FOOTBALL_PATH}`);
  canonicalUrl.searchParams.set('league', leagueId);
  canonicalUrl.searchParams.set('season', season);
  return {
    leagueId,
    season: API_FOOTBALL_TARGET_SEASON,
    url: canonicalUrl.toString(),
  };
}

function validateCanaryLeagueIds(values: readonly ApiFootballLeagueId[]): ApiFootballLeagueId[] {
  if (values.length === 0) {
    throw new Error('API-Football canary league subset cannot be empty');
  }
  const unique = new Set<ApiFootballLeagueId>();
  for (const value of values) {
    if (!isApiFootballLeagueId(value)) {
      throw new Error(`API-Football canary league must be one of ${API_FOOTBALL_BIG_FIVE_LEAGUE_IDS.join(',')}`);
    }
    if (unique.has(value)) {
      throw new Error(`Duplicate API-Football canary league ${value}`);
    }
    unique.add(value);
  }
  return API_FOOTBALL_BIG_FIVE_LEAGUE_IDS.filter((leagueId) => unique.has(leagueId));
}

function isApiFootballLeagueId(value: unknown): value is ApiFootballLeagueId {
  return typeof value === 'string'
    && (API_FOOTBALL_BIG_FIVE_LEAGUE_IDS as readonly string[]).includes(value);
}

function splitConfiguredUrls(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[\n,]+/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function resolveMaxPagesPerTarget(optionValue: number | undefined): number {
  const configuredValue = optionValue ?? (
    process.env.API_FOOTBALL_MAX_PAGES_PER_TARGET === undefined
      ? API_FOOTBALL_HARD_PAGE_CAP
      : Number(process.env.API_FOOTBALL_MAX_PAGES_PER_TARGET)
  );
  if (
    !Number.isInteger(configuredValue)
    || configuredValue < 1
    || configuredValue > API_FOOTBALL_HARD_PAGE_CAP
  ) {
    throw new Error(`API_FOOTBALL_MAX_PAGES_PER_TARGET must be an integer from 1 to ${API_FOOTBALL_HARD_PAGE_CAP}`);
  }
  return configuredValue;
}

function resolveQuotaRuns(value: 1 | 2 | undefined): 1 | 2 {
  if (value === undefined) return 1;
  if (value !== 1 && value !== 2) {
    throw new Error('API-Football quotaRuns must be 1 or 2');
  }
  return value;
}

function createRequestState(options: ApiFootballFetchOptions): RequestState {
  const requestedPacingMs = options.pacingMs ?? API_FOOTBALL_MIN_REQUEST_START_INTERVAL_MS;
  if (!Number.isFinite(requestedPacingMs) || requestedPacingMs < 0) {
    throw new Error('API-Football pacingMs must be a non-negative number');
  }
  const configuredPacingMs = Math.max(
    requestedPacingMs,
    API_FOOTBALL_MIN_REQUEST_START_INTERVAL_MS,
  );
  if (options.deadlineAtMs !== undefined && (!Number.isFinite(options.deadlineAtMs) || options.deadlineAtMs <= 0)) {
    throw new Error('API-Football deadlineAtMs must be a positive timestamp');
  }
  return {
    configuredPacingMs,
    wait: options.wait ?? wait,
    lastRequestStartedAt: null,
    deadlineAtMs: options.deadlineAtMs,
    quotaBefore: null,
    quota: {},
    requestsMade: 0,
    retries: 0,
    quotaResponsesWithMissingHeaders: 0,
    quotaLedgerEstimatedResponses: 0,
    minuteExhaustedFromHeader: false,
  };
}

async function fetchApiFootballPlayersPage(
  target: ApiFootballTarget,
  page: number,
  requestState: RequestState,
  requestsNeededToFinishTarget = 0,
): Promise<ApiFootballPageResult> {
  const url = withPageParam(target.url, page);
  const apiKey = process.env.API_FOOTBALL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('API_FOOTBALL_API_KEY is required for API-Football sync');
  }

  const response = await fetchWithRetry(
    url,
    apiKey,
    requestState,
    page === 1,
    requestsNeededToFinishTarget,
    target,
  );
  const payload: unknown = await response.json();
  assertNoProviderErrors(payload);

  const paging = extractPaging(payload, page);
  const rows = extractRows(payload);
  if (rows.length === 0) {
    throw new Error(buildEmptyResponseMessage(payload));
  }

  let matchedStatisticBlocks = 0;
  let filteredStatisticBlocks = 0;
  let playersWithoutTargetStats = 0;
  let skippedInvalidIdentity = 0;
  const players = rows
    .map((row) => {
      const filtered = filterRowForTarget(row, target);
      matchedStatisticBlocks += filtered.matchedStatisticBlocks;
      filteredStatisticBlocks += filtered.filteredStatisticBlocks;
      if (filtered.matchedStatisticBlocks === 0) {
        playersWithoutTargetStats += 1;
        return null;
      }
      const sourceId = extractSourceId(filtered.row);
      if (!sourceId) {
        skippedInvalidIdentity += 1;
        return null;
      }
      return {
        provider: API_FOOTBALL_PROVIDER,
        sourceId,
        payload: filtered.row,
      };
    })
    .filter((row): row is ProviderPlayerRaw => Boolean(row));

  return {
    players,
    currentPage: paging.current,
    totalPages: paging.total,
    rowsFetched: rows.length,
    playersWithoutTargetStats,
    skippedInvalidIdentity,
    matchedFacts: players.length,
    matchedStatisticBlocks,
    filteredStatisticBlocks,
    payload,
  };
}

async function fetchWithRetry(
  url: string,
  apiKey: string,
  state: RequestState,
  requireCompleteQuotaHeaders: boolean,
  requestsNeededToFinishTarget: number,
  target: ApiFootballTarget,
): Promise<Response> {
  const maxAttempts = MAX_REQUEST_RETRIES + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await paceRequest(state);
    assertBeforeDeadline(state);
    state.lastRequestStartedAt = Date.now();
    state.requestsMade += 1;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'x-apisports-key': apiKey,
        },
        signal: createDeadlineSignal(state),
      });
    } catch (error) {
      if (isDeadlineError(error) || deadlineExceeded(state)) {
        throw new Error('API-Football internal deadline exceeded');
      }
      throw error;
    }
    reconcileQuotaSnapshot(
      state,
      response.headers,
      requireCompleteQuotaHeaders,
    );

    if (response.ok) {
      return response;
    }

    if (state.quota.dailyRemaining === 0) {
      throw new Error(`API-Football daily quota exhausted after ${attempt} attempt(s)`);
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`API-Football request failed with status ${response.status} after ${attempt} attempt(s)`);
    }

    assertRemainingDailyQuota(state.quota, requestsNeededToFinishTarget, target);

    state.retries += 1;
    await state.wait(retryDelayMs(response.headers, attempt));
  }

  throw new Error('API-Football request retry state was exhausted');
}

async function paceRequest(state: RequestState): Promise<void> {
  if (state.lastRequestStartedAt === null) return;
  const minutePacingMs = state.quota.minuteLimit && state.quota.minuteLimit > 0
    ? Math.ceil(60_000 / state.quota.minuteLimit)
    : 0;
  const exhaustedMinuteWindowMs = state.minuteExhaustedFromHeader ? 60_000 : 0;
  const pacingMs = Math.max(
    state.configuredPacingMs,
    minutePacingMs,
    exhaustedMinuteWindowMs,
  );
  const remainingMs = pacingMs - (Date.now() - state.lastRequestStartedAt);
  if (remainingMs > 0) {
    if (state.deadlineAtMs !== undefined && Date.now() + remainingMs >= state.deadlineAtMs) {
      throw new Error('API-Football internal deadline exceeded before next request');
    }
    await state.wait(remainingMs);
  }
  assertBeforeDeadline(state);
}

function retryDelayMs(headers: Headers, attempt: number): number {
  const retryAfter = headers.get('retry-after')?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  }
  return 1_000 * (2 ** (attempt - 1));
}

function reconcileQuotaSnapshot(
  state: RequestState,
  headers: Headers,
  requireComplete: boolean,
): ApiFootballQuotaSnapshot {
  const responseQuota = readQuotaSnapshot(headers);
  const missingHeaders = getMissingQuotaHeaders(responseQuota);

  if (state.quotaBefore === null || requireComplete) {
    assertCompleteQuotaHeaders(responseQuota);
  }

  if (state.quotaBefore === null) {
    state.quotaBefore = { ...responseQuota };
    state.quota = { ...responseQuota };
    state.minuteExhaustedFromHeader = responseQuota.minuteRemaining === 0;
    return responseQuota;
  }

  if (missingHeaders.length > 0) {
    state.quotaResponsesWithMissingHeaders += 1;
    state.quotaLedgerEstimatedResponses += 1;
  }

  const predictedDailyRemaining = decrementQuota(state.quota.dailyRemaining);
  const predictedMinuteRemaining = decrementQuota(state.quota.minuteRemaining);
  state.quota = {
    dailyLimit: conservativeLimit(state.quota.dailyLimit, responseQuota.dailyLimit),
    dailyRemaining: responseQuota.dailyRemaining === undefined
      ? predictedDailyRemaining
      : conservativeRemaining(predictedDailyRemaining, responseQuota.dailyRemaining),
    minuteLimit: conservativeLimit(state.quota.minuteLimit, responseQuota.minuteLimit),
    minuteRemaining: responseQuota.minuteRemaining ?? predictedMinuteRemaining,
  };
  state.minuteExhaustedFromHeader = responseQuota.minuteRemaining === 0;
  return responseQuota;
}

function readQuotaSnapshot(headers: Headers): ApiFootballQuotaSnapshot {
  const responseQuota: ApiFootballQuotaSnapshot = {};
  const dailyLimit = readHeaderNumber(headers, 'x-ratelimit-requests-limit');
  const dailyRemaining = readHeaderNumber(headers, 'x-ratelimit-requests-remaining');
  const minuteLimit = readHeaderNumber(headers, 'x-ratelimit-limit');
  const minuteRemaining = readHeaderNumber(headers, 'x-ratelimit-remaining');
  if (dailyLimit !== undefined) responseQuota.dailyLimit = dailyLimit;
  if (dailyRemaining !== undefined) responseQuota.dailyRemaining = dailyRemaining;
  if (minuteLimit !== undefined) responseQuota.minuteLimit = minuteLimit;
  if (minuteRemaining !== undefined) responseQuota.minuteRemaining = minuteRemaining;
  return responseQuota;
}

function decrementQuota(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.max(0, value - 1);
}

function conservativeLimit(current: number | undefined, reported: number | undefined): number | undefined {
  if (current === undefined) return reported;
  if (reported === undefined) return current;
  return Math.min(current, reported);
}

function conservativeRemaining(predicted: number | undefined, reported: number): number {
  return predicted === undefined ? reported : Math.min(predicted, reported);
}

function readHeaderNumber(headers: Headers | undefined, name: string): number | undefined {
  if (!headers || typeof headers.get !== 'function') return undefined;
  const value = headers.get(name);
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

function buildQuotaGates(
  quota: ApiFootballQuotaSnapshot,
  requestsPerRun: number,
  probeRequests = 0,
): { oneRun: ApiFootballQuotaGate; twoRuns: ApiFootballQuotaGate } {
  return {
    oneRun: getApiFootballOneRunQuotaGate(quota, requestsPerRun, probeRequests),
    twoRuns: getApiFootballTwoRunQuotaGate(quota, requestsPerRun, probeRequests),
  };
}

function buildQuotaGate(
  quota: ApiFootballQuotaSnapshot,
  requestsPerRun: number,
  runs: 1 | 2,
  probeRequests: number,
): ApiFootballQuotaGate {
  if (!Number.isInteger(requestsPerRun) || requestsPerRun < 0) {
    throw new Error('API-Football requestsPerRun must be a non-negative integer');
  }
  const requiredRequests = Math.ceil(requestsPerRun * runs * 1.2);
  if (!Number.isInteger(probeRequests) || probeRequests < 0) {
    throw new Error('API-Football probeRequests must be a non-negative integer');
  }
  const remainingRequests = quota.dailyRemaining;
  const effectiveRemainingRequests = remainingRequests === undefined
    ? undefined
    : remainingRequests + probeRequests;
  return {
    runs,
    bufferMultiplier: 1.2,
    requestsPerRun,
    requiredRequests,
    remainingRequests,
    probeRequests,
    effectiveRemainingRequests,
    allowed: effectiveRemainingRequests === undefined ? null : effectiveRemainingRequests >= requiredRequests,
    shortfall: effectiveRemainingRequests === undefined
      ? null
      : Math.max(0, requiredRequests - effectiveRemainingRequests),
  };
}

function assertRemainingDailyQuota(
  quota: ApiFootballQuotaSnapshot,
  remainingPages: number,
  target: ApiFootballTarget,
): void {
  assertCompleteQuotaHeaders(quota);
  if ((quota.dailyRemaining ?? 0) < remainingPages) {
    throw new Error(
      `API-Football daily quota cannot finish league ${target.leagueId}: ${remainingPages} page(s) remain, ${quota.dailyRemaining ?? 'unknown'} request(s) available`,
    );
  }
}

function assertBeforeDeadline(state: RequestState): void {
  if (deadlineExceeded(state)) {
    throw new Error('API-Football internal deadline exceeded');
  }
}

function deadlineExceeded(state: RequestState): boolean {
  return state.deadlineAtMs !== undefined && Date.now() >= state.deadlineAtMs;
}

function createDeadlineSignal(state: RequestState): AbortSignal | undefined {
  if (state.deadlineAtMs === undefined) return undefined;
  const remainingMs = state.deadlineAtMs - Date.now();
  if (remainingMs <= 0) throw new Error('API-Football internal deadline exceeded');
  return AbortSignal.timeout(Math.max(1, remainingMs));
}

function isDeadlineError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function assertCompleteQuotaHeaders(quota: ApiFootballQuotaSnapshot): void {
  const missing = getMissingQuotaHeaders(quota);
  if (missing.length > 0) {
    throw new Error(`API-Football quota headers missing: ${missing.join(',')}`);
  }
}

function getMissingQuotaHeaders(quota: ApiFootballQuotaSnapshot): string[] {
  return [
    ['x-ratelimit-requests-limit', quota.dailyLimit],
    ['x-ratelimit-requests-remaining', quota.dailyRemaining],
    ['x-ratelimit-limit', quota.minuteLimit],
    ['x-ratelimit-remaining', quota.minuteRemaining],
  ]
    .filter(([, value]) => value === undefined)
    .map(([header]) => String(header));
}

function requireQuotaBefore(state: RequestState): ApiFootballQuotaSnapshot {
  if (state.quotaBefore === null) {
    throw new Error('API-Football did not return a complete initial quota snapshot');
  }
  assertCompleteQuotaHeaders(state.quotaBefore);
  return { ...state.quotaBefore };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withPageParam(targetUrl: string, page: number): string {
  const url = new URL(targetUrl);
  url.searchParams.set('page', String(page));
  return url.toString();
}

function extractPaging(payload: unknown, requestedPage: number): { current: number; total: number } {
  const record = toRecord(payload);
  const paging = toRecord(record?.paging);
  const current = toOptionalNumber(paging?.current);
  const total = toOptionalNumber(paging?.total);
  if (
    current === undefined
    || total === undefined
    || !Number.isInteger(current)
    || !Number.isInteger(total)
    || current !== requestedPage
    || total < 1
    || current < 1
    || current > total
  ) {
    throw new Error(`API-Football returned invalid paging metadata for requested page ${requestedPage}`);
  }
  return { current, total };
}

function assertPageWithinCap(
  target: ApiFootballTarget,
  totalPages: number,
  maxPagesPerTarget: number,
): void {
  if (totalPages > maxPagesPerTarget) {
    throw new Error(
      `API-Football league ${target.leagueId} reported ${totalPages} pages, exceeding fail-closed cap ${maxPagesPerTarget}`,
    );
  }
}

function filterRowForTarget(
  row: unknown,
  target: ApiFootballTarget,
): { row: unknown; matchedStatisticBlocks: number; filteredStatisticBlocks: number } {
  const record = toRecord(row);
  if (!record) {
    return { row, matchedStatisticBlocks: 0, filteredStatisticBlocks: 0 };
  }
  const statistics = recordArray(record.statistics);
  const matched = statistics.filter((statistic) => {
    const league = toRecord(statistic.league);
    return toOptionalString(league?.id) === target.leagueId
      && toOptionalString(league?.season) === target.season;
  });
  return {
    row: { ...record, statistics: matched },
    matchedStatisticBlocks: matched.length,
    filteredStatisticBlocks: statistics.length - matched.length,
  };
}

function mergePagePlayers(
  playersByKey: Map<string, ProviderPlayerRaw>,
  players: ProviderPlayerRaw[],
): void {
  for (const player of players) {
    const key = `${player.provider}:${player.sourceId}`;
    const existing = playersByKey.get(key);
    playersByKey.set(key, existing ? mergeProviderPlayerRaw(existing, player) : player);
  }
}

function mergeProviderPlayerRaw(
  existing: ProviderPlayerRaw,
  incoming: ProviderPlayerRaw,
): ProviderPlayerRaw {
  const existingPayload = toRecord(existing.payload);
  const incomingPayload = toRecord(incoming.payload);
  if (!existingPayload || !incomingPayload) return existing;

  const statisticsByKey = new Map<string, Record<string, unknown>>();
  for (const statistic of [
    ...recordArray(existingPayload.statistics),
    ...recordArray(incomingPayload.statistics),
  ]) {
    const key = statisticBlockKey(statistic);
    const current = statisticsByKey.get(key);
    if (!current || statisticMinutes(statistic) > statisticMinutes(current)) {
      statisticsByKey.set(key, statistic);
    }
  }

  const existingPlayer = toRecord(existingPayload.player);
  const incomingPlayer = toRecord(incomingPayload.player);
  return {
    provider: existing.provider,
    sourceId: existing.sourceId,
    payload: {
      ...incomingPayload,
      ...existingPayload,
      player: existingPlayer && incomingPlayer
        ? { ...incomingPlayer, ...existingPlayer }
        : existingPlayer ?? incomingPlayer,
      statistics: [...statisticsByKey.values()],
    },
  };
}

function statisticBlockKey(statistic: Record<string, unknown>): string {
  const league = toRecord(statistic.league);
  const team = toRecord(statistic.team);
  return [
    toOptionalString(league?.id) ?? 'unknown-league',
    toOptionalString(league?.season) ?? 'unknown-season',
    toOptionalString(team?.id) ?? 'unknown-team',
  ].join(':');
}

function statisticMinutes(statistic: Record<string, unknown>): number {
  return toOptionalNumber(toRecord(statistic.games)?.minutes) ?? 0;
}

function aggregateStatisticFacts(blocks: Record<string, unknown>[]): AggregatedStatisticFacts {
  const blocksByFact = new Map<string, Record<string, unknown>[]>();
  for (const block of blocks) {
    const league = toRecord(block.league);
    const leagueId = toOptionalString(league?.id);
    const season = toOptionalString(league?.season);
    if (!leagueId || !season) continue;
    const key = `${leagueId}:${season}`;
    const group = blocksByFact.get(key) ?? [];
    group.push(block);
    blocksByFact.set(key, group);
  }

  const groups = [...blocksByFact.values()].map((factBlocks) => ({
    fact: aggregateSeasonFact(factBlocks),
    dominantBlock: [...factBlocks].sort(compareStatisticBlocks)[0],
  }));
  const facts = groups.map((group) => group.fact).sort(compareSeasonFacts);
  const primaryBlock = groups.sort(comparePrimaryFactGroups)[0]?.dominantBlock;
  return { facts, primaryBlock, teamBlockCount: blocks.length };
}

function comparePrimaryFactGroups(
  left: { fact: ProviderSeasonStats },
  right: { fact: ProviderSeasonStats },
): number {
  const minuteDifference = (right.fact.minutes ?? 0) - (left.fact.minutes ?? 0);
  if (minuteDifference !== 0) return minuteDifference;
  const leagueDifference = compareNumericStrings(
    left.fact.competitionProviderId ?? '',
    right.fact.competitionProviderId ?? '',
  );
  if (leagueDifference !== 0) return leagueDifference;
  return (left.fact.season ?? '').localeCompare(right.fact.season ?? '');
}

function aggregateSeasonFact(blocks: Record<string, unknown>[]): ProviderSeasonStats {
  const firstLeague = toRecord(blocks[0]?.league);
  const dominantBlock = [...blocks].sort(compareStatisticBlocks)[0];
  const teamProviderIds = [...new Set(
    blocks
      .map((block) => toOptionalString(toRecord(block.team)?.id))
      .filter((value): value is string => Boolean(value)),
  )].sort(compareNumericStrings);

  return compactSeasonStats({
    season: toOptionalString(firstLeague?.season),
    competition: firstDefinedString(blocks, (block) => toRecord(block.league)?.name),
    competitionProviderId: toOptionalString(firstLeague?.id),
    teamProviderId: toOptionalString(toRecord(dominantBlock?.team)?.id),
    teamProviderIds: teamProviderIds.length > 0 ? teamProviderIds : undefined,
    appearances: sumBlockNumbers(blocks, (block) => {
      const games = toRecord(block.games);
      return games?.appearences ?? games?.appearances;
    }),
    starts: sumBlockNumbers(blocks, (block) => toRecord(block.games)?.starts),
    minutes: sumBlockNumbers(blocks, (block) => toRecord(block.games)?.minutes),
    goals: sumBlockNumbers(blocks, (block) => toRecord(block.goals)?.total),
    assists: sumBlockNumbers(blocks, (block) => toRecord(block.goals)?.assists),
    shots: sumBlockNumbers(blocks, (block) => toRecord(block.shots)?.total),
    shotsOnTarget: sumBlockNumbers(blocks, (block) => toRecord(block.shots)?.on),
    keyPasses: sumBlockNumbers(blocks, (block) => toRecord(block.passes)?.key),
    passesTotal: sumBlockNumbers(blocks, (block) => toRecord(block.passes)?.total),
    passAccuracy: weightedPassAccuracy(blocks),
    dribblesCompleted: sumBlockNumbers(blocks, (block) => toRecord(block.dribbles)?.success),
    tackles: sumBlockNumbers(blocks, (block) => toRecord(block.tackles)?.total),
    interceptions: sumBlockNumbers(blocks, (block) => toRecord(block.tackles)?.interceptions),
    aerialDuelsWon: sumBlockNumbers(blocks, (block) => toRecord(block.duels)?.won),
    yellowCards: sumBlockNumbers(blocks, (block) => toRecord(block.cards)?.yellow),
    redCards: sumBlockNumbers(blocks, (block) => toRecord(block.cards)?.red),
    goalsConceded: sumBlockNumbers(blocks, (block) => toRecord(block.goals)?.conceded),
    saves: sumBlockNumbers(blocks, (block) => toRecord(block.goals)?.saves),
  });
}

function weightedPassAccuracy(blocks: Record<string, unknown>[]): number | undefined {
  let weightedTotal = 0;
  let totalWeight = 0;
  for (const block of blocks) {
    const passes = toRecord(block.passes);
    const games = toRecord(block.games);
    const accuracy = toOptionalPercentage(passes?.accuracy);
    if (accuracy === undefined) continue;
    const passesTotal = toOptionalNumber(passes?.total);
    const minutes = toOptionalNumber(games?.minutes);
    const weight = passesTotal && passesTotal > 0
      ? passesTotal
      : minutes && minutes > 0
        ? minutes
        : undefined;
    if (weight === undefined) continue;
    weightedTotal += accuracy * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? roundToTwoDecimals(weightedTotal / totalWeight) : undefined;
}

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toOptionalPercentage(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/%$/, '').trim();
    return toOptionalNumber(normalized);
  }
  return toOptionalNumber(value);
}

function sumBlockNumbers(
  blocks: Record<string, unknown>[],
  select: (block: Record<string, unknown>) => unknown,
): number | undefined {
  const values = blocks
    .map((block) => toOptionalNumber(select(block)))
    .filter((value): value is number => value !== undefined);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

function firstDefinedString(
  blocks: Record<string, unknown>[],
  select: (block: Record<string, unknown>) => unknown,
): string | undefined {
  for (const block of blocks) {
    const value = toOptionalString(select(block));
    if (value) return value;
  }
  return undefined;
}

function compareSeasonFacts(left: ProviderSeasonStats, right: ProviderSeasonStats): number {
  const leftIndex = API_FOOTBALL_BIG_FIVE_LEAGUE_IDS.indexOf(left.competitionProviderId as ApiFootballLeagueId);
  const rightIndex = API_FOOTBALL_BIG_FIVE_LEAGUE_IDS.indexOf(right.competitionProviderId as ApiFootballLeagueId);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return (left.season ?? '').localeCompare(right.season ?? '');
}

function compareStatisticBlocks(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): number {
  const minuteDifference = statisticMinutes(right) - statisticMinutes(left);
  if (minuteDifference !== 0) return minuteDifference;
  const leftLeague = toRecord(left.league);
  const rightLeague = toRecord(right.league);
  const leagueDifference = compareNumericStrings(
    toOptionalString(leftLeague?.id) ?? '',
    toOptionalString(rightLeague?.id) ?? '',
  );
  if (leagueDifference !== 0) return leagueDifference;
  const seasonDifference = (toOptionalString(leftLeague?.season) ?? '')
    .localeCompare(toOptionalString(rightLeague?.season) ?? '');
  if (seasonDifference !== 0) return seasonDifference;
  return compareNumericStrings(
    toOptionalString(toRecord(left.team)?.id) ?? '',
    toOptionalString(toRecord(right.team)?.id) ?? '',
  );
}

function compareNumericStrings(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right);
}

function mapPlayerStats(fact?: ProviderSeasonStats): PlayerStats | undefined {
  if (!fact) return undefined;
  return compactStats({
    appearances: fact.appearances,
    minutes: fact.minutes,
    goals: fact.goals,
    assists: fact.assists,
    shots: fact.shots,
    keyPasses: fact.keyPasses,
    passesTotal: fact.passesTotal,
    tackles: fact.tackles,
    interceptions: fact.interceptions,
    passAccuracyPct: fact.passAccuracy,
    saves: fact.saves,
  });
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = toRecord(payload);
  if (!record) return [];
  if (Array.isArray(record.response)) return record.response;
  if (Array.isArray(record.results)) return record.results;
  if (Array.isArray(record.players)) return record.players;
  return [];
}

function assertNoProviderErrors(payload: unknown): void {
  const record = toRecord(payload);
  if (!record) return;
  const errorSummary = summarizeProviderErrors(record.errors);
  if (errorSummary) throw new Error(`API-Football returned errors: ${errorSummary}`);
}

function summarizeProviderErrors(errors: unknown): string | undefined {
  if (errors === null || errors === undefined) return undefined;
  if (Array.isArray(errors)) {
    const messages = errors
      .map(summarizeProviderValue)
      .filter((message): message is string => Boolean(message));
    return messages.length > 0 ? messages.join('; ') : undefined;
  }
  const record = toRecord(errors);
  if (record) {
    const entries = Object.entries(record).map(([key, value]) => {
      const message = summarizeProviderValue(value);
      return message ? `${key}: ${message}` : key;
    });
    return entries.length > 0 ? entries.join('; ') : undefined;
  }
  return summarizeProviderValue(errors);
}

function summarizeProviderValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  const record = toRecord(value);
  if (record) {
    const entries = Object.entries(record).map(([key, nested]) => {
      const message = summarizeProviderValue(nested);
      return message ? `${key}: ${message}` : key;
    });
    return entries.length > 0 ? entries.join(', ') : undefined;
  }
  return undefined;
}

function buildEmptyResponseMessage(payload: unknown): string {
  const record = toRecord(payload);
  const details: string[] = [];
  const results = toOptionalNumber(record?.results);
  if (results !== undefined) details.push(`results=${results}`);
  const paging = toRecord(record?.paging);
  const currentPage = toOptionalNumber(paging?.current);
  const totalPages = toOptionalNumber(paging?.total);
  if (currentPage !== undefined || totalPages !== undefined) {
    details.push(`paging.current=${currentPage ?? 'unknown'}`);
    details.push(`paging.total=${totalPages ?? 'unknown'}`);
  }
  const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
  return `API-Football response did not include player rows${suffix}`;
}

function extractSourceId(row: unknown): string | undefined {
  const record = toRecord(row);
  const player = toRecord(record?.player);
  return toOptionalString(player?.id);
}

function compactStats(stats: PlayerStats): PlayerStats | undefined {
  const entries = Object.entries(stats).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) as PlayerStats : undefined;
}

function compactSeasonStats(stats: ProviderSeasonStats): ProviderSeasonStats {
  return Object.fromEntries(
    Object.entries(stats).filter(([, value]) => value !== undefined),
  ) as ProviderSeasonStats;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(toRecord).filter((record): record is Record<string, unknown> => Boolean(record))
    : [];
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
