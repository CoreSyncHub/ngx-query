/** Stable JSON hash for query keys. */
export function hashQueryKey(queryKey: unknown): string {
  return JSON.stringify(
    queryKey,
    Object.keys(queryKey as object).sort((a, b) => a.localeCompare(b))
  );
}
