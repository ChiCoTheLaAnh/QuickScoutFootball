import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderPlayerRaw } from '../types';
import {
  API_FOOTBALL_BIG_FIVE_LEAGUE_IDS,
  fetchApiFootballPlayerCoverage,
  getApiFootballOneRunQuotaGate,
  getApiFootballTwoRunQuotaGate,
  probeApiFootballPlayerCoverage,
  transformApiFootballPlayer,
  transformApiFootballPlayerRecord,
} from './apiFootball';

const noWait = async () => undefined;

function targetUrl(leagueId: string, season = '2024'): string {
  return `https://v3.football.api-sports.io/players?league=${leagueId}&season=${season}`;
}

function statisticBlock({
  leagueId = 39,
  leagueName = 'Premier League',
  season = 2024,
  teamId = 40,
  teamName = 'Liverpool',
  minutes = 900,
  passesTotal = 500,
  passAccuracy = 80,
  goals = 2,
}: {
  leagueId?: number;
  leagueName?: string;
  season?: number;
  teamId?: number;
  teamName?: string;
  minutes?: number;
  passesTotal?: number;
  passAccuracy?: number;
  goals?: number;
} = {}) {
  return {
    team: { id: teamId, name: teamName },
    league: { id: leagueId, name: leagueName, season },
    games: { appearences: 10, starts: 8, minutes, position: 'Attacker' },
    shots: { total: 20, on: 10 },
    goals: { total: goals, assists: 3 },
    passes: { total: passesTotal, key: 5, accuracy: passAccuracy },
    tackles: { total: 4, interceptions: 2 },
    dribbles: { success: 6 },
    duels: { won: 7 },
    cards: { yellow: 1, red: 0 },
  };
}

function playerRow(
  id: number,
  statistics: unknown[],
  name = `Player ${id}`,
) {
  return {
    player: { id, name, age: 27, nationality: 'Testland' },
    statistics,
  };
}

function pagePayload(rows: unknown[], current = 1, total = 1) {
  return {
    errors: [],
    results: rows.length,
    paging: { current, total },
    response: rows,
  };
}

function response(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const quotaHeaders = {
    'x-ratelimit-requests-limit': '7500',
    'x-ratelimit-requests-remaining': '7400',
    'x-ratelimit-limit': '300',
    'x-ratelimit-remaining': '299',
    ...headers,
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(quotaHeaders),
    json: async () => payload,
  } as Response;
}

const aggregateRaw: ProviderPlayerRaw = {
  provider: 'apiFootball',
  sourceId: '306',
  payload: playerRow(306, [
    statisticBlock(),
    statisticBlock({ teamId: 41, teamName: 'Second Club', minutes: 100, passesTotal: 0, passAccuracy: 60, goals: 1 }),
    statisticBlock({
      leagueId: 140,
      leagueName: 'La Liga',
      teamId: 529,
      teamName: 'Barcelona',
      minutes: 700,
      passesTotal: 300,
      passAccuracy: 90,
      goals: 4,
    }),
  ], 'Mohamed Salah'),
};

