import { catchError, Observable, tap } from 'rxjs';
import { MutateFn, MutationState, QueryKey, RetryStrategy } from '../core/types';
import { QueryClient } from '../core/query-client';
import { hashQueryKey } from '../helpers/key-hasher';

/** Result of built mutation */
export interface BuiltMutation<TData = unknown, TError = unknown, TVariables = unknown> {
  mutate: (variables: TVariables) => Observable<TData>;
  data$: Observable<TData | undefined>;
  error$: Observable<TError | undefined>;
  status$: Observable<MutationState['status']>;
  isMutating$: Observable<boolean>;
}

/** Fluent builder for mutation */
export function mutationBuilder<TVariables = unknown, TData = unknown>(queryClient: QueryClient) {
  let mutationKey: QueryKey;
  let mutateFn: MutateFn<TVariables, TData>;
  let retry: RetryStrategy = queryClient.defaults().retry;

  let optimisticApply: ((variables: TVariables) => void) | undefined;
  let rollbackApply: ((variables: TVariables, error: unknown) => void) | undefined;

  function key(key: QueryKey) {
    mutationKey = key;
    return api;
  }

  function mutate(fn: MutateFn<TVariables, TData>) {
    mutateFn = fn;
    return api;
  }

  function retryWith(strategy: RetryStrategy) {
    retry = strategy;
    return api;
  }

  function optimistic(apply: (variables: TVariables) => void) {
    optimisticApply = apply;
    return api;
  }

  function rollback(restore: (variables: TVariables, error: unknown) => void) {
    rollbackApply = restore;
    return api;
  }

  function build(): BuiltMutation<TData, unknown, TVariables> {
    if (!mutationKey) throw new Error('Mutation key is required. Use .key(...)');
    if (!mutateFn) throw new Error('Mutate function is required. Use .mutate(...)');

    const hashed = hashQueryKey(mutationKey);
    const state$ = queryClient.mutations.get$(hashed);

    const perform$ = (variables: TVariables): Observable<TData> => {
      const abort = new AbortController();
      optimisticApply?.(variables);
      state$.next({ status: 'loading', isMutating: true, variables });

      const run$ = mutateFn(variables, abort.signal).pipe(
        tap((data) =>
          state$.next({
            status: 'success',
            data,
            isMutating: false,
            variables,
            updatedAt: Date.now(),
          })
        ),
        catchError((error) => {
          rollbackApply?.(variables, error);
          state$.next({
            status: 'error',
            error,
            isMutating: false,
            variables,
            updatedAt: Date.now(),
          });
          throw error;
        })
      );

      return queryClient.retryWithBackoff(() => run$, retry);
    };

    return {
      mutate: perform$,
      data$: state$.pipe(tap() /** Cold readers */) as unknown as Observable<TData | undefined>,
      error$: state$.pipe(tap() /** Cold readers */) as unknown as Observable<unknown | undefined>,
      status$: state$.pipe(tap() /** Cold readers */) as unknown as Observable<
        MutationState['status']
      >,
      isMutating$: state$.pipe(tap() /** Cold readers */) as unknown as Observable<boolean>,
    };
  }

  const api = {
    key,
    mutateFn: mutate,
    optimistic,
    rollback,
    retryWith,
    build,
  };
}
