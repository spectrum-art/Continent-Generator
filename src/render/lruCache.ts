export class LruCache<T> {
  private readonly limit: number;
  private readonly entries = new Map<string, T>();
  private readonly order: string[] = [];

  constructor(limit: number) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.touch(key);
    return value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, value);
    this.touch(key);
    while (this.order.length > this.limit) {
      const oldest = this.order.shift();
      if (!oldest) {
        break;
      }
      this.entries.delete(oldest);
    }
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  clear(): void {
    this.entries.clear();
    this.order.length = 0;
  }

  private touch(key: string): void {
    const index = this.order.indexOf(key);
    if (index >= 0) {
      this.order.splice(index, 1);
    }
    this.order.push(key);
  }
}

export function getOrCreateCached<T>(
  cache: LruCache<T>,
  key: string,
  create: () => T,
): { value: T; fromCache: boolean } {
  const existing = cache.get(key);
  if (existing !== undefined) {
    return {
      value: existing,
      fromCache: true,
    };
  }
  const value = create();
  cache.set(key, value);
  return {
    value,
    fromCache: false,
  };
}
