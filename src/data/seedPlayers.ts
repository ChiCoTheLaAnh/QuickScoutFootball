import type { Player } from '../lib/types';

/**
 * Base season stats are mocked but realistic and can be converted to per-90 metrics.
 */
export const seedPlayers: Player[] = [
  {
    id: 'seed-mohamed-salah',
    provider: 'seed',
    fullName: 'Mohamed Salah',
    age: 33,
    nationality: 'Egypt',
    team: 'Liverpool',
    position: 'RW',
    marketValueEur: 55000000,
    stats: { minutes: 2920, appearances: 36, goals: 22, assists: 12, shots: 133, keyPasses: 71, tackles: 28, interceptions: 16, passAccuracyPct: 82, xG: 20.1, xA: 9.8 },
  },
  {
    id: 'seed-bukayo-saka', provider: 'seed', fullName: 'Bukayo Saka', age: 24, nationality: 'England', team: 'Arsenal', position: 'RW', marketValueEur: 130000000,
    stats: { minutes: 2790, appearances: 34, goals: 17, assists: 11, shots: 105, keyPasses: 67, tackles: 31, interceptions: 19, passAccuracyPct: 84, xG: 14.9, xA: 10.7 },
  },
  {
    id: 'seed-rodrygo', provider: 'seed', fullName: 'Rodrygo', age: 25, nationality: 'Brazil', team: 'Real Madrid', position: 'RW', marketValueEur: 100000000,
    stats: { minutes: 2610, appearances: 35, goals: 14, assists: 9, shots: 96, keyPasses: 52, tackles: 23, interceptions: 14, passAccuracyPct: 87, xG: 12.6, xA: 7.1 },
  },
  {
    id: 'seed-khvicha-kvaratskhelia', provider: 'seed', fullName: 'Khvicha Kvaratskhelia', age: 25, nationality: 'Georgia', team: 'Napoli', position: 'LW', marketValueEur: 90000000,
    stats: { minutes: 2745, appearances: 33, goals: 13, assists: 10, shots: 118, keyPasses: 69, tackles: 27, interceptions: 15, passAccuracyPct: 83, xG: 13.8, xA: 9.5 },
  },
  {
    id: 'seed-rafael-leao', provider: 'seed', fullName: 'Rafael Leao', age: 27, nationality: 'Portugal', team: 'AC Milan', position: 'LW', marketValueEur: 85000000,
    stats: { minutes: 2520, appearances: 31, goals: 11, assists: 9, shots: 101, keyPasses: 54, tackles: 20, interceptions: 12, passAccuracyPct: 81, xG: 11.4, xA: 7.9 },
  },
  {
    id: 'seed-leroy-sane', provider: 'seed', fullName: 'Leroy Sane', age: 30, nationality: 'Germany', team: 'Bayern Munich', position: 'RW', marketValueEur: 70000000,
    stats: { minutes: 2380, appearances: 30, goals: 10, assists: 13, shots: 86, keyPasses: 64, tackles: 24, interceptions: 13, passAccuracyPct: 85, xG: 9.4, xA: 10.2 },
  },
  {
    id: 'seed-nico-williams', provider: 'seed', fullName: 'Nico Williams', age: 23, nationality: 'Spain', team: 'Athletic Club', position: 'LW', marketValueEur: 70000000,
    stats: { minutes: 2460, appearances: 32, goals: 8, assists: 14, shots: 79, keyPasses: 73, tackles: 30, interceptions: 17, passAccuracyPct: 82, xG: 7.2, xA: 11.0 },
  },
  {
    id: 'seed-michael-olise', provider: 'seed', fullName: 'Michael Olise', age: 25, nationality: 'France', team: 'Bayern Munich', position: 'RW', marketValueEur: 75000000,
    stats: { minutes: 2270, appearances: 29, goals: 9, assists: 12, shots: 74, keyPasses: 70, tackles: 22, interceptions: 11, passAccuracyPct: 84, xG: 8.1, xA: 10.8 },
  },
  {
    id: 'seed-jamal-musiala', provider: 'seed', fullName: 'Jamal Musiala', age: 23, nationality: 'Germany', team: 'Bayern Munich', position: 'AM', marketValueEur: 130000000,
    stats: { minutes: 2485, appearances: 31, goals: 12, assists: 8, shots: 93, keyPasses: 48, tackles: 26, interceptions: 15, passAccuracyPct: 88, xG: 10.8, xA: 6.3 },
  },
  {
    id: 'seed-florian-wirtz', provider: 'seed', fullName: 'Florian Wirtz', age: 23, nationality: 'Germany', team: 'Bayer Leverkusen', position: 'AM', marketValueEur: 140000000,
    stats: { minutes: 2670, appearances: 33, goals: 11, assists: 15, shots: 89, keyPasses: 86, tackles: 29, interceptions: 18, passAccuracyPct: 89, xG: 9.7, xA: 12.5 },
  },
  {
    id: 'seed-declan-rice', provider: 'seed', fullName: 'Declan Rice', age: 27, nationality: 'England', team: 'Arsenal', position: 'DM', marketValueEur: 110000000,
    stats: { minutes: 3010, appearances: 35, goals: 6, assists: 7, shots: 47, keyPasses: 43, tackles: 78, interceptions: 55, passAccuracyPct: 91, xG: 5.2, xA: 5.9 },
  },
  {
    id: 'seed-martin-zubimendi', provider: 'seed', fullName: 'Martin Zubimendi', age: 27, nationality: 'Spain', team: 'Real Sociedad', position: 'DM', marketValueEur: 60000000,
    stats: { minutes: 2875, appearances: 34, goals: 3, assists: 4, shots: 26, keyPasses: 31, tackles: 88, interceptions: 62, passAccuracyPct: 90, xG: 2.1, xA: 3.0 },
  },
  {
    id: 'seed-federico-valverde', provider: 'seed', fullName: 'Federico Valverde', age: 28, nationality: 'Uruguay', team: 'Real Madrid', position: 'CM', marketValueEur: 120000000,
    stats: { minutes: 2980, appearances: 36, goals: 8, assists: 6, shots: 64, keyPasses: 40, tackles: 73, interceptions: 44, passAccuracyPct: 89, xG: 7.0, xA: 4.8 },
  },
  {
    id: 'seed-alexis-mac-allister', provider: 'seed', fullName: 'Alexis Mac Allister', age: 27, nationality: 'Argentina', team: 'Liverpool', position: 'CM', marketValueEur: 80000000,
    stats: { minutes: 2760, appearances: 33, goals: 6, assists: 7, shots: 51, keyPasses: 58, tackles: 69, interceptions: 39, passAccuracyPct: 90, xG: 5.5, xA: 6.4 },
  },
  {
    id: 'seed-ruben-dias', provider: 'seed', fullName: 'Ruben Dias', age: 29, nationality: 'Portugal', team: 'Manchester City', position: 'CB', marketValueEur: 75000000,
    stats: { minutes: 2830, appearances: 33, goals: 2, assists: 1, shots: 19, keyPasses: 10, tackles: 42, interceptions: 61, passAccuracyPct: 93, xG: 1.8, xA: 0.9 },
  },
  {
    id: 'seed-william-saliba', provider: 'seed', fullName: 'William Saliba', age: 25, nationality: 'France', team: 'Arsenal', position: 'CB', marketValueEur: 85000000,
    stats: { minutes: 3060, appearances: 34, goals: 2, assists: 1, shots: 17, keyPasses: 9, tackles: 46, interceptions: 66, passAccuracyPct: 94, xG: 1.7, xA: 1.1 },
  },
  {
    id: 'seed-jeremie-frimpong', provider: 'seed', fullName: 'Jeremie Frimpong', age: 25, nationality: 'Netherlands', team: 'Bayer Leverkusen', position: 'RB', marketValueEur: 65000000,
    stats: { minutes: 2410, appearances: 31, goals: 7, assists: 8, shots: 58, keyPasses: 41, tackles: 57, interceptions: 32, passAccuracyPct: 86, xG: 6.4, xA: 5.6 },
  },
  {
    id: 'seed-alphonso-davies', provider: 'seed', fullName: 'Alphonso Davies', age: 26, nationality: 'Canada', team: 'Bayern Munich', position: 'LB', marketValueEur: 70000000,
    stats: { minutes: 2320, appearances: 29, goals: 3, assists: 6, shots: 37, keyPasses: 33, tackles: 62, interceptions: 35, passAccuracyPct: 88, xG: 2.9, xA: 4.4 },
  },
  {
    id: 'seed-diogo-costa', provider: 'seed', fullName: 'Diogo Costa', age: 27, nationality: 'Portugal', team: 'FC Porto', position: 'GK', marketValueEur: 45000000,
    stats: { minutes: 3060, appearances: 34, goals: 0, assists: 0, shots: 0, keyPasses: 0, tackles: 1, interceptions: 7, passAccuracyPct: 79, xG: 0, xA: 0, cleanSheets: 15, saves: 108, savePct: 74 },
  },
  {
    id: 'seed-giorgi-mamardashvili', provider: 'seed', fullName: 'Giorgi Mamardashvili', age: 26, nationality: 'Georgia', team: 'Valencia', position: 'GK', marketValueEur: 40000000,
    stats: { minutes: 2970, appearances: 33, goals: 0, assists: 0, shots: 0, keyPasses: 0, tackles: 1, interceptions: 6, passAccuracyPct: 75, xG: 0, xA: 0, cleanSheets: 12, saves: 119, savePct: 72 },
  },
];

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export const seedPlayersByNormalizedName: Record<string, Player> = Object.fromEntries(
  seedPlayers.map((player) => [normalizeName(player.fullName), player]),
);

export function getSeedPlayerByName(name: string): Player | undefined {
  return seedPlayersByNormalizedName[normalizeName(name)];
}

export function searchSeedPlayers(term: string): Player[] {
  const query = normalizeName(term);
  if (!query) return [];

  return seedPlayers.filter((player) => {
    const fullName = normalizeName(player.fullName);
    const team = normalizeName(player.team ?? '');
    const position = normalizeName(player.position ?? '');
    return fullName.includes(query) || team.includes(query) || position.includes(query);
  });
}
