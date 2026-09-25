import { costExplorerPeriod, isWeekComplete, lastCompleteWeekStart, weekRange, weekStartOf } from './week';

describe('week math', () => {
  it('finds the Monday of the ISO week in UTC', () => {
    expect(weekStartOf(new Date('2026-09-25T12:00:00Z'))).toBe('2026-09-21'); // Friday
    expect(weekStartOf(new Date('2026-09-21T00:00:00Z'))).toBe('2026-09-21'); // Monday itself
    expect(weekStartOf(new Date('2026-09-27T23:59:59Z'))).toBe('2026-09-21'); // Sunday belongs to prior Monday
  });

  it('handles month and year boundaries', () => {
    expect(weekStartOf(new Date('2026-01-01T10:00:00Z'))).toBe('2025-12-29');
  });

  it('returns the last complete week', () => {
    expect(lastCompleteWeekStart(new Date('2026-09-25T12:00:00Z'))).toBe('2026-09-14');
    expect(lastCompleteWeekStart(new Date('2026-09-21T00:30:00Z'))).toBe('2026-09-14');
  });

  it('builds ranges oldest-first', () => {
    expect(weekRange('2026-09-14', 3)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14']);
  });

  it('knows when a week is complete', () => {
    expect(isWeekComplete('2026-09-14', new Date('2026-09-21T00:00:00Z'))).toBe(true);
    expect(isWeekComplete('2026-09-21', new Date('2026-09-25T00:00:00Z'))).toBe(false);
  });

  it('clamps an in-progress week so Cost Explorer never gets a future end date', () => {
    expect(costExplorerPeriod('2026-09-21', new Date('2026-09-23T15:00:00Z'))).toEqual({ start: '2026-09-21', end: '2026-09-24' });
    expect(costExplorerPeriod('2026-09-14', new Date('2026-09-23T15:00:00Z'))).toEqual({ start: '2026-09-14', end: '2026-09-21' });
    expect(costExplorerPeriod('2026-10-05', new Date('2026-09-23T15:00:00Z'))).toBeNull();
  });
});
