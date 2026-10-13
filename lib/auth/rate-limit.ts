type Entry = { count: number; startedAt: number };

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly limit = 20, private readonly windowMs = 300_000) {}

  check(key: string, now = Date.now()): { allowed: boolean; remaining: number; retryAfter: number } {
    if (this.entries.size > 2000) {
      for (const [entryKey, entry] of this.entries) {
        if (now - entry.startedAt >= this.windowMs) this.entries.delete(entryKey);
      }
      if (this.entries.size > 10000 && !this.entries.has(key)) return { allowed: false, remaining: 0, retryAfter: Math.ceil(this.windowMs / 1000) };
    }
    const current = this.entries.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.entries.set(key, { count: 1, startedAt: now });
      return { allowed: true, remaining: this.limit - 1, retryAfter: 0 };
    }
    if (current.count >= this.limit) return { allowed: false, remaining: 0, retryAfter: Math.ceil((current.startedAt + this.windowMs - now) / 1000) };
    current.count += 1;
    return { allowed: true, remaining: this.limit - current.count, retryAfter: 0 };
  }
}

export const joinRateLimiter = new FixedWindowRateLimiter();
export const spaceCreateRateLimiter = new FixedWindowRateLimiter(10, 300_000);
