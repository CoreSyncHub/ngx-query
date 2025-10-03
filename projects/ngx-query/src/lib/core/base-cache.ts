import { BehaviorSubject } from 'rxjs';
import { LruCache } from './lru';

export abstract class BaseCache<TState> {
  protected readonly subjects = new Map<string, BehaviorSubject<TState>>();
  protected readonly order: LruCache<string, true>;
  protected readonly canEvict: (hashedKey: string) => boolean;
  private readonly initialStateFactory: () => TState;

  public constructor(
    capacity: number,
    canEvict: (hashedKey: string) => boolean,
    initialStateFactory: () => TState
  ) {
    this.order = new LruCache<string, true>(Math.max(1, capacity));
    this.canEvict = canEvict;
    this.initialStateFactory = initialStateFactory;
  }

  /** Existing subject or created if absent. Affects LRU order. */
  public get$(hashedKey: string): BehaviorSubject<TState> {
    let subject = this.subjects.get(hashedKey);
    if (!subject) {
      subject = new BehaviorSubject<TState>(this.initialStateFactory());
      this.subjects.set(hashedKey, subject);
      this.touch(hashedKey);
      this.evictIfNeeded();
    } else {
      this.touch(hashedKey);
    }
    return subject;
  }

  public peek(hashedKey: string): TState | undefined {
    return this.subjects.get(hashedKey)?.value;
  }

  public set(hashedKey: string, next: TState): void {
    this.get$(hashedKey).next(next);
    this.touch(hashedKey);
  }

  public delete(hashedKey: string): void {
    const s = this.subjects.get(hashedKey);
    if (s) {
      s.complete();
      this.subjects.delete(hashedKey);
    }
    this.order.delete(hashedKey);
  }

  public entries(): IterableIterator<[string, BehaviorSubject<TState>]> {
    return this.subjects.entries();
  }

  // #region Internal

  protected touch(hashedKey: string): void {
    this.order.set(hashedKey, true);
  }

  protected evictIfNeeded(): void {
    while (this.subjects.size > this.order.capacity) {
      const victim = this.order.oldest;
      if (!victim) break;
      if (this.canEvict(victim)) {
        this.delete(victim);
      } else {
        this.touch(victim);
        if (!this.findAnyEvictable()) break;
      }
    }
  }

  private findAnyEvictable(): boolean {
    for (const key of this.subjects.keys()) if (this.canEvict(key)) return true;
    return false;
  }

  //#endregion
}
