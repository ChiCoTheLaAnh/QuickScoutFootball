import type { Player, ProviderPlayerRaw } from '../types';

export interface ProviderModule {
  name: string;
  fetchPlayers(): Promise<ProviderPlayerRaw[]>;
  transformPlayer(raw: ProviderPlayerRaw): Player | null;
}
