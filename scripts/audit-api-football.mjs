#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

import {
  checksumStableRows,
  checksumMatchesExpected,
  normalizeExpectedChecksum,
  selectActiveAuditScope,
} from './acceptance-helpers.mjs';

const PROVIDER_SOURCE = 'apiFootball';
const TARGET_SEASON = '2024';
const BIG_FIVE_LEAGUE_IDS = ['39', '61', '78', '135', '140'];
const PAGE_SIZE = 500;
const mode = process.env.AUDIT_MODE?.trim() || 'full';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const expectedContentChecksum = normalizeExpectedChecksum(
  process.env.AUDIT_EXPECTED_CONTENT_CHECKSUM,
);

if (!['canary', 'full'].includes(mode)) {
  throw new Error('AUDIT_MODE must be "canary" or "full"');
}
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function readById(table, select, filters = []) {
  const rows = [];
  let cursor;

  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    for (const [operator, column, value] of filters) {
      query = query[operator](column, value);
    }
    if (cursor) query = query.gt('id', cursor);

    const { data, error } = await query;
    if (error) throw new Error(`${table} audit read failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    const nextCursor = page.at(-1)?.id;
    if (!nextCursor || nextCursor === cursor) {
      throw new Error(`${table} audit pagination did not advance`);
    }
    cursor = nextCursor;
  }

  return rows;
}

function countDuplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.values()].filter((count) => count > 1).length;
}

function roundPct(numerator, denominator) {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function stablePlayer(player) {
  return {
    providerSource: player.provider_source,
    providerPlayerId: player.provider_player_id,
    slug: player.slug,
    fullName: player.full_name,
    normalizedName: player.normalized_name,
    firstName: player.first_name,
    lastName: player.last_name,
    birthDate: player.birth_date,
    age: player.age,
    nationality: player.nationality,
    position: player.primary_position,
    secondaryPositions: player.secondary_positions,
    teamName: player.team_name,
    teamProviderId: player.team_provider_id,
    leagueName: player.league_name,
    leagueProviderId: player.league_provider_id,
    marketValueEur: player.market_value_eur,
    isActive: player.is_active,
    metadata: player.metadata,
  };
}

function stableFact(fact, identityByPlayerId) {
  return {
    playerIdentity: identityByPlayerId.get(fact.player_id) ?? `orphan:${fact.player_id}`,
    providerSource: fact.provider_source,
    providerStatId: fact.provider_stat_id,
    season: fact.season,
    competition: fact.competition,
    competitionProviderId: fact.competition_provider_id,
    teamProviderId: fact.team_provider_id,
    appearances: fact.appearances,
    starts: fact.starts,
    minutes: fact.minutes,
    goals: fact.goals,
    assists: fact.assists,
    expectedGoals: fact.expected_goals,
    expectedAssists: fact.expected_assists,
    shots: fact.shots,
    shotsOnTarget: fact.shots_on_target,
    keyPasses: fact.key_passes,
    passAccuracy: fact.pass_accuracy,
    dribblesCompleted: fact.dribbles_completed,
    tackles: fact.tackles,
    interceptions: fact.interceptions,
    aerialDuelsWon: fact.aerial_duels_won,
    yellowCards: fact.yellow_cards,
    redCards: fact.red_cards,
    cleanSheets: fact.clean_sheets,
    goalsConceded: fact.goals_conceded,
    saves: fact.saves,
    metadata: fact.metadata,
  };
}

const [providerPlayers, providerFacts, allPlayers] = await Promise.all([
  readById(
    'players',
    'id, provider_player_id, provider_source, slug, full_name, normalized_name, first_name, last_name, birth_date, age, nationality, primary_position, secondary_positions, team_name, team_provider_id, league_name, league_provider_id, market_value_eur, is_active, metadata',
    [['eq', 'provider_source', PROVIDER_SOURCE]],
  ),
  readById(
    'player_season_stats',
    'id, player_id, provider_source, provider_stat_id, season, competition, competition_provider_id, team_provider_id, appearances, starts, minutes, goals, assists, expected_goals, expected_assists, shots, shots_on_target, key_passes, pass_accuracy, dribbles_completed, tackles, interceptions, aerial_duels_won, yellow_cards, red_cards, clean_sheets, goals_conceded, saves, metadata',
    [['eq', 'provider_source', PROVIDER_SOURCE], ['eq', 'season', TARGET_SEASON]],
  ),
  readById('players', 'id, provider_player_id, provider_source, normalized_name'),
]);
const {
  activePlayers: activeProviderPlayers,
  activeFacts: activeProviderFacts,
} = selectActiveAuditScope(providerPlayers, providerFacts);

const identityByPlayerId = new Map(providerPlayers.map((player) => [
  player.id,
  `${player.provider_source}:${player.provider_player_id}`,
]));
const factsByPlayerId = new Map();
for (const fact of providerFacts) {
  const existing = factsByPlayerId.get(fact.player_id) ?? [];
  existing.push(fact);
  factsByPlayerId.set(fact.player_id, existing);
}

const leagueIds = [...new Set(providerFacts.map((fact) => String(fact.competition_provider_id)))]
  .sort((left, right) => Number(left) - Number(right));
const expectedLeagueIds = mode === 'canary' ? ['39'] : BIG_FIVE_LEAGUE_IDS;
const outOfScopeLeagueIds = leagueIds.filter((leagueId) => !expectedLeagueIds.includes(leagueId));
const playerIdentityDuplicates = countDuplicates(providerPlayers.map((player) => (
  `${player.provider_source}:${player.provider_player_id}`
)));
const factGrainDuplicates = countDuplicates(providerFacts.map((fact) => (
  `${fact.player_id}:${fact.provider_source}:${fact.season}:${fact.competition_provider_id}`
)));
const orphanFacts = providerFacts.filter((fact) => !identityByPlayerId.has(fact.player_id)).length;
const allPlayersWithoutTargetFacts = providerPlayers
  .filter((player) => !factsByPlayerId.has(player.id)).length;
const playersWithoutTargetFacts = activeProviderPlayers
  .filter((player) => !factsByPlayerId.has(player.id)).length;
const positiveFacts = activeProviderFacts
  .filter((fact) => fact.appearances > 0 && fact.minutes > 0).length;
const missingMarketValuePlayers = activeProviderPlayers
  .filter((player) => player.market_value_eur === null || player.market_value_eur === undefined).length;
const missingExpectedGoalsFacts = activeProviderFacts
  .filter((fact) => fact.expected_goals === null || fact.expected_goals === undefined).length;
const missingExpectedAssistsFacts = activeProviderFacts
  .filter((fact) => fact.expected_assists === null || fact.expected_assists === undefined).length;
const missingPositionPlayers = activeProviderPlayers
  .filter((player) => !player.primary_position).length;
const usablePlayers = activeProviderPlayers.filter((player) => {
  const bestMinutes = Math.max(0, ...(factsByPlayerId.get(player.id) ?? []).map((fact) => fact.minutes ?? 0));
  return bestMinutes >= 900;
}).length;

const normalizedGroups = new Map();
for (const player of allPlayers) {
  const group = normalizedGroups.get(player.normalized_name) ?? new Set();
  group.add(`${player.provider_source}:${player.provider_player_id}`);
  normalizedGroups.set(player.normalized_name, group);
}
const sameNameIdentityCollisionGroups = [...normalizedGroups.values()]
  .filter((identities) => identities.size > 1).length;

const stablePlayers = providerPlayers
  .map(stablePlayer)
  .sort((left, right) => `${left.providerSource}:${left.providerPlayerId}`
    .localeCompare(`${right.providerSource}:${right.providerPlayerId}`));
const stableFacts = providerFacts
  .map((fact) => stableFact(fact, identityByPlayerId))
  .sort((left, right) => (
    `${left.playerIdentity}:${left.providerSource}:${left.season}:${left.competitionProviderId}`
      .localeCompare(`${right.playerIdentity}:${right.providerSource}:${right.season}:${right.competitionProviderId}`)
  ));
const contentChecksum = checksumStableRows(stablePlayers, stableFacts);

const checks = {
  exactLeagueSet: JSON.stringify(leagueIds) === JSON.stringify(expectedLeagueIds),
  minimumPlayerCount: mode === 'canary'
    ? activeProviderPlayers.length > 0
    : activeProviderPlayers.length >= 1_000,
  minimumFactCount: mode === 'canary'
    ? activeProviderFacts.length > 0
    : activeProviderFacts.length >= 1_000,
  noCanonicalDuplicates: playerIdentityDuplicates === 0,
  noFactDuplicates: factGrainDuplicates === 0,
  noOrphanFacts: orphanFacts === 0,
  noOutOfScopeCompetitions: outOfScopeLeagueIds.length === 0,
  everyPlayerHasTargetFact: allPlayersWithoutTargetFacts === 0,
  positiveStatsCoverage: mode === 'canary'
    ? positiveFacts > 0
    : roundPct(positiveFacts, activeProviderFacts.length) >= 95,
  usableCandidateVolume: mode === 'canary' ? usablePlayers > 0 : usablePlayers >= 500,
  contentChecksumMatchesExpected: checksumMatchesExpected(
    contentChecksum,
    expectedContentChecksum,
  ),
};

const report = {
  event: 'apiFootball.audit.completed',
  mode,
  providerSource: PROVIDER_SOURCE,
  season: TARGET_SEASON,
  generatedAt: new Date().toISOString(),
  counts: {
    players: providerPlayers.length,
    activePlayers: activeProviderPlayers.length,
    inactivePlayers: providerPlayers.length - activeProviderPlayers.length,
    facts: providerFacts.length,
    activePlayerFacts: activeProviderFacts.length,
    nonActivePlayerFacts: providerFacts.length - activeProviderFacts.length,
    positiveFacts,
    positiveFactsPct: roundPct(positiveFacts, activeProviderFacts.length),
    missingMarketValuePlayers,
    missingExpectedGoalsFacts,
    missingExpectedAssistsFacts,
    missingPositionPlayers,
    usablePlayers,
    playerIdentityDuplicates,
    factGrainDuplicates,
    orphanFacts,
    playersWithoutTargetFacts,
    allPlayersWithoutTargetFacts,
    sameNameIdentityCollisionGroups,
  },
  leagueIds,
  expectedLeagueIds,
  outOfScopeLeagueIds,
  contentChecksum,
  expectedContentChecksum,
  checksumExpectationConfigured: expectedContentChecksum !== null,
  checks,
  passed: Object.values(checks).every(Boolean),
};

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
