// Per-IP token-bucket rate limiter for Vercel serverless functions.
//
// Storage: in-memory `Map<key, bucket>` scoped to the running function instance.
// CAVEATS:
//   - Vercel may run several concurrent instances of the same function. Each
//     instance has its own Map, so the *effective* per-IP rate limit can be
//     N× the configured rate (where N = concurrent instances). For a small
//     admin-style tool this is acceptable; for stricter limits move to a
//     shared store (Vercel KV, Upstash Redis).
//   - State is lost on cold start. That's fine — losing tokens means a
//     small grace window for legitimate users right after a deploy.
//   - We bound memory: a tiny TTL sweep on every check evicts stale buckets,
//     and the Map is hard-capped at MAX_KEYS to defend against IP spoofing /
//     enumeration floods.
//
// Token bucket semantics:
//   - bucket.tokens starts at `limit` and refills at `limit / windowMs`.
//   - On each request: refill (lazy), then consume 1 token if available.
//   - Returns { allowed, remaining, resetMs, limit }.

const MAX_KEYS = 5000;
const SWEEP_INTERVAL_MS = 60_000;

// Default policies. Endpoints not listed inherit DEFAULT.
// Keyed by the trailing URL segment after `/api/` (e.g. /api/upload → 'upload').
const POLICIES = {
  upload:         { limit: 30,  windowMs: 60_000 },
  'asset-delete': { limit: 10,  windowMs: 60_000 },
  clear:          { limit: 10,  windowMs: 60_000 },
  delete:         { limit: 30,  windowMs: 60_000 },
  'missing-patch':{ limit: 60,  windowMs: 60_000 },
  review:         { limit: 60,  windowMs: 60_000 },
  trash:          { limit: 30,  windowMs: 60_000 },
  // Read-only and frequently polled endpoints get a generous bucket.
  missing:        { limit: 240, windowMs: 60_000 },
  uploaded:       { limit: 240, windowMs: 60_000 },
  DEFAULT:        { limit: 120, windowMs: 60_000 },
};

const buckets = new Map();
let lastSweep = 0;

export function policyFor(name) {
  return POLICIES[name] || POLICIES.DEFAULT;
}

// Resolve the client IP from the most-trusted-first header set. Vercel terminates
// TLS upstream, so `x-forwarded-for` / `x-real-ip` are populated. We pick the
// left-most address in `x-forwarded-for` (the original client per RFC 7239
// custom; Vercel rewrites the chain to start with the real client).
export function clientIp(req) {
  const h = req?.headers || {};
  const xff = h['x-forwarded-for'] || h['X-Forwarded-For'];
  if (typeof xff === 'string' && xff.length) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const xri = h['x-real-ip'] || h['X-Real-IP'];
  if (typeof xri === 'string' && xri.length) return xri.trim();
  // Vercel-specific fallback. `req.socket?.remoteAddress` is undefined on the
  // edge runtime; `unknown` keys IP-less requests under one bucket which is
  // fine — they share a (small) limit.
  return req?.socket?.remoteAddress || 'unknown';
}

function sweep(now) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now - b.updated > b.windowMs * 2) buckets.delete(k);
  }
  // Hard cap: if we still have too many keys, drop the oldest.
  if (buckets.size > MAX_KEYS) {
    const arr = Array.from(buckets.entries()).sort((a, b) => a[1].updated - b[1].updated);
    const drop = arr.slice(0, buckets.size - MAX_KEYS);
    for (const [k] of drop) buckets.delete(k);
  }
}

// Pure check (no side-effects on the response). Used by the test suite.
export function check(name, ip, now = Date.now()) {
  sweep(now);
  const policy = policyFor(name);
  const key = `${name}:${ip}`;
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: policy.limit, updated: now, windowMs: policy.windowMs, limit: policy.limit };
    buckets.set(key, b);
  } else {
    // Refill proportional to elapsed time. Cap at policy.limit.
    const elapsed = now - b.updated;
    const refill = (elapsed / policy.windowMs) * policy.limit;
    b.tokens = Math.min(policy.limit, b.tokens + refill);
    b.updated = now;
    b.windowMs = policy.windowMs;
    b.limit = policy.limit;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(b.tokens),
      resetMs: Math.ceil(((policy.limit - b.tokens) / policy.limit) * policy.windowMs),
      limit: policy.limit,
    };
  }
  // Time until 1 full token is restored.
  const need = 1 - b.tokens;
  const resetMs = Math.ceil((need / policy.limit) * policy.windowMs);
  return {
    allowed: false,
    remaining: 0,
    resetMs,
    limit: policy.limit,
  };
}

// Express/Vercel middleware-style helper. Sets the standard headers and, on
// limit, ends the response with 429. Returns true if the request was rate-limited
// (caller should NOT continue).
export function applyRateLimit(req, res, name) {
  const ip = clientIp(req);
  const r = check(name, ip);
  res.setHeader('X-RateLimit-Limit', String(r.limit));
  res.setHeader('X-RateLimit-Remaining', String(r.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(r.resetMs / 1000)));
  if (!r.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(r.resetMs / 1000)));
    res.status(429).json({ error: 'rate limit exceeded', retryAfterMs: r.resetMs });
    return true;
  }
  return false;
}

// For tests: clear all buckets.
export function _resetBuckets() {
  buckets.clear();
  lastSweep = 0;
}

// For tests / introspection.
export function _bucketCount() { return buckets.size; }
