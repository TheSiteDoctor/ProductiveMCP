/**
 * Rate limiting utilities
 */

import { RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS } from '../constants.js';

export class RateLimiter {
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  /**
   * Wait if necessary to respect rate limits
   * Returns immediately if under the limit, otherwise waits
   */
  async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.windowStart;

    // Reset window if it has passed
    if (elapsed >= RATE_LIMIT_WINDOW_MS) {
      this.requestCount = 0;
      this.windowStart = now;
      return;
    }

    // If we've hit the limit, wait for the window to reset
    if (this.requestCount >= RATE_LIMIT_REQUESTS) {
      const waitTime = RATE_LIMIT_WINDOW_MS - elapsed;
      console.error(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Reset after waiting
      this.requestCount = 0;
      this.windowStart = Date.now();
    }
  }

  /**
   * Record that a request was made
   */
  recordRequest(): void {
    this.requestCount++;
  }

  /**
   * Get current rate limit status
   */
  getStatus(): { count: number; limit: number; windowMs: number; remaining: number } {
    const now = Date.now();
    const elapsed = now - this.windowStart;

    // If window has passed, we're at 0
    if (elapsed >= RATE_LIMIT_WINDOW_MS) {
      return {
        count: 0,
        limit: RATE_LIMIT_REQUESTS,
        windowMs: RATE_LIMIT_WINDOW_MS,
        remaining: RATE_LIMIT_REQUESTS,
      };
    }

    return {
      count: this.requestCount,
      limit: RATE_LIMIT_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
      remaining: Math.max(0, RATE_LIMIT_REQUESTS - this.requestCount),
    };
  }
}
