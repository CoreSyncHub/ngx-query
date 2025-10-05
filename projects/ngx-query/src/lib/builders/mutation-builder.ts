import { catchError, map, Observable, tap, throwError } from 'rxjs';
import {
  MutateFn,
  MutationState,
  QueryKey,
  RetryStrategy,
} from '../core/types';
import { QueryClient } from '../core/query-client';
import { hashQueryKey } from '../helpers/key-hasher';

export interface OptimisticCtx {
  /**
   * Read current cached data for a query.
   * @param key Query key (same shape you use in queries).
   */
  getQueryData<T>(key: QueryKey): T | undefined;

  /**
   * Set cached data for a query.
   * Accepts a value or an updater function receiving previous data.
   * @param key Query key (same shape you use in queries).
   */
  setQueryData<T>(key: QueryKey, data: T | ((old: T | undefined) => T)): void;

  /**
   * Patch helper. Equivalent to `setQueryData(key, patch(getQueryData(key)))`.
   */
  patchQueryData<T>(key: QueryKey, patch: (old: T | undefined) => T): void;

  /**
   * Invalidate queries by predicate.
   */
  invalidateQueries(predicate: (key: QueryKey) => boolean): void;
}

/**
 * Type for the `keys` argument in {@link MutationBuilder.affects}.
 *
 * @typeParam TVariables - Variables passed to the mutation.
 *
 * @public
 * @since 0.1.0
 */
export type AffectKeys<TVariables> =
  | QueryKey
  | QueryKey[]
  | ((variables: TVariables) => QueryKey | QueryKey[]);

/**
 * Result of a built mutation.
 *
 * @typeParam TData - Data returned by the mutation function.
 * @typeParam TError - Error type stored in state. Defaults to `unknown`.
 * @typeParam TVariables - Variables passed to the mutation. Defaults to `unknown`.
 *
 * @public
 * @since 0.1.0
 */
export interface BuiltMutation<
  TData = unknown,
  TVariables = unknown,
  TError = unknown
> {
  /**
   * Executes the mutation with the provided variables.
   * Returns a cold Observable that emits the resolved data or errors.
   *
   * @example
   * mutation.mutate({ id: '42' }).subscribe();
   *
   * @public
   * @since 0.1.0
   */
  mutate$: (variables: TVariables) => Observable<TData>;

  /**
   * Executes the mutation with the provided variables.
   * Auto subscribes and returns void.
   *
   * @example
   * mutation.mutate({ id: '42' });
   *
   * @public
   * @since 0.1.0
   */
  mutate: (variables: TVariables) => void;

  /** Emits the last successful data or `undefined`. */
  data$: Observable<TData | undefined>;

  /** Emits the last error or `undefined`. */
  error$: Observable<TError | undefined>;

  /** Emits `'idle' | 'loading' | 'success' | 'error'`. */
  status$: Observable<MutationState['status']>;

  /** Emits `true` while a mutation is in-flight. */
  isMutating$: Observable<boolean>;
}

/**
 * Fluent builder for declaring mutations.
 *
 * @typeParam TData - Data returned by the mutation function.
 * @typeParam TError - Error type stored in state. Defaults to `unknown`.
 * @typeParam TVariables - Variables passed to the mutation. Defaults to `unknown`.
 *
 * @remarks
 * - `mutateFn(...)` fixes `TData` by inference.
 * - `optimistic` and `rollback` enable optimistic UI with convenient cache helpers.
 * - `onSuccess` runs after a successful mutation (great for cache reconciliation).
 * - `affects` lists queries impacted by the mutation and auto-invalidates them on success.
 * - Retry is handled by {@link QueryClient.retryWithBackoff}.
 *
 * @public
 * @since 0.1.0
 */
export interface MutationBuilder<
  TData,
  TVariables = unknown,
  TError = unknown
