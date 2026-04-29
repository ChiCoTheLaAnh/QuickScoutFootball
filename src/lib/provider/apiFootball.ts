import type { Player, ProviderPlayerRaw } from '../types';

/**
 * Placeholder fetch for API-Football provider.
 * TODO: Integrate API-Football fetch logic when endpoint access and rate-limit strategy are defined.
 */
export async function fetchApiFootballPlayers(): Promise<ProviderPlayerRaw[]> {
  return [];
}

/**
 * Placeholder transform for API-Football player payloads.
 * TODO: Map API-Football payload fields to the shared Player schema.
 */
export function transformApiFootballPlayer(raw: ProviderPlayerRaw): Player {
  return {
    id: raw.sourceId,
    provider: 'apiFootball',
    fullName: 'not_implemented',
  };
}
