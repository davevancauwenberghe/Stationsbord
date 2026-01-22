// rateLimit.js
export function createSimpleRateLimiter({ perSecond = 3, burst = 5 } = {}) {
  perSecond = Math.max(0, Number(perSecond) || 0);
  burst = Math.max(0, Number(burst) || 0);

  // Token bucket per process (not per IP) to avoid our own service spamming iRail.
  const capacity = perSecond + burst;
  let tokens = capacity;
  let lastRefill = Date.now();

  function refill() {
    const now = Date.now();
    const elapsed = (now - lastRefill) / 1000;
    if (elapsed <= 0) return;

    tokens = Math.min(capacity, tokens + elapsed * perSecond);
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
