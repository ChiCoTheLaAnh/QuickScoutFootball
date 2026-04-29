import type { Player, ProviderPlayerRaw } from '../types';

/**
 * Placeholder fetch for Footio provider.
 * TODO: Integrate real Footio API request flow once credentials and endpoint contracts are finalized.
 */
export async function fetchFootioPlayers(): Promise<ProviderPlayerRaw[]> {
  return [];
}

/**
 * Placeholder transform for Footio player payloads.
 * TODO: Map Footio payload fields to the shared Player schema.
 */
export function transformFootioPlayer(raw: ProviderPlayerRaw): Player {
  return {
    id: raw.sourceId,
    provider: 'footio',
    fullName: 'not_implemented',
  };
}