> {
  /**
   * Sets the mutation key. Required.
   *
   * @example
   * .key(['users', 'create'])
   *
   * @public
   * @since 0.1.0
   */
  key(key: QueryKey): MutationBuilder<TData, TVariables, TError>;

  /**
   * Defines the mutation function. Must return an Observable and honor the provided AbortSignal.
   * Sets `TData` to `TD` via inference.
   *
   * @example
   * .mutateFn(input => http.post<User>('/api/users', input))
   *
   * @public
   * @since 0.1.0
   */
  mutateFn<TD>(
    fn: MutateFn<TVariables, TD>
  ): MutationBuilder<TD, TVariables, TError>;

  /**
   * Sets the retry strategy for failed mutations.
   *
   * @example
   * .retryWith({ strategy: 'exponential', baseDelayMs: 300, maxAttempts: 5 })
   *
   * @public
   * @since 0.1.0
   */
  retryWith(
    strategy: RetryStrategy
  ): MutationBuilder<TData, TVariables, TError>;

  /**
   * Applies an optimistic update before the mutation runs.
   * Receives variables and an immutable cache context with helpers.
   *
   * @returns An optional token used later by `rollback` (e.g. temp id).
   *
   * @example
   * .optimistic((v, { patchQueryData }) => {
   *   const temp: User = { id: 'temp', ...v };
   *   patchQueryData<User[]>(['users'], current => ([...(current ?? []), temp]));
   *   return temp.id; // token for rollback
   * })
   *
   * @public
   * @since 0.1.0
   */
  optimistic<TResult>(
    apply: (variables: TVariables, ctx: OptimisticCtx) => TResult | void
  ): MutationBuilder<TData, TVariables, TError>;

  /**
   * Rolls back the optimistic update if the mutation fails.
   * Receives the same variables, the error, the cache context and the token returned by `optimistic`.
   *
   * @example
   * .rollback((v, err, { patchQueryData }, token) => {
   *   patchQueryData<User[]>(['users'], current => (current ?? []).filter(user => user.id !== token));
   * })
   *
   * @public
   * @since 0.1.0
   */
  rollback(
    restore: (
      variables: TVariables,
      error: TError,
      ctx: OptimisticCtx,
      token?: unknown
    ) => void
  ): MutationBuilder<TData, TVariables, TError>;

  /**
   * Callback executed on success (after state is updated).
   * Ideal for cache reconciliation or side effects.
   *
   * @example
   * .onSuccess((data, vars, { patchQueryData }) => {
   *   patchQueryData<User[]>(['users'], current => (current ?? []).map(user => user.id === 'temp' ? data : user));
   * })
   *
   * @public
   * @since 0.1.0
   */
  onSuccess(
    callback: (data: TData, variables: TVariables, ctx: OptimisticCtx) => void
  ): MutationBuilder<TData, TVariables, TError>;

  /**
   * Declare which queries are impacted by this mutation.
   * They will be invalidated automatically on success.
   *
   * @example
   * .affects([['users']])
   * // or
   * .affects(vars => [['user', vars.id], ['users']])
   *
   * @public
   * @since 0.1.0
   */
  affects(
    keys: AffectKeys<TVariables>
  ): MutationBuilder<TData, TVariables, TError>;

  /**
   * Finalizes the builder and returns the reactive mutation interface.
   *
   * @example
   * const m = mutationBuilder<User, unknown, CreateUser>(qc)
   *   .key(['users', 'create'])
   *   .mutateFn(input => http.post<User>('/api/users', input))
   *   .build();
   *
   * @public
   * @since 0.1.0
   */
  build(): BuiltMutation<TData, TVariables, TError>;
}

