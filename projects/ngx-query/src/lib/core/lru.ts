/** Minimalistic LRU to evict QueryStates. */
export class LruCache<TKey, TValue> {
  private readonly cache = new Map<TKey, TValue>();
  private order: TKey[] = [];

  public constructor(private readonly capacity: number) {}

  public get(key: TKey): TValue | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) this.touch(key);
    return value;
  }

  public set(key: TKey, value: TValue): void {
    if (!this.cache.has(key) && this.cache.size >= this.capacity) {
      const oldestKey = this.order.shift();
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }

    this.cache.set(key, value);
    this.touch(key);
  }

  public delete(key: TKey): void {
    this.cache.delete(key);
    this.order = this.order.filter((k) => k !== key);
  }

  private touch(key: TKey): void {
    this.order = this.order.filter((k) => k !== key);
    this.order.push(key);
  }
}
