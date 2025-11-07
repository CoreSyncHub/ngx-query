import {
  BehaviorSubject,
  defer,
  distinctUntilChanged,
  EMPTY,
  endWith,
  exhaustMap,
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
  Subject,
  Subscription,
  switchMap,
  take,
  tap,
  withLatestFrom,
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
import { isSignal, runInInjectionContext, Signal } from '@angular/core';
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
   * Triggers a refetch immediately, even if data is still fresh (bypasses `staleTime`).
   * Optionally provide a {@link RefetchReason} for instrumentation.
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
   * Defines the query key. Required. Accepts a static value, an RxJS `Observable`,
   * or an Angular Signal. When the key changes, the builder will switch to the
   * new cache entry (retain/release are handled automatically).
   *
   * @example
   * .key(['user', userId])               // static
   * .key(userKey$)                       // Observable<QueryKey>
   * .key(computed(() => ['user', id()])) // Signal<QueryKey>
   *
   *
   * @public
   * @since 0.1.0
   */
  key: (
    key: QueryKey | Observable<QueryKey> | SignalLike<QueryKey>
  ) => QueryBuilder<TData, TError, TParams, TSelected>;

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
   * Configures retry policy for fetch errors. Retries are scheduled using
   * {@link QueryClient.retryWithBackoff} with exponential backoff.
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
   * Projects the current selected value into a new shape. `select` is composable:
   * multiple calls build a pipeline applied in order.
   *
   * @example
   * .select(users => users.filter(u => u.active))
   * .select(active => active.map(u => u.email)) // runs after the previous select
   *
   * @remarks
   * Each `select` transforms the evolving `TSelected` type for subsequent calls.
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
   * or an Angular Signal. When disabled, automatic refetches are paused but
   * the cached data is retained.
   *
   * @example
   * .enabledWhen(isFeatureEnabled$)
   * .enabledWhen(() => form.valid)
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
   * Registers a callback invoked **after all `select()` projections have been applied**
   * and once per successful fetch cycle.
   * @param cb - Callback receiving the selected data.
   *
   * @example
   * .onSuccess(data => console.log('Fetched', data))
   *
   * @public
   * @since 0.3.0
   */
  onSuccess(
    cb: (data: TSelected) => void
  ): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Registers a callback invoked **after all `select()` projections have been applied**
   * and once per failed fetch cycle.
   * @param cb - Callback receiving the error.
   *
   * @example
   * .onError(error => console.error('Fetch error', error))
   *
   * @public
   * @since 0.3.0
   */
  onError(
    cb: (error: TError) => void
  ): QueryBuilder<TData, TError, TParams, TSelected>;

  /**
   * Invoked after each fetch cycle completes, whether it succeeds or fails.
   * Executes after `.select()` projections and before the next refetch decision.
   * @param cb - Callback receiving the selected data or `undefined`, and the error or `undefined`.
   *
   * @example
   * .onSettled((data, error) => {
   *   if (error) {
   *     console.error('Fetch error', error);
   *   } else {
   *     console.log('Fetched', data);
   *   }
   * })
   *
   * @public
   * @since 0.3.0
   */
  onSettled(
    cb: (data: TSelected | undefined, error: TError | undefined) => void
  ): QueryBuilder<TData, TError, TParams, TSelected>;

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
   * @remarks
   * Subscribing to `data$` retains the active hashed key; when the key changes, the
   * previous key is released. When the last subscriber unsubscribes, the entry is
   * released and eligible for GC after `gcTime`.
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
  private queryKey$?: Observable<QueryKey>;
  private _fetcher!: QueryFetcher<TParams, TData>;
  private _staleTime = this.queryClient.defaults().staleTime;
  private _gcTime = this.queryClient.defaults().gcTime;
  private retry: RetryStrategy = this.queryClient.defaults().retry;
  private enabled$: Observable<boolean> = of(true);
  private params$: Observable<TParams> = of(undefined as TParams);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly selectors: SelectFn<any, any>[] = [];
  private equal?: (
    a: TSelected | undefined,
    b: TSelected | undefined
  ) => boolean;
  private refetchOnFocus = this.queryClient.defaults().refetchOnFocus;
  private refetchOnReconnect = this.queryClient.defaults().refetchOnReconnect;
  private pollingInterval?: number;
  private paramsEqual?: (a: TParams, b: TParams) => boolean;

  private readonly successHandlers: Array<(d: TSelected) => void> = [];
  private readonly errorHandlers: Array<(e: TError) => void> = [];
  private readonly settledHandlers: Array<
    (d: TSelected | undefined, e: TError | undefined) => void
  > = [];

  private readonly refetch$ = new Subject<RefetchReason>();

  public constructor(private readonly queryClient: QueryClient) {}

  private to$<T>(v: T | Observable<T> | SignalLike<T>): Observable<T> {
    if (isObservable(v)) return v;
    if (isSignal(v)) {
      return this.ensureInjectorAndRun(() => toObservable(v as Signal<T>));
    }
    if (isSignalLike(v)) {
      return this.ensureInjectorAndRun(() =>
        toObservable(v as unknown as Signal<T>)
      );
    }
    return of(v);
  }

  private ensureInjectorAndRun<T>(factory: () => T): T {
    if (!this.queryClient.injector) {
      throw new Error(
        'QueryClient.env injector is missing. Use provideQueryClient() (factory) or pass Observables instead of signals.'
      );
    }
    return runInInjectionContext(this.queryClient.injector, factory);
  }

  private applySelectors<T = unknown>(input: T): unknown {
    return this.selectors.reduce<unknown>((acc, fn) => {
      return acc === undefined ? undefined : fn(acc);
    }, input);
  }

  /** @inheritdoc */
  public paramsEqualWith(equal: (a: TParams, b: TParams) => boolean) {
    this.paramsEqual = equal;
    return this;
  }

  /** @inheritdoc */
  public key(key: QueryKey | Observable<QueryKey> | SignalLike<QueryKey>) {
    this.queryKey$ = this.to$(key);
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
    this.params$ = this.to$(parameter) as unknown as Observable<TParams>;
    return this as unknown as QueryBuilderImpl<TData, TError, TP, TSelected>;
  }

  /** @inheritdoc */
  public select<TNext>(mapper: SelectFn<TSelected, TNext>) {
    this.selectors.push(mapper as unknown as SelectFn<TData, TSelected>);
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
    this.enabled$ =
      typeof value === 'boolean' ? of(value) : this.to$<boolean>(value);
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
  public onSuccess(cb: (d: TSelected) => void) {
    this.successHandlers.push(cb);
    return this;
  }

  /** @inheritdoc */
  public onError(cb: (e: TError) => void) {
    this.errorHandlers.push(cb);
    return this;
  }

  /** @inheritdoc */
  public onSettled(
    cb: (d: TSelected | undefined, e: TError | undefined) => void
  ) {
    this.settledHandlers.push(cb);
    return this;
  }

  /** @inheritdoc */
  public build(): BuiltQuery<TSelected, TError> {
    if (!this.queryKey$)
      throw new Error('Query key is required. Use .key(...)');
    if (!this._fetcher)
      throw new Error('Query fetcher is required. Use .fetcher(...)');

    const active$ = this.queryKey$.pipe(
      map((k) => hashQueryKey(k)),
      distinctUntilChanged()
    );

    const scoped$ = active$.pipe(
      map((h) => {
        const subject$ = this.queryClient.queries.get$(h) as BehaviorSubject<
          QueryState<TData, TError>
        >;
        const state$ = subject$.asObservable();

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
          filter((predicate) => predicate(h, new Set())),
          map(() => 'manual' as const)
        );
        const paramsChanged$ = this.params$.pipe(
          distinctUntilChanged(this.paramsEqual ?? ((a, b) => a === b)),
          map(() => 'params' as const)
        );
        const enabledTick$ = this.enabled$.pipe(
          distinctUntilChanged(),
          filter(Boolean),
          map(() => 'enabled' as const)
        );

        const runFetch$ = defer(() => {
          const abortController = new AbortController();

          subject$.next({
            ...subject$.value,
            status: 'loading',
            isFetching: true,
          });

          const run$ = this.params$.pipe(
            switchMap((currentParams) =>
              this._fetcher(currentParams, abortController.signal).pipe(
                take(1),
                tap({
                  next: (data) =>
                    subject$.next({
                      status: 'success',
                      data,
                      isFetching: false,
                      updatedAt: Date.now(),
                      error: undefined,
                    }),
                  error: (error) =>
                    subject$.next({
                      ...subject$.value,
                      status: 'error',
                      error,
                      isFetching: false,
                    }),
                }),
                finalize(() => abortController.abort())
              )
            )
          );

          return this.queryClient
            .retryWithBackoff(() => run$, this.retry)
            .pipe(endWith(true));
        });

        const trigger$ = merge(
          of<'init'>('init'),
          this.refetch$,
          focus$,
          online$,
          poll$,
          invalidations$,
          paramsChanged$,
          enabledTick$
        );

        const driver$ = this.enabled$.pipe(
          switchMap((enabled) => {
            if (!enabled) return EMPTY;
            return trigger$.pipe(
              withLatestFrom(state$),
              exhaustMap(([tick, state]) => {
                const needsFirst = state.status === 'idle' && !state.isFetching;
                const isStale =
                  !state.updatedAt ||
                  Date.now() - (state.updatedAt ?? 0) >= this._staleTime;
                const external = tick !== 'init';
                const shouldRefetch =
                  needsFirst || (!state.isFetching && (isStale || external));
                return shouldRefetch ? runFetch$ : EMPTY;
              })
            );
          }),
          shareReplay({ bufferSize: 1, refCount: true })
        );

        const selected$ = state$.pipe(
          map((s) =>
            s.data === undefined
              ? undefined
              : (this.applySelectors(s.data) as TSelected)
          ),
          distinctUntilChanged(this.equal ?? ((a, b) => a === b)),
          shareReplay({ bufferSize: 1, refCount: true })
        );

        const errors$ = state$.pipe(
          map((s) => s.error as TError | undefined),
          map((e) =>
            e == null ? undefined : ({ error: e, tick: Date.now() } as const)
          ),
          filter(
            (x): x is { error: NonNullable<TError>; tick: number } =>
              x !== undefined
          ),
          map((x) => x.error),
          shareReplay({ bufferSize: 1, refCount: true })
        );

        const successEvents$ = selected$.pipe(
          filter((v): v is TSelected => v !== undefined),
          tap((val) => {
            for (const cb of this.successHandlers) cb(val);
            for (const cb of this.settledHandlers) cb(val, undefined);
          })
        );

        const errorEvents$ = errors$.pipe(
          tap((err) => {
            for (const cb of this.errorHandlers) cb(err);
            for (const cb of this.settledHandlers) cb(undefined, err);
          })
        );

        return { h, state$, driver$, selected$, successEvents$, errorEvents$ };
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    let refCount = 0;
    let currentH: string | undefined;
    let retainSub: Subscription | null = null;
    let driverSub: Subscription | null = null;
    let okSub: Subscription | null = null;
    let errSub: Subscription | null = null;

    // =========================
    // Multi-Streams
    // =========================
    const start = () => {
      if (refCount++ > 0) return;

      retainSub = scoped$.subscribe(({ h }) => {
        if (currentH && currentH !== h)
          this.queryClient.release(currentH, this._gcTime);
        this.queryClient.retain(h);
        currentH = h;
      });
      driverSub = scoped$.pipe(switchMap((s) => s.driver$)).subscribe();
      okSub = scoped$.pipe(switchMap((s) => s.successEvents$)).subscribe();
      errSub = scoped$.pipe(switchMap((s) => s.errorEvents$)).subscribe();
    };

    const stop = () => {
      if (--refCount > 0) return;

      errSub?.unsubscribe();
      errSub = null;
      okSub?.unsubscribe();
      okSub = null;
      driverSub?.unsubscribe();
      driverSub = null;
      retainSub?.unsubscribe();
      retainSub = null;

      if (currentH) {
        this.queryClient.release(currentH, this._gcTime);
        currentH = undefined;
      }
    };

    const withActivation = <T>(inner$: Observable<T>) =>
      defer(() => {
        start();
        return inner$.pipe(finalize(stop));
      });

    const data$ = withActivation(
      scoped$.pipe(switchMap((s) => s.selected$))
    ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const status$ = withActivation(
      scoped$.pipe(switchMap((s) => s.state$.pipe(map((st) => st.status))))
    );
    const error$ = withActivation(
      scoped$.pipe(switchMap((s) => s.state$.pipe(map((st) => st.error))))
    );
    const isFetching$ = withActivation(
      scoped$.pipe(switchMap((s) => s.state$.pipe(map((st) => st.isFetching))))
    );

    return {
      data$,
      error$,
      status$,
      isFetching$,
      refetch: (reason: RefetchReason = 'manual') => this.refetch$.next(reason),
    };

    // const data$ = defer(() => {
    //   let currentH: string | undefined;

    //   const retainSub = scoped$.subscribe(({ h }) => {
    //     if (currentH && currentH !== h)
    //       this.queryClient.release(currentH, this._gcTime);
    //     this.queryClient.retain(h);
    //     currentH = h;
    //   });

    //   const driverSub = scoped$.pipe(switchMap((s) => s.driver$)).subscribe();
    //   const okSub = scoped$
    //     .pipe(switchMap((s) => s.successEvents$))
    //     .subscribe();
    //   const errSub = scoped$.pipe(switchMap((s) => s.errorEvents$)).subscribe();

    //   return scoped$.pipe(
    //     switchMap((s) => s.selected$),
    //     finalize(() => {
    //       errSub.unsubscribe();
    //       okSub.unsubscribe();
    //       driverSub.unsubscribe();
    //       retainSub.unsubscribe();
    //       if (currentH) this.queryClient.release(currentH, this._gcTime);
    //     })
    //   );
    // }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    // const status$ = scoped$.pipe(
    //   switchMap((s) => s.state$.pipe(map((st) => st.status)))
    // );
    // const error$ = scoped$.pipe(
    //   switchMap((s) => s.state$.pipe(map((st) => st.error)))
    // );
    // const isFetching$ = scoped$.pipe(
    //   switchMap((s) => s.state$.pipe(map((st) => st.isFetching)))
    // );

    // return {
    //   data$,
    //   error$,
    //   status$,
    //   isFetching$,
    //   refetch: (reason: RefetchReason = 'manual') => this.refetch$.next(reason),
    // };
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
