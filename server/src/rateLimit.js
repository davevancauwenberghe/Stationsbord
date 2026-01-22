// server/src/rateLimit.js
export function createSimpleRateLimiter({ perSecond = 3, burst = 5 } = {}) {
  // Token bucket per process (not per IP) to avoid our own service spamming iRail.
  let tokens = perSecond + burst;
  let lastRefill = Date.now();

  function refill() {
    const now = Date.now();
    const elapsed = (now - lastRefill) / 1000;
    if (elapsed <= 0) return;
    const add = elapsed * perSecond;
    tokens = Math.min(perSecond + burst, tokens + add);
    lastRefill = now;
  }

  return function takeToken() {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    return false;
  };
}
