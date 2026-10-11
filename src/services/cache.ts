/** Small LRU + localStorage cache with stale-while-revalidate semantics (TDD §3.3). */

export interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export class SwrCache<T> {
  private readonly mem = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly prefix: string,
    private readonly maxEntries = 20,
    private readonly storage: KeyValueStorage | null = defaultStorage(),
  ) {}

  get(key: string): CacheEntry<T> | null {
    const hit = this.mem.get(key);
    if (hit) {
      this.mem.delete(key);
      this.mem.set(key, hit);
      return hit;
    }
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(this.prefix + key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (typeof entry?.storedAt !== 'number') return null;
      this.remember(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  set(key: string, value: T, now: number): CacheEntry<T> {
    const entry = { value, storedAt: now };
    this.remember(key, entry);
    if (this.storage) {
      try {
        this.storage.setItem(this.prefix + key, JSON.stringify(entry));
      } catch {
        // Quota or privacy mode: the in-memory copy still works.
      }
    }
    return entry;
  }

  private remember(key: string, entry: CacheEntry<T>) {
    this.mem.delete(key);
    this.mem.set(key, entry);
    while (this.mem.size > this.maxEntries) {
      const oldest = this.mem.keys().next().value;
      if (oldest === undefined) break;
      this.mem.delete(oldest);
    }
  }
}

export function isFresh(entry: CacheEntry<unknown>, ttlMs: number, now: number): boolean {
  return now - entry.storedAt < ttlMs;
}

/** Coordinates rounded to 2 dp, as in `wr:wx:{lat2}:{lon2}`. */
export function coordKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}`;
}
