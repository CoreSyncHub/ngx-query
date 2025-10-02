import { BehaviorSubject } from 'rxjs';
import { MutationState } from './types';

/** Reactive states of mutations by key */
export class MutationCache {
  private readonly store = new Map<string, BehaviorSubject<MutationState>>();

  public get$(hashedKey: string): BehaviorSubject<MutationState> {
    let subject = this.store.get(hashedKey);
    if (!subject) {
      subject = new BehaviorSubject<MutationState>({ status: 'idle', isMutating: false });
      this.store.set(hashedKey, subject);
    }
    return subject;
  }

  public set(hashedKey: string, state: MutationState): void {
    this.get$(hashedKey).next(state);
  }
}
