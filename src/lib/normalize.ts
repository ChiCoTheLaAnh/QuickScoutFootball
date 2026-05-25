import type { Player, ProviderPlayerRaw } from './types';

export function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function createSlug(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

export function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() ? value.trim() : undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

export function normalizeProviderPlayer(raw: ProviderPlayerRaw): Player | null {
  return {
    id: raw.sourceId,
    provider: raw.provider,
    fullName: raw.sourceId,
  };
}
