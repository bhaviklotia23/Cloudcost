/** node-postgres unique_violation, possibly wrapped by drizzle's DrizzleQueryError (err.cause). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code === '23505' || e?.cause?.code === '23505';
}
