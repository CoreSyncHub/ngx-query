import { BaseCache } from './base-cache';
import { EvictPredicate, QueryState } from './types';

/** QueryStates cache with “safe” LRU eviction. */
export class QueryCache extends BaseCache<QueryState> {
  public constructor(capacity: number, canEvict: EvictPredicate) {
    super(capacity, canEvict, () => ({
      status: 'idle',
      isFetching: false,
    }));
  }
}
