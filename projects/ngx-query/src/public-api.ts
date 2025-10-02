/**
 * @packageDocumentation
 * Public API Surface of @coresync/ngx-query
 */

export { provideQueryClient } from './lib/angular/providers';
export { QUERY_CONFIG } from './lib/angular/tokens';
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

export { queryBuilder, type BuiltQuery } from './lib/builders/query-builder';
export { mutationBuilder, type BuiltMutation } from './lib/builders/mutation-builder';

export { toSignal } from './lib/helpers/to-signal';

// Router / SSRs
export { QueryPreloadResolver } from './lib/angular/resolver';
export { writeToTransferState, readFromTransferState } from './lib/angular/transfer-state';
