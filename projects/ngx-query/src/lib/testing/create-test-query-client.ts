import { QueryClient } from '../core/query-client';
import { QueryConfig } from '../core/types';

/** Creates a QueryClient for testing with short timings. */
export function createTestQueryClient(overrides?: Partial<QueryConfig>): QueryClient {
  return new QueryClient({
    staleTime: 5,
    gcTime: 50,
    retry: 0,
    refetchOnFocus: false,
    refetchOnReconnect: false,
    ...overrides,
  });
}
