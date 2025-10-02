import { firstValueFrom, timer } from 'rxjs';

/** Advances time “naively” to allow timers/polling to run. */
export async function flushQueries(ms = 0): Promise<void> {
  await firstValueFrom(timer(ms));
}