describe('API-Football provider transform', () => {
  it('groups league facts and aggregates team blocks with weighted pass accuracy', () => {
    const record = transformApiFootballPlayerRecord(aggregateRaw);

    expect(record).toMatchObject({
      providerSource: 'apiFootball',
      providerPlayerId: '306',
      normalizedName: 'mohamed salah',
      slug: 'api-football-306',
      teamProviderId: '40',
      leagueProviderId: '39',
      seasonStats: [
        {
          season: '2024',
          competition: 'Premier League',
          competitionProviderId: '39',
          teamProviderId: '40',
          teamProviderIds: ['40', '41'],
          appearances: 20,
          starts: 16,
          minutes: 1000,
          goals: 3,
          assists: 6,
          passesTotal: 500,
          passAccuracy: 76.67,
        },
        {
          season: '2024',
          competition: 'La Liga',
          competitionProviderId: '140',
          teamProviderId: '529',
          teamProviderIds: ['529'],
          minutes: 700,
          passesTotal: 300,
          passAccuracy: 90,
        },
      ],
    });
    expect(record?.metadata).toMatchObject({ seasonFactCount: 2, teamBlockCount: 3 });
  });

  it('maps the dominant league fact into the shared Player shape', () => {
    expect(transformApiFootballPlayer(aggregateRaw)).toMatchObject({
      id: '306',
      provider: 'apiFootball',
      providerPlayerId: '306',
      fullName: 'Mohamed Salah',
      team: 'Liverpool',
      position: 'Attacker',
      stats: {
        minutes: 1000,
        goals: 3,
        passesTotal: 500,
        passAccuracyPct: 76.67,
      },
    });
  });

  it('returns null when a payload has no usable name', () => {
    expect(transformApiFootballPlayer({
      provider: 'apiFootball',
      sourceId: 'missing-name',
      payload: { player: { id: 'missing-name' }, statistics: [] },
    })).toBeNull();
  });

  it('returns null when a player has no exact target season facts', () => {
    expect(transformApiFootballPlayerRecord({
      provider: 'apiFootball',
      sourceId: '1',
      payload: playerRow(1, []),
    })).toBeNull();
  });

  it('parses percentage strings and excludes accuracy blocks without pass or minute weight', () => {
    const weighted = statisticBlock({ teamId: 1, passesTotal: 100, passAccuracy: 80 });
    const unweighted = statisticBlock({ teamId: 2, minutes: 0, passesTotal: 0, passAccuracy: 100 });
    (weighted.passes as { accuracy: number | string }).accuracy = '80%';
    (unweighted.passes as { accuracy: number | string }).accuracy = '100%';

    const record = transformApiFootballPlayerRecord({
      provider: 'apiFootball',
      sourceId: '1',
      payload: playerRow(1, [weighted, unweighted]),
    });

    expect(record?.seasonStats[0]?.passAccuracy).toBe(80);
  });

  it('selects the primary league by aggregated minutes and breaks ties by numeric league ID', () => {
    const record = transformApiFootballPlayerRecord({
      provider: 'apiFootball',
      sourceId: '1',
      payload: playerRow(1, [
        statisticBlock({ leagueId: 140, leagueName: 'La Liga', teamId: 529, teamName: 'Barcelona', minutes: 900 }),
        statisticBlock({ leagueId: 39, teamId: 50, teamName: 'Team 50', minutes: 600 }),
        statisticBlock({ leagueId: 39, teamId: 40, teamName: 'Team 40', minutes: 500 }),
      ]),
    });

    expect(record).toMatchObject({
      leagueProviderId: '39',
      teamProviderId: '50',
      player: { team: 'Team 50', stats: { minutes: 1100 } },
    });

    const tied = transformApiFootballPlayerRecord({
      provider: 'apiFootball',
      sourceId: '2',
      payload: playerRow(2, [
        statisticBlock({ leagueId: 135, leagueName: 'Serie A', teamId: 500, teamName: 'Serie A Club', minutes: 900 }),
        statisticBlock({ leagueId: 39, teamId: 40, teamName: 'Premier League Club', minutes: 900 }),
      ]),
    });
    expect(tied).toMatchObject({ leagueProviderId: '39', teamProviderId: '40' });
  });
});

