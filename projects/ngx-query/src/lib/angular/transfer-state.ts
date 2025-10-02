import { makeStateKey, TransferState } from '@angular/core';
import { QueryKey } from '../core/types';
import { hashQueryKey } from '../helpers/key-hasher';

export function writeToTransferState<T>(ts: TransferState, key: QueryKey, data: T): void {
  ts.set<T>(makeStateKey<T>(hashQueryKey(key)), data);
}

export function readFromTransferState<T>(ts: TransferState, key: QueryKey): T | undefined {
  const k = makeStateKey<T>(hashQueryKey(key));
  return ts.hasKey(k) ? ts.get<T>(k, undefined as unknown as T) : undefined;
}
