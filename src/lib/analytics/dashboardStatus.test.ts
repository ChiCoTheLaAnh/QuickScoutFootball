import { describe, expect, it } from 'vitest';

import { classifyDashboardStatus } from './dashboardStatus';

const accepted = {
  completedAt: '2026-09-29T05:25:00.000Z',
  sourceWatermark: '2026-09-28T20:00:00.000Z',
  sourceCounts: { players: 40, stats: 40 },
};
const source = { players: 40, stats: 40, watermark: '2026-09-28T20:00:00.000Z' };

describe('classifyDashboardStatus', () => {
  it('verifies an unchanged source with an accepted daily run', () => {
    expect(classifyDashboardStatus({ accepted, source, latestRunStatus: 'completed', todayAccepted: true }, new Date('2026-09-29T10:00:00Z'))).toBe('verified');
  });

  it('flags a source update after the accepted build', () => {
    expect(classifyDashboardStatus({ accepted, source: { ...source, watermark: '2026-09-29T09:00:00Z' }, latestRunStatus: 'completed', todayAccepted: true }, new Date('2026-09-29T10:00:00Z'))).toBe('unverified');
  });

  it('flags changed counts even when the watermark is unchanged', () => {
    expect(classifyDashboardStatus({ accepted, source: { ...source, stats: 39 }, latestRunStatus: 'completed', todayAccepted: true }, new Date('2026-09-29T10:00:00Z'))).toBe('unverified');
  });

  it('flags a missing daily run after the deadline', () => {
    expect(classifyDashboardStatus({ accepted, source, latestRunStatus: 'completed', todayAccepted: false }, new Date('2026-09-30T09:00:00Z'))).toBe('late');
  });

  it('does not call data verified without any accepted run', () => {
    expect(classifyDashboardStatus({ accepted: null, source, latestRunStatus: null, todayAccepted: false }, new Date('2026-09-29T10:00:00Z'))).toBe('unavailable');
  });

  it('flags the most recent failed attempt', () => {
    expect(classifyDashboardStatus({ accepted, source, latestRunStatus: 'failed', todayAccepted: true }, new Date('2026-09-29T10:00:00Z'))).toBe('attention');
  });

  it('flags a running attempt older than two hours', () => {
    expect(classifyDashboardStatus({ accepted, source, latestRunStatus: 'running', latestRunStartedAt: '2026-09-29T07:00:00Z', todayAccepted: true }, new Date('2026-09-29T10:00:00Z'))).toBe('attention');
  });
});
