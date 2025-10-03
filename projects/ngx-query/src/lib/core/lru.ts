/**
 * Minimal amortized O(1) LRU based on Map (insertion order).
 * - get: moves the key to the end (most recent)
 * - set: inserts and evicts the oldest if capacity is reached
 * - delete: removes without affecting others
 */
export class LruCache<TKey, TValue> {
  private readonly map = new Map<TKey, TValue>();

  public constructor(private readonly _capacity: number) {
    if (!Number.isFinite(_capacity) || _capacity < 1) {
      throw new Error('LruCache capacity must be a positive finite number');
    }
  }

  /** Retrieves the value and marks the key as most recent. */
  public get(key: TKey): TValue | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // move-to-end
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /** Adds or updates, then evicts the oldest if needed. */
  public set(key: TKey, value: TValue): void {
    if (this.map.has(key)) {
      this.map.delete(key);
      this.map.set(key, value);
      return;
    }
    this.map.set(key, value);
    if (this.map.size > this._capacity) {
      const oldestKey = this.oldest;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
  }

  /** Removes the key if present. */
  public delete(key: TKey): void {
    this.map.delete(key);
  }

  /** Max capacity. */
  public get capacity(): number {
    return this._capacity;
  }

  /** Returns the oldest key without removing it. */
  public get oldest(): TKey | undefined {
    const iter = this.map.keys();
    const first = iter.next();
    return first.done ? undefined : first.value;
  }

  /** Current size (useful for tests). */
  public get size(): number {
    return this.map.size;
  }
}
