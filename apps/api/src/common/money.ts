/** Round to cents for presentation/comparison; storage keeps 4dp as Cost Explorer returns. */
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function addInto(target: Record<string, number>, key: string, amount: number) {
  target[key] = (target[key] ?? 0) + amount;
}

export function sumValues(rec: Record<string, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0);
}

/** Record -> [{ key, amount }] sorted desc, amounts rounded to 4dp. */
export function toSortedEntries(rec: Record<string, number>) {
  return Object.entries(rec)
    .map(([key, amount]) => ({ key, amount: round4(amount) }))
    .sort((a, b) => b.amount - a.amount);
}