class MutationBuilderImpl<TData, TVariables = unknown, TError = unknown>
  implements MutationBuilder<TData, TVariables, TError>
{
  private mutationKey!: QueryKey;
  private _mutateFn!: MutateFn<TVariables, TData>;
  private retry: RetryStrategy = 1;

  private optimisticApply?: (
    variables: TVariables,
    ctx: OptimisticCtx
  ) => unknown | void;
  private rollbackApply?: (
    variables: TVariables,
    error: TError,
    ctx: OptimisticCtx,
    token?: unknown
  ) => void;
  private onSuccessCallback?: (
    data: TData,
    variables: TVariables,
    ctx: OptimisticCtx
  ) => void;
  private affectedKeys?:
    | QueryKey
    | QueryKey[]
    | ((variables: TVariables) => QueryKey | QueryKey[]);

  public constructor(private readonly queryClient: QueryClient) {}

  /** @inheritdoc */
  public key(key: QueryKey) {
    this.mutationKey = key;
    return this;
  }

  /** @inheritdoc */
  public mutateFn<TD>(fn: MutateFn<TVariables, TD>) {
    this._mutateFn = fn as unknown as MutateFn<TVariables, TData>;
    return this as unknown as MutationBuilderImpl<TD, TVariables, TError>;
  }

  /** @inheritdoc */
  public retryWith(strategy: RetryStrategy) {
    this.retry = strategy;
    return this;
  }

  /** @inheritdoc */
  public optimistic<TResult>(
    apply: (variables: TVariables, ctx: OptimisticCtx) => TResult | void
  ) {
    this.optimisticApply = apply;
    return this;
  }

  /** @inheritdoc */
  public rollback(
    restore: (
      variables: TVariables,
      error: TError,
      ctx: OptimisticCtx,
      token?: unknown
    ) => void
  ) {
    this.rollbackApply = restore;
    return this;
  }

  /** @inheritdoc */
  public onSuccess(
    callback: (data: TData, variables: TVariables, ctx: OptimisticCtx) => void
  ) {
    this.onSuccessCallback = callback;
    return this;
  }

  /** @inheritdoc */
  public affects(keys: AffectKeys<TVariables>) {
    this.affectedKeys = keys;
    return this;
  }

  /** @inheritdoc */
  public build(): BuiltMutation<TData, TVariables, TError> {
    if (!this.mutationKey)
      throw new Error('Mutation key is required. Use .key(...)');
    if (!this._mutateFn)
      throw new Error('Mutate function is required. Use .mutateFn(...)');

    const hashed = hashQueryKey(this.mutationKey);
    const state$ = this.queryClient.mutations.get$(
      hashed
    ) as unknown as import('rxjs').BehaviorSubject<
      MutationState<TData, TError, TVariables>
    >;

    const ctx: OptimisticCtx = {
      getQueryData: <T>(key: QueryKey): T | undefined => {
        return this.queryClient.getQueryData<T>(key);
      },
      setQueryData: <T>(
        key: QueryKey,
        data: T | ((old: T | undefined) => T)
      ) => {
        const prev = this.queryClient.getQueryData<T>(key);
        const next =
          typeof data === 'function'
            ? (data as (o: T | undefined) => T)(prev)
            : data;
        this.queryClient.setQueryData(key, next);
      },
      patchQueryData: <T>(key: QueryKey, patch: (old: T | undefined) => T) => {
        const prev = this.queryClient.getQueryData<T>(key);
        const next = patch(prev);
        this.queryClient.setQueryData(key, next);
      },
      invalidateQueries: (predicate: (key: QueryKey) => boolean) => {
        this.queryClient.invalidateQueries(predicate);
      },
    };

    const toArray = (key: QueryKey | QueryKey[]) =>
      Array.isArray(key) && (key.length === 0 || Array.isArray(key[0]))
        ? (key as QueryKey[])
        : [key];

    const perform$ = (variables: TVariables): Observable<TData> => {
      const abort = new AbortController();

      let token: unknown | void;
      try {
        token = this.optimisticApply?.(variables, ctx);
      } catch {
        /* no-op optimistic errors */
      }

      state$.next({
        ...state$.value,
        status: 'loading',
        isMutating: true,
        variables,
      });

      const run$ = this._mutateFn(variables, abort.signal).pipe(
        tap((data) => {
          state$.next({
            status: 'success',
            isMutating: false,
            data,
            variables,
            updatedAt: Date.now(),
          });

          try {
            this.onSuccessCallback?.(data, variables, ctx);
          } catch {
            /* ignore onSuccess handler errors */
          }

          if (this.affectedKeys) {
            const keys =
              typeof this.affectedKeys === 'function'
                ? toArray(this.affectedKeys(variables))
                : toArray(this.affectedKeys);
            const targets = new Set(keys.map((k) => hashQueryKey(k)));
            this.queryClient.invalidateQueries((hashedKey) =>
              targets.has(hashedKey)
            );
          }
        }),
        catchError((err) => {
          try {
            this.rollbackApply?.(variables, err as TError, ctx, token);
          } catch {
            /* ignore rollback handler errors */
          }

          state$.next({
            ...state$.value,
            status: 'error',
            isMutating: false,
            error: err as TError,
            variables,
            updatedAt: Date.now(),
          });
          return throwError(() => err);
        })
      );

      return this.queryClient.retryWithBackoff(() => run$, this.retry);
    };

    const data$ = state$.pipe(map((s) => s.data));
    const error$ = state$.pipe(map((s) => s.error));
    const status$ = state$.pipe(map((s) => s.status));
    const isMutating$ = state$.pipe(map((s) => s.isMutating));

    return {
      mutate$: perform$,
      mutate: (v: TVariables) => {
        perform$(v).subscribe();
      },
      data$,
      error$,
      status$,
      isMutating$,
    };
  }
}

/**
 * Factory for {@link MutationBuilder}. Creates a fluent builder to declare a mutation.
 *
 * @typeParam TData - Data returned by the mutation function.
 * @typeParam TError - Error type stored in state.
 * @typeParam TVariables - Variables passed to the mutation.
 *
 * @example
 * const createUser = mutationBuilder<User, unknown, CreateUser>(queryClient)
 *   .key(['users', 'create'])
 *   .optimistic(v => queryClient.setQueryData<User[]>(['users'], current => [...(current ?? []), { id: 'temp', ...v }]))
 *   .rollback(() => queryClient.invalidateQueries({ keys: [['users']] }))
 *   .mutateFn(v => http.post<User>('/api/users', v))
 *   .build();
 *
 * createUser.mutate({ name: 'Ada', email: 'ada@dev' }).subscribe();
 *
 * @public
 * @since 0.1.0
 */
export function mutationBuilder<
  TData = unknown,
  TVariables = unknown,
  TError = unknown
>(queryClient: QueryClient): MutationBuilder<TData, TVariables, TError> {
  return new MutationBuilderImpl<TData, TVariables, TError>(queryClient);
}
