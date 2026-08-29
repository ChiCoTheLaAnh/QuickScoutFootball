import { createHash } from 'node:crypto';

function requiredText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function identityFromPlayer(player) {
  const providerSource = requiredText(player?.providerSource ?? player?.provider);
  const rawProviderPlayerId = player?.providerPlayerId ?? player?.id;
  const providerPlayerId = rawProviderPlayerId === undefined || rawProviderPlayerId === null
    ? null
    : requiredText(String(rawProviderPlayerId));

  return providerSource && providerPlayerId
    ? { providerSource, providerPlayerId }
    : null;
}

export function selectUniqueTarget(results, {
  targetName,
  targetProviderSource,
  targetProviderPlayerId,
  configurationPrefix = 'PERF',
}) {
  const providerSource = requiredText(targetProviderSource);
  const providerPlayerId = requiredText(targetProviderPlayerId);

  if (providerPlayerId && !providerSource) {
    throw new Error(
      `${configurationPrefix}_TARGET_PROVIDER_SOURCE is required when `
      + `${configurationPrefix}_TARGET_PROVIDER_PLAYER_ID is set`,
    );
  }

  const matches = results.filter((candidate) => (
    candidate.fullName === targetName
    && (!providerSource || candidate.providerSource === providerSource)
    && (!providerPlayerId || String(candidate.providerPlayerId) === providerPlayerId)
  ));

  if (matches.length === 0) {
    throw new Error(`No exact target match for ${targetName}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Target ${targetName} is ambiguous; set ${configurationPrefix}_TARGET_PROVIDER_SOURCE and `
      + `${configurationPrefix}_TARGET_PROVIDER_PLAYER_ID`,
    );
  }

  const target = matches[0];
  const targetPlayerIdentity = identityFromPlayer(target);
  if (!targetPlayerIdentity) {
    throw new Error(`Target ${targetName} is missing provider identity`);
  }

  return { ...target, targetPlayerIdentity };
}

export function assertTargetIdentity(target, expectedIdentity) {
  const actualIdentity = identityFromPlayer(target);
  if (
    !actualIdentity
    || actualIdentity.providerSource !== expectedIdentity.providerSource
    || actualIdentity.providerPlayerId !== expectedIdentity.providerPlayerId
  ) {
    throw new Error(
      `Recommend response target identity mismatch; expected ${expectedIdentity.providerSource}:${expectedIdentity.providerPlayerId}`,
    );
  }
}

export function assertSafeSecretTransport(baseUrl, secret) {
  if (!requiredText(secret)) return;

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('BASE_URL must be an absolute URL when PERF_REVIEW_SECRET is set');
  }

  const localHttpHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const safe = parsed.protocol === 'https:'
    || (parsed.protocol === 'http:' && localHttpHosts.has(parsed.hostname));
  if (!safe) {
    throw new Error('PERF_REVIEW_SECRET requires HTTPS unless BASE_URL is local');
  }
}

export function normalizeExpectedChecksum(value) {
  const normalized = requiredText(value)?.toLowerCase() ?? null;
  if (normalized && !/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('AUDIT_EXPECTED_CONTENT_CHECKSUM must be a 64-character SHA-256 hex digest');
  }
  return normalized;
}

export function checksumMatchesExpected(actualChecksum, expectedChecksum) {
  return expectedChecksum === null || actualChecksum === expectedChecksum;
}

export function checksumStableRows(players, facts) {
  const byJson = (left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right));
  const canonical = {
    players: [...players].sort(byJson),
    facts: [...facts].sort(byJson),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function selectActiveAuditScope(players, facts) {
  const activePlayers = players.filter((player) => player.is_active === true);
  const activePlayerIds = new Set(activePlayers.map((player) => player.id));
  const activeFacts = facts.filter((fact) => activePlayerIds.has(fact.player_id));
  return { activePlayers, activeFacts, activePlayerIds };
}
