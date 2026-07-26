/**
 * Real token-bucket rate limiter. Unlike the old app — where per-file limits
 * were applied independently inside each segment thread (so a "200 KB/s"
 * cap with 16 segments actually allowed ~16x that), every byte written by
 * every segment of every download goes through `consume()` on a SHARED
 * bucket, so the configured rate is the real aggregate rate, full stop.
 *
 * unlimitedBps <= 0 means "no limit" — consume() resolves immediately.
 */
export class TokenBucket {
  private capacity: number;
  private tokens: number;
  private lastRefill = Date.now();

  constructor(private ratePerSec: number) {
    this.capacity = Math.max(ratePerSec, 1);
    this.tokens = this.capacity;
  }

  setRate(ratePerSec: number): void {
    this.ratePerSec = ratePerSec;
    this.capacity = Math.max(ratePerSec, 1);
    this.tokens = Math.min(this.tokens, this.capacity);
  }

  private refill(): void {
    if (this.ratePerSec <= 0) return;
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.ratePerSec);
    this.lastRefill = now;
  }

  async consume(bytes: number): Promise<void> {
    if (this.ratePerSec <= 0) return; // unlimited
    for (;;) {
      this.refill();
      if (this.tokens >= bytes) { this.tokens -= bytes; return; }
      const deficit = bytes - this.tokens;
      const waitMs = Math.min(250, Math.max(5, (deficit / this.ratePerSec) * 1000));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}