describe('API-Football target, paging, retry, and quota behavior', () => {
  const savedEnv = {
    apiKey: process.env.API_FOOTBALL_API_KEY,
    playersUrl: process.env.API_FOOTBALL_PLAYERS_URL,
    playersUrls: process.env.API_FOOTBALL_PLAYERS_URLS,
    maxPagesPerTarget: process.env.API_FOOTBALL_MAX_PAGES_PER_TARGET,
  };

  beforeEach(() => {
    process.env.API_FOOTBALL_API_KEY = 'test-api-key';
    process.env.API_FOOTBALL_PLAYERS_URL = targetUrl('39');
    delete process.env.API_FOOTBALL_PLAYERS_URLS;
    delete process.env.API_FOOTBALL_MAX_PAGES_PER_TARGET;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv('API_FOOTBALL_API_KEY', savedEnv.apiKey);
    restoreEnv('API_FOOTBALL_PLAYERS_URL', savedEnv.playersUrl);
    restoreEnv('API_FOOTBALL_PLAYERS_URLS', savedEnv.playersUrls);
    restoreEnv('API_FOOTBALL_MAX_PAGES_PER_TARGET', savedEnv.maxPagesPerTarget);
  });

  it('filters statistics by the exact target league and season before grouping', async () => {
    const matching = statisticBlock();
    const matchingSecondTeam = statisticBlock({ teamId: 41, teamName: 'Second Club' });
    const wrongSeason = statisticBlock({ season: 2023 });
    const wrongLeague = statisticBlock({ leagueId: 140, leagueName: 'La Liga' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      response(pagePayload([playerRow(306, [matching, matchingSecondTeam, wrongSeason, wrongLeague])])),
    ));

    const result = await fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait });
    const payload = result.players[0]?.payload as { statistics: unknown[] };

    expect(payload.statistics).toEqual([matching, matchingSecondTeam]);
    expect(result.matchedFacts).toBe(1);
    expect(result.matchedStatisticBlocks).toBe(2);
    expect(result.filteredStatisticBlocks).toBe(2);
    expect(result.targetCoverage[0]).toMatchObject({
      matchedFacts: 1,
      matchedStatisticBlocks: 2,
      truncated: false,
    });
  });

  it('drops response rows without exact target statistics and counts them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(pagePayload([
      playerRow(306, [statisticBlock({ season: 2023 })]),
    ]))));

    const result = await fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait });

    expect(result.players).toEqual([]);
    expect(result.playersWithoutTargetStats).toBe(1);
    expect(result.skippedNoTargetStats).toBe(1);
    expect(result.targetCoverage[0]?.playersWithoutTargetStats).toBe(1);
    expect(result.targetCoverage[0]?.skippedNoTargetStats).toBe(1);
  });

  it('skips a matching row without the official nested player ID and counts it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(pagePayload([{
      id: 999,
      player: { name: 'Missing Provider Identity' },
      statistics: [statisticBlock()],
    }]))));

    const result = await fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait });

    expect(result.players).toEqual([]);
    expect(result.skippedInvalidIdentity).toBe(1);
    expect(result.matchedFacts).toBe(0);
    expect(result.targetCoverage[0]).toMatchObject({
      skippedInvalidIdentity: 1,
      matchedFacts: 0,
    });
  });

  it('preserves multiple league facts while de-duping canonical provider identity', async () => {
    delete process.env.API_FOOTBALL_PLAYERS_URL;
    process.env.API_FOOTBALL_PLAYERS_URLS = [targetUrl('39'), targetUrl('140')].join(',');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(pagePayload([playerRow(306, [statisticBlock()])])))
      .mockResolvedValueOnce(response(pagePayload([playerRow(306, [statisticBlock({
        leagueId: 140,
        leagueName: 'La Liga',
        teamId: 529,
      })])]))));

    const result = await fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait });
    const record = transformApiFootballPlayerRecord(result.players[0]);

    expect(result.players).toHaveLength(1);
    expect(record?.seasonStats.map((fact) => fact.competitionProviderId)).toEqual(['39', '140']);
  });

  it('reports actual paging totals and all provider quota headers', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(
        pagePayload([playerRow(1, [statisticBlock()])], 1, 2),
        200,
        {
          'x-ratelimit-requests-limit': '7500',
          'x-ratelimit-requests-remaining': '7499',
          'x-ratelimit-limit': '300',
          'x-ratelimit-remaining': '299',
        },
      ))
      .mockResolvedValueOnce(response(
        pagePayload([playerRow(2, [statisticBlock()])], 2, 2),
        200,
        {
          'x-ratelimit-requests-limit': '7500',
          'x-ratelimit-requests-remaining': '7498',
          'x-ratelimit-limit': '300',
          'x-ratelimit-remaining': '298',
        },
      )));

    const result = await fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait });

    expect(result).toMatchObject({
      pagesFetched: 2,
      pagesExpected: 2,
      requestsMade: 2,
      truncated: false,
      targetCoverage: [{ leagueId: '39', totalPages: 2, pagesFetched: 2 }],
      quotaBefore: {
        dailyLimit: 7500,
        dailyRemaining: 7499,
        minuteLimit: 300,
        minuteRemaining: 299,
      },
      quotaAfter: {
        dailyLimit: 7500,
        dailyRemaining: 7498,
        minuteLimit: 300,
        minuteRemaining: 298,
      },
      quota: {
        dailyLimit: 7500,
        dailyRemaining: 7498,
        minuteLimit: 300,
        minuteRemaining: 298,
      },
      quotaGates: {
        oneRun: { requiredRequests: 3, allowed: true },
        twoRuns: { requiredRequests: 5, allowed: true },
      },
    });
  });

  it('waits a full minute window before continuing when minute quota is exhausted', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(
        pagePayload([playerRow(1, [statisticBlock()])], 1, 2),
        200,
        { 'x-ratelimit-remaining': '0' },
      ))
      .mockResolvedValueOnce(response(
        pagePayload([playerRow(2, [statisticBlock()])], 2, 2),
      ));
    vi.stubGlobal('fetch', fetchMock);
    const wait = vi.fn(async (_milliseconds: number) => undefined);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);

    try {
      const result = await fetchApiFootballPlayerCoverage({ pacingMs: 0, wait });

      expect(result.pagesFetched).toBe(2);
      expect(wait).toHaveBeenCalledWith(60_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('probes page one for every selected target before fetching later pages', async () => {
    delete process.env.API_FOOTBALL_PLAYERS_URL;
    process.env.API_FOOTBALL_PLAYERS_URLS = [targetUrl('39'), targetUrl('140')].join(',');
    const laLigaBlock = statisticBlock({ leagueId: 140, leagueName: 'La Liga' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(pagePayload([playerRow(1, [statisticBlock()])], 1, 2)))
      .mockResolvedValueOnce(response(pagePayload([playerRow(2, [laLigaBlock])], 1, 2)))
      .mockResolvedValueOnce(response(pagePayload([playerRow(3, [statisticBlock()])], 2, 2)))
      .mockResolvedValueOnce(response(pagePayload([playerRow(4, [laLigaBlock])], 2, 2)));
    vi.stubGlobal('fetch', fetchMock);

    await fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${targetUrl('39')}&page=1`,
      `${targetUrl('140')}&page=1`,
      `${targetUrl('39')}&page=2`,
      `${targetUrl('140')}&page=2`,
    ]);
  });

  it('fails the buffered quota gate after probes without fetching page two', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(
      pagePayload([playerRow(1, [statisticBlock()])], 1, 2),
      200,
      { 'x-ratelimit-requests-remaining': '2' },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait }))
      .rejects.toThrow('quota gate blocked 1 run(s): requires 3, remaining 2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when required quota headers are missing', async () => {
    const payload = pagePayload([playerRow(1, [statisticBlock()])]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => payload,
    } as Response));

    await expect(fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait }))
      .rejects.toThrow('quota headers missing');
  });

  it('validates quota headers independently on every selected target response', async () => {
    delete process.env.API_FOOTBALL_PLAYERS_URL;
    process.env.API_FOOTBALL_PLAYERS_URLS = [targetUrl('39'), targetUrl('140')].join(',');
    const secondPayload = pagePayload([playerRow(2, [statisticBlock({
      leagueId: 140,
      leagueName: 'La Liga',
    })])]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(pagePayload([playerRow(1, [statisticBlock()])])))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'x-ratelimit-requests-limit': '7500',
          'x-ratelimit-requests-remaining': '7399',
        }),
        json: async () => secondPayload,
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait }))
      .rejects.toThrow('x-ratelimit-limit,x-ratelimit-remaining');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 429 and 5xx responses up to three times and can succeed on attempt four', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, 429))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({}, 500))
      .mockResolvedValueOnce(response(pagePayload([playerRow(1, [statisticBlock()])])));
    vi.stubGlobal('fetch', fetchMock);
    const wait = vi.fn(async (_milliseconds: number) => undefined);

    const result = await fetchApiFootballPlayerCoverage({ pacingMs: 0, wait });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.requestsMade).toBe(4);
    expect(result.retries).toBe(3);
  });

  it('honors an HTTP-date Retry-After header', async () => {
    const retryAt = new Date(Date.now() + 60_000).toUTCString();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, 503, { 'retry-after': retryAt }))
      .mockResolvedValueOnce(response(pagePayload([playerRow(1, [statisticBlock()])])));
    vi.stubGlobal('fetch', fetchMock);
    const wait = vi.fn(async (_milliseconds: number) => undefined);

    await fetchApiFootballPlayerCoverage({ pacingMs: 0, wait });

    const retryDelay = wait.mock.calls[0]?.[0];
    expect(retryDelay).toBeGreaterThanOrEqual(58_000);
    expect(retryDelay).toBeLessThanOrEqual(60_000);
  });

  it('fails after four total retryable attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait }))
      .rejects.toThrow('status 500 after 4 attempt(s)');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry a 429 response when the daily quota is exhausted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(
      {},
      429,
      { 'x-ratelimit-requests-remaining': '0' },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait }))
      .rejects.toThrow('daily quota exhausted after 1 attempt(s)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when provider paging exceeds the hard cap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      response(pagePayload([playerRow(1, [statisticBlock()])], 1, 51)),
    ));

    await expect(fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait }))
      .rejects.toThrow('exceeding fail-closed cap 50');
  });

  it('fails closed when an operator cap would truncate actual paging', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      response(pagePayload([playerRow(1, [statisticBlock()])], 1, 3)),
    ));

    await expect(fetchApiFootballPlayerCoverage({ maxPagesPerTarget: 2, pacingMs: 0, wait: noWait }))
      .rejects.toThrow('exceeding fail-closed cap 2');
  });

  it.each([
    ['wrong season', targetUrl('39', '2025'), 'season must be 2024'],
    ['wrong league', targetUrl('2'), 'league must be one of'],
    ['extra query', `${targetUrl('39')}&team=40`, 'exactly league and season'],
    ['wrong host', 'https://example.com/players?league=39&season=2024', 'direct HTTPS /players endpoint'],
  ])('rejects %s targets', async (_label, url, message) => {
    process.env.API_FOOTBALL_PLAYERS_URL = url;
    vi.stubGlobal('fetch', vi.fn());

    await expect(fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait }))
      .rejects.toThrow(message);
  });

  it('allows an explicit configured subset for a canary', async () => {
    delete process.env.API_FOOTBALL_PLAYERS_URL;
    process.env.API_FOOTBALL_PLAYERS_URLS = API_FOOTBALL_BIG_FIVE_LEAGUE_IDS
      .map((leagueId) => targetUrl(leagueId))
      .join(',');
    const fetchMock = vi.fn().mockResolvedValue(
      response(pagePayload([playerRow(1, [statisticBlock()])])),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchApiFootballPlayerCoverage({
      leagueIds: ['39'],
      pacingMs: 0,
      wait: noWait,
    });

    expect(result.targetsFetched).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requires all five configured targets in full mode', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await expect(fetchApiFootballPlayerCoverage({ targetMode: 'full', pacingMs: 0, wait: noWait }))
      .rejects.toThrow('requires all Big Five league targets');
  });

  it('probes all five targets and evaluates one-run and two-run quota gates', async () => {
    delete process.env.API_FOOTBALL_PLAYERS_URL;
    process.env.API_FOOTBALL_PLAYERS_URLS = [...API_FOOTBALL_BIG_FIVE_LEAGUE_IDS]
      .reverse()
      .map((leagueId) => targetUrl(leagueId))
      .join('\n');
    const fetchMock = vi.fn();
    for (const [index, leagueId] of API_FOOTBALL_BIG_FIVE_LEAGUE_IDS.entries()) {
      fetchMock.mockResolvedValueOnce(response(
        pagePayload([playerRow(index + 1, [statisticBlock({ leagueId: Number(leagueId) })])], 1, index + 1),
        200,
        { 'x-ratelimit-requests-remaining': String(30 - index) },
      ));
    }
    vi.stubGlobal('fetch', fetchMock);

    const result = await probeApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait });

    expect(result.leagueIds).toEqual([...API_FOOTBALL_BIG_FIVE_LEAGUE_IDS]);
    expect(result.pagesRequired).toBe(15);
    expect(result.quotaBefore.dailyRemaining).toBe(30);
    expect(result.quotaAfter.dailyRemaining).toBe(26);
    expect(result.quotaGates.oneRun).toMatchObject({ requiredRequests: 18, allowed: true });
    expect(result.quotaGates.twoRuns).toMatchObject({ requiredRequests: 36, allowed: false, shortfall: 10 });
  });

  it('builds explicit quota gates and preserves unknown quota state', () => {
    expect(getApiFootballOneRunQuotaGate({ dailyRemaining: 9 }, 10))
      .toMatchObject({ runs: 1, bufferMultiplier: 1.2, requiredRequests: 12, allowed: false, shortfall: 3 });
    expect(getApiFootballTwoRunQuotaGate({ dailyRemaining: 20 }, 10))
      .toMatchObject({ runs: 2, bufferMultiplier: 1.2, requiredRequests: 24, allowed: false, shortfall: 4 });
    expect(getApiFootballOneRunQuotaGate({}, 10))
      .toMatchObject({ allowed: null, shortfall: null });
  });

  it('fails on provider errors and successful empty pages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      errors: { requests: 'Daily request limit reached.' },
      paging: { current: 1, total: 1 },
      response: [],
    })));
    await expect(fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait }))
      .rejects.toThrow('requests: Daily request limit reached.');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(pagePayload([], 1, 1))));
    await expect(fetchApiFootballPlayerCoverage({ pacingMs: 0, wait: noWait }))
      .rejects.toThrow('results=0');
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
