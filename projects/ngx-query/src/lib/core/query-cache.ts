import { BehaviorSubject } from 'rxjs';
import { QueryState } from './types';

/** Reactive container for query states */
export class QueryCache {
  private readonly store = new Map<string, BehaviorSubject<QueryState>>();

  public get$(hashedKey: string): BehaviorSubject<QueryState> {
    let subject = this.store.get(hashedKey);
    if (!subject) {
      subject = new BehaviorSubject<QueryState>({ status: 'idle', isFetching: false });
      this.store.set(hashedKey, subject);
    }
    return subject;
  }

  public peek(hashedKey: string): QueryState | undefined {
    return this.store.get(hashedKey)?.value;
  }

  public set(hashedKey: string, state: QueryState): void {
    this.get$(hashedKey).next(state);
  }

  public entries(): IterableIterator<[string, BehaviorSubject<QueryState>]> {
    return this.store.entries();
  }

  public delete(hashedKey: string): void {
    const subject = this.store.get(hashedKey);
    if (subject) {
      subject.complete();
      this.store.delete(hashedKey);
    }
  }
}
