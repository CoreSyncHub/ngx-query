import { Observable } from 'rxjs';

/** Typed Query Key. Recommended: JSON-serializable array. */
export type QueryKey<TQueryKey = unknown> = Readonly<TQueryKey>;

/** Reason for a refetch triggered by the system. */
export type RefetchReason =
  | 'manual'
  | 'focus'
  | 'reconnect'
  | 'interval'
  | 'retry';

/** Memoized selector applied to raw data. */
export type SelectFn<TData, TSelectedData> = (data: TData) => TSelectedData;

/** Retry strategy. Fixed number or pure function. */
export type RetryStrategy<TError = unknown> =
  | number
  | ((attempt: number, error: TError) => boolean);

/** State of a query. */
export interface QueryState<TData = unknown, TError = unknown> {
  status: 'idle' | 'loading' | 'error' | 'success';
  data?: TData;
  error?: TError;
  isFetching: boolean;
  updatedAt?: number;
}

/** State of a mutation. */
export interface MutationState<
  TData = unknown,
  TError = unknown,
  TVariables = unknown
> {
  status: 'idle' | 'loading' | 'error' | 'success';
  data?: TData;
  error?: TError;
  variables?: TVariables;
  isMutating: boolean;
  updatedAt?: number;
}

/** Global injectable configuration for queries. */
export interface QueryConfig {
  staleTime: number;
  gcTime: number;
  retry: RetryStrategy;
  refetchOnFocus: boolean;
  refetchOnReconnect: boolean;
  maxQueryCacheSize: number;
  maxMutationCacheSize: number;
}

/** Pure observable fetch function. Use abortSignal to cancel. */
export type QueryFetcher<TParams, TData> = (
  params: TParams,
  abortSignal: AbortSignal
) => Observable<TData>;

/** Pure observable mutate function. Use abortSignal to cancel. */
export type MutateFn<TVariables, TData> = (
  variables: TVariables,
  abortSignal: AbortSignal
) => Observable<TData>;

/** Invalidate predicate */
export type InvalidatePredicate = (
  hashedKey: string,
  tags: ReadonlySet<string>
) => boolean;

export type EvictPredicate = (hashedKey: string) => boolean;
