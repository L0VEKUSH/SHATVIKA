import { describe, expect, it } from 'vitest';
import { resolveAnalyticsFilters } from '@/lib/analytics/filters';
import { bucketKey, buildBuckets, localMidnightToUtc, parseLocalDate } from '@/lib/analytics/time';

describe('analytics business-time ranges', () => {
  it('converts Kolkata midnight to UTC and keeps the upper bound exclusive', () => {
    const midnight = localMidnightToUtc(parseLocalDate('2026-09-01'), 'Asia/Kolkata');
    expect(midnight.toISOString()).toBe('2026-08-31T18:30:00.000Z');
    expect(bucketKey(new Date('2026-08-31T18:29:59.999Z'), 'day', 'Asia/Kolkata')).toBe('2026-08-31');
    expect(bucketKey(midnight, 'day', 'Asia/Kolkata')).toBe('2026-09-01');
  });

  it('compares equal elapsed durations for a partial current day', () => {
    const filters = resolveAnalyticsFilters(
      { preset: 'today' },
      { now: new Date('2026-09-10T06:30:00.000Z'), timeZone: 'Asia/Kolkata' },
    );
    const currentDuration = filters.toExclusiveUtc.getTime() - filters.fromUtc.getTime();
    const previousDuration = filters.comparisonToExclusiveUtc.getTime() - filters.comparisonFromUtc.getTime();

    expect(filters.fromUtc.toISOString()).toBe('2026-09-09T18:30:00.000Z');
    expect(filters.toExclusiveUtc.toISOString()).toBe('2026-09-10T06:30:00.000Z');
    expect(previousDuration).toBe(currentDuration);
  });

  it('uses fair elapsed calendar-week and calendar-month comparisons', () => {
    const now = new Date('2026-09-14T06:30:00.000Z'); // Monday noon in Kolkata
    const week = resolveAnalyticsFilters({ preset: 'this_week' }, { now, timeZone: 'Asia/Kolkata' });
    expect(week.fromUtc.toISOString()).toBe('2026-09-13T18:30:00.000Z');
    expect(week.comparisonFromUtc.toISOString()).toBe('2026-09-06T18:30:00.000Z');
    expect(week.comparisonToExclusiveUtc.toISOString()).toBe('2026-09-07T06:30:00.000Z');

    const month = resolveAnalyticsFilters(
      { preset: 'this_month' },
      { now: new Date('2026-03-31T06:30:00.000Z'), timeZone: 'Asia/Kolkata' },
    );
    expect(month.fromUtc.toISOString()).toBe('2026-02-28T18:30:00.000Z');
    expect(month.comparisonFromUtc.toISOString()).toBe('2026-01-31T18:30:00.000Z');
    // February is shorter than March, so the previous comparison is explicitly capped.
    expect(month.comparisonToExclusiveUtc.toISOString()).toBe('2026-02-28T18:30:00.000Z');
  });

  it('supports completed yesterday, week, and month presets', () => {
    const options = { now: new Date('2026-09-14T06:30:00.000Z'), timeZone: 'Asia/Kolkata' };
    expect(resolveAnalyticsFilters({ preset: 'yesterday' }, options)).toMatchObject({ from: '2026-09-13', to: '2026-09-14' });
    expect(resolveAnalyticsFilters({ preset: 'last_week' }, options)).toMatchObject({ from: '2026-09-07', to: '2026-09-14' });
    expect(resolveAnalyticsFilters({ preset: 'last_month' }, options)).toMatchObject({ from: '2026-08-01', to: '2026-09-01' });
  });

  it('fills empty buckets across the selected period', () => {
    const buckets = buildBuckets(
      new Date('2026-08-31T18:30:00.000Z'),
      new Date('2026-09-03T18:30:00.000Z'),
      'day',
      'Asia/Kolkata',
    );
    expect(buckets.map(bucket => bucket.key)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('rejects invalid, future, and oversized custom ranges', () => {
    const options = { now: new Date('2026-09-10T06:30:00.000Z'), timeZone: 'Asia/Kolkata' };
    expect(() => resolveAnalyticsFilters({ preset: 'custom', from: '2026-09-03', to: '2026-09-03' }, options)).toThrow();
    expect(() => resolveAnalyticsFilters({ preset: 'custom', from: '2027-01-01', to: '2027-01-02' }, options)).toThrow();
    expect(() => resolveAnalyticsFilters({ preset: 'custom', from: '2024-01-01', to: '2026-01-02' }, options)).toThrow();
  });
});
