import { TooManyAttemptsError } from "../domain/user.js";
import type { AttemptLimiter, Clock } from "../domain/ports.js";

/**
 * Sliding window of failure timestamps per key. Per process: fine for one instance; with several, swap this
 * adapter for one backed by a shared store.
 */
export class InMemoryAttemptLimiter implements AttemptLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly clock: Clock = { now: () => new Date() }) {}

  check(key: string, limit: number, windowMs: number): void {
    const recent = this.recent(key, windowMs);
    if (recent.length >= limit) {
      const oldest = recent[0] ?? this.clock.now().getTime();
      throw new TooManyAttemptsError(Math.max(1, Math.ceil((oldest + windowMs - this.clock.now().getTime()) / 1000)));
    }
  }

  record(key: string, windowMs: number): void {
    const recent = this.recent(key, windowMs);
    recent.push(this.clock.now().getTime());
    this.hits.set(key, recent);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private recent(key: string, windowMs: number): number[] {
    const since = this.clock.now().getTime() - windowMs;
    const kept = (this.hits.get(key) ?? []).filter((time) => time > since);
    if (kept.length === 0) this.hits.delete(key);
    else this.hits.set(key, kept);
    return kept;
  }
}
