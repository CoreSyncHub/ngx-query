import {
  BehaviorSubject,
  combineLatest,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  finalize,
  fromEvent,
  interval,
  isObservable,
  map,
  merge,
  Observable,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import {
  QueryFetcher,
  QueryKey,
  QueryState,
  RefetchReason,
  RetryStrategy,
  SelectFn,
} from '../core/types';
import { QueryClient } from '../core/query-client';
import { hashQueryKey } from '../helpers/key-hasher';
import { isBrowser } from '../helpers/env';
import { isSignal, Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { isSignalLike, SignalLike } from '../helpers/signal-like';

/**
 * Result of a built query.
 *
 * @typeParam TSelected - The projected value emitted by {@link QueryBuilder.select}. Defaults to `TData`.
 * @typeParam TError - Error type stored in state and emitted by {@link BuiltQuery.error$}. Defaults to `unknown`.
 *
 * @remarks
 * All streams are hot and shared. Subscribing to {@link BuiltQuery.data$} retains the cache entry.
 * When the last subscriber unsubscribes, the entry will be released and later garbage-collected
 * according to the configured {@link QueryBuilder.gcTime}.
 *
 * @public
 * @since 0.2.0
 */
export interface BuiltQuery<TSelected = unknown, TError = unknown> {
  /**
   * Emits the current selected data. `undefined` until the first successful fetch completes.
   * @public
   * @since 0.1.0
   */
  data$: Observable<TSelected | undefined>;

  /**
   * Emits the last error produced by the fetcher, or `undefined` if none.
   * @public
   * @since 0.1.0
   */
  error$: Observable<TError | undefined>;

  /**
   * Emits the current status of the query: `'idle' | 'loading' | 'success' | 'error'`.
   * @public
   * @since 0.1.0
   */
  status$: Observable<QueryState['status']>;

  /**
   * Emits `true` while a fetch is in flight.
   * @public
   * @since 0.1.0
   */
  isFetching$: Observable<boolean>;

  /**
   * Triggers a refetch. Optionally provide a {@link RefetchReason} for instrumentation.
   *
   * @example
   * query.refetch();            // manual refetch
   * query.refetch('interval');  // annotate the reason
   *
   * @public
   * @since 0.1.0
   */
  refetch: (reason?: RefetchReason) => void;
}

/**
 * Fluent builder for declaring reactive data queries.
 *
 * @typeParam TData - Raw data type returned by the fetcher.
 * @typeParam TError - Error type stored in state. Defaults to `unknown`.
 * @typeParam TParams - Parameters passed to the fetcher. Defaults to `void`.
 * @typeParam TSelected - Projected data emitted by {@link QueryBuilder.select}. Defaults to `TData`.
 *
 * @remarks
 * The builder is immutable from the consumer viewpoint: each step returns a retargeted
 * `QueryBuilder<...>` with updated type parameters for strong inference. `fetcher(...)`
 * sets `TData` and resets `TSelected` to the same type; `select(...)` transforms `TSelected`;
 * `params(...)` sets `TParams` based on its argument.
 *
 * @public
 * @since 0.1.0
 */
export interface QueryBuilder<
  TData,
  TError = unknown,
  TParams = void,
  TSelected = TData
> {
  /**
   * Defines the query key. Required.
   *
   * @example
   * .key(['users', organizationId])
   *
   * @public
   * @since 0.1.0
   */
  key: (key: QueryKey) => QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Defines the fetcher used to load data. Must return an `Observable`
   * and an abort signal is provided for cancellation when you aren't using Angular's HttpClient.
   *
   * Sets `TData` to `TD` and resets `TSelected` to `TD` as a fresh projection base.
   *
   * @example
   * .fetcher(userId => http.get<User>(`/api/users/${userId}`))
   *
   * @public
   * @since 0.1.0
   */
  fetcher<TD>(
    value: QueryFetcher<TParams, TD>
  ): QueryBuilder<TD, TError, TParams, TD>;

  /**
   * Configures how long the data is considered fresh, in milliseconds.
   * While fresh, automatic refetches are skipped unless explicitly triggered.
   *
   * @example
   * .staleTime(60_000) // 1 minute
   *
   * @public
   * @since 0.1.0
   */
  staleTime(ms: number): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Configures garbage-collection delay after the last subscriber releases the data, in milliseconds.
   *
   * @example
   * .gcTime(10 * 60_000) // 10 minutes
   *
   * @public
   * @since 0.1.0
   */
  gcTime(ms: number): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Configures retry behavior for failed fetches.
   *
   * @example
   * .retryWith({ strategy: 'exponential', baseDelayMs: 500, maxAttempts: 5 })
   *
   * @public
   * @since 0.1.0
   */
  retryWith(
    strategy: RetryStrategy
  ): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Sets static or reactive parameters passed to the fetcher.
   * Accepts a plain value, an RxJS `Observable`, or an Angular signal-like (a callable returning `TP`).
   *
   * Inference: `params(x)` sets `TParams = typeof x`.
   *
   * @example
   * // Static
   * .params({ page: 1 })
   *
   * // Observable
   * .params(page$)
   *
   * // Angular Signal (or any callable returning a value)
   * .params(pageSignal)
   *
   * @public
   * @since 0.1.0
   */
  params<TP>(
    parameter: TP | Observable<TP> | SignalLike<TP>
  ): QueryBuilder<TData, TError, TP, TSelected>;

  /**
   * Projects the current selected value (`TSelected`) into a new shape `TNext`.
   * Use this to derive view-friendly slices without recomputing in templates.
   *
   * @example
   * .select(users => users.map(u => u.email)) // TSelected becomes string[]
   *
   * @public
   * @since 0.1.0
   */
  select<TNext>(
    mapper: SelectFn<TSelected, TNext>
  ): QueryBuilder<TData, TError, TParams, TNext>;

  /**
   * Custom equality for `data$` emissions on `TSelected`. Defaults to strict equality.
   * Useful for deep structures to avoid spurious UI updates.
   *
   * @example
   * .distinctWith((a, b) => deepEqual(a, b))
   *
   * @public
   * @since 0.1.0
   */
  distinctWith(
    equal: (a: TSelected | undefined, b: TSelected | undefined) => boolean
  ): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Custom equality used to detect parameter changes that should trigger a refetch.
   * Defaults to strict equality on `TParams`.
   *
   * @example
   * .paramsEqualWith((a, b) => deepEqual(a, b))
   *
   * @public
   * @since 0.1.0
   */
  paramsEqualWith(
    equal: (a: TParams, b: TParams) => boolean
  ): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Enables or disables the query. Accepts a boolean, an `Observable<boolean>`,
   * or an Angular signal-like. When disabled, automatic refetches are paused but
   * the cached data is retained.
   *
   * @example
   * .enabledWhen(isFeatureEnabled$)
   * .enabledWhen(() => form.valid) // signal-like
   *
   * @public
   * @since 0.1.0
   */
  enabledWhen(
    value: boolean | Observable<boolean> | SignalLike<boolean>
  ): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Automatically refetches when the window regains focus.
   *
   * @example
   * .refetchOnWindowFocus(true)
   *
   * @public
   * @since 0.1.0
   */
  refetchOnWindowFocus(
    value: boolean
  ): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Automatically refetches when the network goes back online.
   *
   * @example
   * .refetchOnNetworkReconnect(true)
   *
   * @public
   * @since 0.1.0
   */
  refetchOnNetworkReconnect(
    value: boolean
  ): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Polls at a fixed interval (in milliseconds) while there is at least one subscriber.
   *
   * @example
   * .pollEvery(15_000) // 15s
   *
   * @public
   * @since 0.1.0
   */
  pollEvery(ms: number): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Finalizes the builder and returns the reactive query interface.
   *
   * @example
   * const query = queryBuilder<User[]>()
   *   .key(['users'])
   *   .staleTime(60_000)
   *   .fetcher(() => http.get<User[]>('/api/users'))
   *   .build();
   *
   * @public
   * @since 0.1.0
   */
  build(): BuiltQuery<TSelected, TError>;
}

class QueryBuilderImpl<
  TData,
  TError = unknown,
  TParams = void,
  TSelected = TData
> implements QueryBuilder<TData, TError, TParams, TSelected>
{
  private queryKey!: QueryKey;
  private _fetcher!: QueryFetcher<TParams, TData>;
  private _staleTime = this.queryClient.defaults().staleTime;
  private _gcTime = this.queryClient.defaults().gcTime;
  private retry: RetryStrategy = this.queryClient.defaults().retry;
  private enabled$: Observable<boolean> = of(true);
  private params$: Observable<TParams> = of(undefined as TParams);
  private selector?: SelectFn<TData, TSelected>;
  private equal?: (
    a: TSelected | undefined,
    b: TSelected | undefined
  ) => boolean;
  private refetchOnFocus = this.queryClient.defaults().refetchOnFocus;
  private refetchOnReconnect = this.queryClient.defaults().refetchOnReconnect;
  private pollingInterval?: number;
  private paramsEqual?: (a: TParams, b: TParams) => boolean;

  private readonly refetch$ = new BehaviorSubject<RefetchReason>('manual');

  public constructor(private readonly queryClient: QueryClient) {}

  /** @inheritdoc */
  public paramsEqualWith(equal: (a: TParams, b: TParams) => boolean) {
    this.paramsEqual = equal;
    return this;
  }

  /** @inheritdoc */
  public key(key: QueryKey) {
    this.queryKey = key;
    return this;
  }

  /** @inheritdoc */
  public fetcher<TD>(fetchFn: QueryFetcher<TParams, TD>) {
    this._fetcher = fetchFn as unknown as QueryFetcher<TParams, TData>;
    return this as unknown as QueryBuilderImpl<TD, TError, TParams, TD>;
  }

  /** @inheritdoc */
  public staleTime(ms: number) {
    this._staleTime = ms;
    return this;
  }

  /** @inheritdoc */
  public gcTime(ms: number) {
    this._gcTime = ms;
    return this;
  }

  /** @inheritdoc */
  public retryWith(strategy: RetryStrategy) {
    this.retry = strategy;
    return this;
  }

  /** @inheritdoc */
  public params<TP>(
    parameter: TP | Observable<TP> | SignalLike<TP>
  ): QueryBuilder<TData, TError, TP, TSelected> {
    if (isObservable(parameter)) {
      this.params$ = parameter as unknown as Observable<TParams>;
    } else if (isSignal(parameter) || isSignalLike(parameter)) {
      this.params$ = toObservable(
        parameter as Signal<TParams>
      ) as unknown as Observable<TParams>;
    } else {
      this.params$ = of(parameter) as unknown as Observable<TParams>;
    }
    return this as unknown as QueryBuilderImpl<TData, TError, TP, TSelected>;
  }

  /** @inheritdoc */
  public select<TNext>(mapper: SelectFn<TSelected, TNext>) {
    this.selector = mapper as unknown as SelectFn<TData, TSelected>;
    return this as unknown as QueryBuilderImpl<TData, TError, TParams, TNext>;
  }

  /** @inheritdoc */
  public distinctWith(
    equal: (a: TSelected | undefined, b: TSelected | undefined) => boolean
  ) {
    this.equal = equal;
    return this;
  }

  /** @inheritdoc */
  public enabledWhen(
    value: boolean | Observable<boolean> | SignalLike<boolean>
  ) {
    if (isObservable(value)) {
      this.enabled$ = value;
    } else if (isSignal(value) || isSignalLike(value)) {
      this.enabled$ = toObservable(value as Signal<boolean>);
    } else {
      this.enabled$ = of(value);
    }
    return this;
  }

  /** @inheritdoc */
  public refetchOnWindowFocus(value: boolean) {
    this.refetchOnFocus = value;
    return this;
  }

  /** @inheritdoc */
  public refetchOnNetworkReconnect(value: boolean) {
    this.refetchOnReconnect = value;
    return this;
  }

  /** @inheritdoc */
  public pollEvery(ms: number) {
    this.pollingInterval = ms;
    return this;
  }

  /** @inheritdoc */
  public build(): BuiltQuery<TSelected, TError> {
    if (!this.queryKey) throw new Error('Query key is required. Use .key(...)');
    if (!this._fetcher)
      throw new Error('Query fetcher is required. Use .fetcher(...)');

    const hashed = hashQueryKey(this.queryKey);
    const state$ = this.queryClient.queries.get$(hashed) as BehaviorSubject<
      QueryState<TData, TError>
    >;

    const focus$ =
      this.refetchOnFocus && isBrowser()
        ? fromEvent(window, 'focus').pipe(map(() => 'focus' as const))
        : EMPTY;
    const online$ =
      this.refetchOnReconnect && isBrowser()
        ? fromEvent(window, 'online').pipe(map(() => 'reconnect' as const))
        : EMPTY;
    const poll$ = this.pollingInterval
      ? interval(this.pollingInterval).pipe(map(() => 'interval' as const))
      : EMPTY;
    const invalidations$ = this.queryClient.invalidations$().pipe(
      filter((predicate) => predicate(hashed, new Set())),
      map(() => 'manual' as const)
    );
    const paramsChanged$ = this.params$.pipe(
      distinctUntilChanged(this.paramsEqual ?? ((a, b) => a === b)),
      map(() => 'params' as const)
    );

    const runFetch$ = defer(() => {
      const abortController = new AbortController();
      state$.next({ ...state$.value, status: 'loading', isFetching: true });

      const run$ = this.params$.pipe(
        switchMap((currentParams) =>
          this._fetcher(currentParams, abortController.signal).pipe(
            tap({
              next: (data) =>
                state$.next({
                  status: 'success',
                  data,
                  isFetching: false,
                  updatedAt: Date.now(),
                  error: undefined,
                }),
              error: (error) =>
                state$.next({
                  ...state$.value,
                  status: 'error',
                  error,
                  isFetching: false,
                }),
            }),
            finalize(() => abortController.abort())
          )
        )
      );

      return this.queryClient.retryWithBackoff(() => run$, this.retry);
    });

    const trigger$ = merge(
      this.refetch$,
      focus$,
      online$,
      poll$,
      invalidations$,
      paramsChanged$
    );

    const selected$ = combineLatest([
      state$,
      this.enabled$.pipe(startWith(true)),
    ]).pipe(
      switchMap(([state, enabled]) => {
        const isStale =
          !state.updatedAt ||
          Date.now() - (state.updatedAt ?? 0) >= this._staleTime;
        if (!enabled) return of(state);
        return isStale && !state.isFetching
          ? runFetch$.pipe(map(() => state$.value))
          : of(state);
      }),
      map((state) =>
        this.selector
          ? state.data !== undefined
            ? (this.selector as unknown as SelectFn<TSelected, TSelected>)(
                state.data as unknown as TSelected
              )
            : undefined
          : (state.data as TSelected | undefined)
      ),
      distinctUntilChanged(this.equal ?? ((a, b) => a === b))
    );

    const data$ = defer(() => {
      this.queryClient.retain(hashed);

      const subscription = trigger$
        .pipe(
          switchMap(() => this.enabled$),
          filter(Boolean),
          switchMap(() => runFetch$)
        )
        .subscribe();

      return selected$.pipe(
        finalize(() => {
          subscription.unsubscribe();
          this.queryClient.release(hashed, this._gcTime);
        })
      );
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const error$ = state$.pipe(map((s) => s.error));
    const status$ = state$.pipe(map((s) => s.status));
    const isFetching$ = state$.pipe(map((s) => s.isFetching));

    return {
      data$,
      error$,
      status$,
      isFetching$,
      refetch: (reason: RefetchReason = 'manual') => this.refetch$.next(reason),
    };
  }
}

/**
 * Factory for {@link QueryBuilder}. Creates a fluent builder to declare a reactive query.
 *
 * @typeParam TData - Raw data returned by the fetcher.
 * @typeParam TError - Error type emitted by state.
 * @typeParam TParams - Parameters passed to the fetcher.
 * @typeParam TSelected - Emitted type after {@link QueryBuilder.select}.
 *
 * @example
 * const q = queryBuilder<UserDto[]>(queryClient)
 *   .key(['users'])
 *   .params(page) // value | Observable | Angular signal-like
 *   .fetcher(p => http.get<UserDto[]>('/api/users', { params: { page: p } }))
 *   .staleTime(60_000)
 *   .build();
 *
 * q.data$.subscribe(...);
 *
 * @remarks
 * This function does not perform any side effects. It only constructs a builder bound to the
 * provided {@link QueryClient}. Cache retention and release are driven by subscriptions to
 * {@link BuiltQuery.data$}.
 *
 * @see QueryBuilder
 * @see BuiltQuery
 *
 * @public
 * @since 0.1.0
 */
export function queryBuilder<
  TData,
  TError = unknown,
  TParams = void,
  TSelected = TData
>(queryClient: QueryClient): QueryBuilder<TData, TError, TParams, TSelected> {
  return new QueryBuilderImpl<TData, TError, TParams, TSelected>(queryClient);
}
