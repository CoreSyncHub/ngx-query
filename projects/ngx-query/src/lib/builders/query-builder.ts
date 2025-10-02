import {
  BehaviorSubject,
  combineLatest,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  fromEvent,
  interval,
  map,
  merge,
  Observable,
  of,
  shareReplay,
  startWith,
  switchMap,
  takeUntil,
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

/** Result of built query */
export interface BuiltQuery<TSelected = unknown, TError = unknown> {
  data$: Observable<TSelected | undefined>;
  error$: Observable<TError | undefined>;
  status$: Observable<QueryState['status']>;
  isFetching$: Observable<boolean>;
  refetch: (reason?: RefetchReason) => void;
}

/** Fluent builder for query */
export function queryBuilder<TParams = void, TData = unknown, TSelected = TData>(
  queryClient: QueryClient
) {
  const config = queryClient.defaults();

  let queryKey: QueryKey;
  let fetcher: QueryFetcher<TParams, TData>;
  let staleTime = config.staleTime;
  let gcTime = config.gcTime;
  let retry: RetryStrategy = config.retry;
  let enabled$: Observable<boolean> = of(true);
  let selector: SelectFn<TData, TSelected> | undefined;
  let refetchOnFocus = config.refetchOnFocus;
  let refetchOnReconnect = config.refetchOnReconnect;
  let pollingInterval: number | undefined;

  const refetch$ = new BehaviorSubject<RefetchReason>('manual');

  function key(value: QueryKey) {
    queryKey = value;
    return api;
  }

  function fetcherFn(value: QueryFetcher<TParams, TData>) {
    fetcher = value;
    return api;
  }

  function stale(ms: number) {
    staleTime = ms;
    return api;
  }

  function gc(ms: number) {
    gcTime = ms;
    return api;
  }

  function retryWith(strategy: RetryStrategy) {
    retry = strategy;
    return api;
  }

  function select(mapper: SelectFn<TData, TSelected>) {
    selector = mapper;
    return api;
  }

  function enabledWhen(value: boolean | Observable<boolean>) {
    enabled$ = typeof value === 'boolean' ? of(value) : value;
    return api;
  }

  function refetchOnWindowFocus(value: boolean) {
    refetchOnFocus = value;
    return api;
  }

  function refetchOnNetworkReconnect(value: boolean) {
    refetchOnReconnect = value;
    return api;
  }

  function pollEvery(ms: number) {
    pollingInterval = ms;
    return api;
  }

  function build(): BuiltQuery<TSelected> {
    if (!queryKey) throw new Error('Query key is required. Use .key(...)');
    if (!fetcher) throw new Error('Query fetcher is required. Use .fetcher(...)');

    const hashed = hashQueryKey(queryKey);
    const state$ = queryClient.queries.get$(hashed);

    const focus$ = refetchOnFocus
      ? fromEvent(window, 'focus').pipe(map(() => 'focus' as const))
      : EMPTY;
    const online$ = refetchOnReconnect
      ? fromEvent(window, 'online').pipe(map(() => 'reconnect' as const))
      : EMPTY;
    const poll$ = pollingInterval
      ? interval(pollingInterval).pipe(map(() => 'interval' as const))
      : EMPTY;
    const invalidations$ = queryClient.invalidations$().pipe(
      filter((predicate) => predicate(hashed, new Set())),
      map(() => 'manual' as const)
    );

    const abortController = new AbortController();
    const stop$ = defer(
      () =>
        new Observable<void>((subscriber) => {
          abortController.abort();
          subscriber.complete();
        })
    );

    const runFetch$ = defer(() => {
      state$.next({ ...state$.value, status: 'loading', isFetching: true });
      const run$ = fetcher(undefined as TParams, abortController.signal).pipe(
        tap((data) =>
          state$.next({ status: 'success', data, isFetching: false, updatedAt: Date.now() })
        )
      );
      return queryClient.retryWithBackoff(() => run$, retry);
    });

    const trigger$ = merge(refetch$, focus$, online$, poll$, invalidations$);

    const pipeline$ = combineLatest([state$, enabled$.pipe(startWith(true))]).pipe(
      switchMap(([state, enabled]) => {
        const isStale = !state.updatedAt || Date.now() - (state.updatedAt ?? 0) >= staleTime;
        if (!enabled) return of(state);
        return isStale && !state.isFetching ? runFetch$.pipe(map(() => state$.value)) : of(state);
      }),
      map((state) =>
        selector
          ? state.data !== undefined
            ? selector(state.data as TData)
            : undefined
          : (state.data as TSelected | undefined)
      ),
      distinctUntilChanged()
    );

    const data$ = defer(() => {
      queryClient.retain(hashed);
      return pipeline$;
    }).pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
      tap({ complete: () => queryClient.release(hashed, gcTime) })
    );

    const error$ = state$.pipe(map((s) => s.error));
    const status$ = state$.pipe(map((s) => s.status));
    const isFetching$ = state$.pipe(map((s) => s.isFetching));

    trigger$
      .pipe(
        switchMap(() => enabled$.pipe(takeUntil(stop$))),
        filter(Boolean),
        switchMap(() => runFetch$)
      )
      .subscribe();

    return {
      data$,
      error$,
      status$,
      isFetching$,
      refetch: (reason: RefetchReason = 'manual') => refetch$.next(reason),
    };
  }

  const api = {
    key,
    fetcher: fetcherFn,
    staleTime: stale,
    gcTime: gc,
    retryWith,
    select,
    enabledWhen,
    refetchOnWindowFocus,
    refetchOnNetworkReconnect,
    pollEvery,
    build,
  };

  return api;
}
