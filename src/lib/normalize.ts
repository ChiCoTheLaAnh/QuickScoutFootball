import type { Player, ProviderPlayerRaw } from './types';

/**
 * Placeholder normalizer that converts provider-specific payloads into a common Player shape.
 * TODO: Implement real provider-specific mapping logic.
 */
export function normalizeProviderPlayer(raw: ProviderPlayerRaw): Player | null {
  return {
    id: raw.sourceId,
    provider: raw.provider,
    fullName: 'not_implemented',
  };
}
