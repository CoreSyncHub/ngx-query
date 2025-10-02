/** Calculates an exponential retry delay with simple jitter. */
export function exponentialBackoffDelay(attempt: number, baseMs = 250, maxMs = 30_000): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * baseMs);
  return Math.min(maxMs, exp + jitter);
}
