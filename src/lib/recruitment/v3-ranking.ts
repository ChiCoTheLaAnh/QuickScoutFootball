export const components = ['performance', 'similarity', 'feasibility'] as const;

export function preferenceScore(row: Record<string, number>, weights: number[]) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  return components.reduce((sum, key, i) => sum + row[key] * (weights[i] / total), 0);
}

export function shortlistOrder(rows: Record<string,Record<string,number>>, method: string, weights: number[]) {
  const score = (id: string) => method === 'v3' ? preferenceScore(rows[id], weights) : rows[id][method];
  return Object.keys(rows).sort((a,b) => score(b) - score(a) || a.localeCompare(b));
}
