/**
 * Categorical colour assignment. Colour follows the entity, not its rank: projects get slots
 * in alphabetical order, so "checkout-api" keeps its colour week to week and across filters
 * that don't remove projects. Six named slots max (the palette's validated run); anything past
 * that folds into "Other". "Untagged" is always the neutral grey — it's a gap in tagging,
 * not a peer project.
 */
export const UNTAGGED = 'Untagged';
export const OTHER = 'Other projects';
const SLOTS = 6;

export type Series = { key: string; color: string };

export function assignSeries(keysBySpend: string[]): { series: Series[]; fold: (key: string) => string } {
  const named = keysBySpend.filter((k) => k !== UNTAGGED);
  const kept = new Set(named.slice(0, SLOTS));
  const hasOther = named.length > SLOTS;
  const alpha = [...kept].sort((a, b) => a.localeCompare(b));

  const series: Series[] = alpha.map((key, i) => ({ key, color: `var(--series-${i + 1})` }));
  if (hasOther) series.push({ key: OTHER, color: 'var(--muted)' });
  if (keysBySpend.includes(UNTAGGED)) series.push({ key: UNTAGGED, color: 'var(--series-other)' });

  return { series, fold: (key) => (key === UNTAGGED || kept.has(key) ? key : OTHER) };
}
