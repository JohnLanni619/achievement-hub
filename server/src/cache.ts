/**
 * Small in-memory TTL cache. Provider APIs are rate limited and slow, and
 * the UI re-requests the same data while navigating, so we memoize results
 * per connection for a short time. Concurrent callers share one in-flight
 * request.
 */
export class TtlCache {
  private entries = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

  constructor(
    private ttlMs: number,
    private maxEntries = 1000,
  ) {}

  async getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

    const value = load();
    this.entries.set(key, { expiresAt: now + this.ttlMs, value });
    // Don't cache failures.
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return value;
  }

  deleteByPrefix(prefix: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}
