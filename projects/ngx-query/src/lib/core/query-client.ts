import {
  catchError,
  defer,
  map,
  Observable,
  Subject,
  switchMap,
  throwError,
  timer,
} from 'rxjs';
import { hashQueryKey } from '../helpers/key-hasher';
import { exponentialBackoffDelay } from './backoff';
import { MutationCache } from './mutation-cache';
import { QueryCache } from './query-cache';
import {
  InvalidatePredicate,
  QueryConfig,
  QueryKey,
  QueryState,
  RetryStrategy,
} from './types';

export class QueryClient {
  public readonly queries: QueryCache;
  public readonly mutations: MutationCache;

  private readonly invalidate$ = new Subject<{
    predicate: InvalidatePredicate;
  }>();
  private readonly config: QueryConfig;

  private readonly refCounts = new Map<string, number>();

  public constructor(config?: Partial<QueryConfig>) {
    this.config = {
      staleTime: 5_000,
      gcTime: 5 * 60_000,
      retry: 3,
      refetchOnFocus: true,
      refetchOnReconnect: true,
      maxQueryCacheSize: 500,
      maxMutationCacheSize: 200,
      ...config,
    };
    this.queries = new QueryCache(this.config.maxQueryCacheSize, (key) =>
      this.canEvictQuery(key)
    );
    this.mutations = new MutationCache(
      this.config.maxMutationCacheSize,
      (key) => this.canEvictMutation(key)
    );
  }

  /** Reads the current data from a query, if present */
  public getQueryData<TData>(queryKey: QueryKey): TData | undefined {
    const hashedKey = hashQueryKey(queryKey);
    return this.queries.peek(hashedKey)?.data as TData | undefined;
  }

  public setQueryData<TData>(queryKey: QueryKey, data: TData): void {
    const hashedKey = hashQueryKey(queryKey);
    const prev = this.queries.peek(hashedKey);
    const next: QueryState<TData> = {
      status: 'success',
      data,
      error: undefined,
      isFetching: false,
      updatedAt: Date.now(),
    };
    if (prev) this.queries.set(hashedKey, next);
    else this.queries.get$(hashedKey).next(next);
  }

  /** Invalidate by predicate. Triggers a refetch by active builders */
  public invalidateQueries(predicate: InvalidatePredicate): void {
    this.invalidate$.next({ predicate });
  }

  /** Retry Policy */
  private shouldRetry<TError>(
    retry: RetryStrategy<TError>,
    attempt: number,
    error: TError
  ): boolean {
    if (typeof retry === 'number') return attempt < retry;
    return retry(attempt, error);
  }

  /** Utility stream for retries with backoff, until success or abandonment */
  public retryWithBackoff<T>(
    sourceFactory: () => Observable<T>,
    retry: RetryStrategy
  ): Observable<T> {
    return defer(() => {
      let attempt = 0;
      return sourceFactory().pipe(
        catchError((error) => {
          if (this.shouldRetry(retry, attempt++, error)) {
            const delay = exponentialBackoffDelay(attempt);
            return timer(delay).pipe(
              switchMap(() => this.retryWithBackoff(sourceFactory, retry))
            );
          }
          return throwError(() => error);
        })
      );
    });
  }

  /** Exposes the internal invalidation stream for builders */
  public invalidations$(): Observable<InvalidatePredicate> {
    return this.invalidate$.asObservable().pipe(map((e) => e.predicate));
  }

  /** Default config */
  public defaults(): Readonly<QueryConfig> {
    return this.config;
  }

  private canEvictQuery(hashedKey: string): boolean {
    const ref = this.refCounts.get(hashedKey) ?? 0;
    const state = this.queries.peek(hashedKey);
    const fetching = !!state?.isFetching;
    return ref <= 0 && !fetching;
  }

  private canEvictMutation(hashedKey: string): boolean {
    const state = this.mutations.peek(hashedKey);
    return !state?.isMutating;
  }

  // #region GC API

  /** Called when a query stream gets its first subscriber. */
  public retain(hashedKey: string): void {
    const n = this.refCounts.get(hashedKey) ?? 0;
    this.refCounts.set(hashedKey, n + 1);
  }

  /** Called when a query stream loses a subscriber. Schedules a collection. */
  public release(hashedKey: string, gcTimeOverride?: number): void {
    const n = (this.refCounts.get(hashedKey) ?? 0) - 1;
    if (n <= 0) {
      this.refCounts.delete(hashedKey);
      this.scheduleCollect(hashedKey, gcTimeOverride ?? this.config.gcTime);
    } else {
      this.refCounts.set(hashedKey, n);
    }
  }

  private scheduleCollect(hashedKey: string, delayMs: number): void {
    timer(delayMs).subscribe(() => {
      if (this.refCounts.has(hashedKey)) return;
      const state = this.queries.peek(hashedKey);
      const isFetching = !!state?.isFetching;
      const age = state?.updatedAt
        ? Date.now() - state.updatedAt
        : Number.POSITIVE_INFINITY;
      const isOld = age >= this.config.gcTime;
      if (!isFetching && isOld) {
        this.queries.delete(hashedKey);
      }
    });
  }

  // #endregion GC API
}
