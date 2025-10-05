/**
 * @packageDocumentation
 * Public API Surface of @coresync/ngx-query
 */

export { provideQueryClient } from './lib/angular/providers';
export { QUERY_CONFIG, QUERY_CLIENT } from './lib/angular/tokens';
export { injectQueryClient } from './lib/angular/inject-query-client';
export type { QueryConfig } from './lib/core/types';

export { QueryClient } from './lib/core/query-client';
export type {
  QueryKey,
  QueryState,
  MutationState,
  RetryStrategy,
  RefetchReason,
  InvalidatePredicate,
} from './lib/core/types';

export {
  queryBuilder,
  type BuiltQuery,
  type QueryBuilder,
} from './lib/builders/query-builder';
export {
  mutationBuilder,
  type BuiltMutation,
  type MutationBuilder,
  type AffectKeys,
  type OptimisticCtx,
} from './lib/builders/mutation-builder';

export { isSignalLike, type SignalLike } from './lib/helpers/signal-like';

// Router / SSRs
export { QueryPreloadResolver } from './lib/angular/resolver';
export {
  writeToTransferState,
  readFromTransferState,
} from './lib/angular/transfer-state';
