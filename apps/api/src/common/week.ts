/**
 * Week math. CloudCost buckets spend into ISO weeks (Monday 00:00 UTC -> next Monday),
 * which is also how Cost Explorer's exclusive `End` date wants its periods expressed.
 */
const DAY_MS = 86_400_000;

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Invalid ISO date: ${s}`);
  return new Date(`${s}T00:00:00.000Z`);
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(isoDate).getTime() + days * DAY_MS));
}

/** Monday (UTC) of the week containing `d`. */
export function weekStartOf(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (utc.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  return toIsoDate(new Date(utc.getTime() - dow * DAY_MS));
}

/** Exclusive end of the week (next Monday). */
export function weekEndExclusive(weekStart: string): string {
  return addDays(weekStart, 7);
}

/** Most recent week that has fully ended as of `now`. */
export function lastCompleteWeekStart(now: Date): string {
  return addDays(weekStartOf(now), -7);
}

/** `count` week starts ending with `lastWeekStart`, oldest first. */
export function weekRange(lastWeekStart: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(lastWeekStart, -7 * (count - 1 - i)));
}

export function isWeekComplete(weekStart: string, now: Date): boolean {
  return now.getTime() >= parseIsoDate(weekEndExclusive(weekStart)).getTime();
}

/** Cost Explorer rejects future dates, so clamp the end of an in-progress week to "tomorrow". */
export function costExplorerPeriod(weekStart: string, now: Date): { start: string; end: string } | null {
  const end = weekEndExclusive(weekStart);
  const tomorrow = addDays(toIsoDate(now), 1);
  const clampedEnd = end < tomorrow ? end : tomorrow;
  if (clampedEnd <= weekStart) return null;
  return { start: weekStart, end: clampedEnd };
}

export function monthStartOf(d: Date): string {
  return toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}
