import { BaseCache } from './base-cache';
import { EvictPredicate, MutationState } from './types';

/** MutationStates cache with “safe” LRU eviction. */
export class MutationCache extends BaseCache<MutationState> {
  public constructor(capacity: number, canEvict: EvictPredicate) {
    super(capacity, canEvict, () => ({
      status: 'idle',
      isMutating: false,
    }));
  }
}
