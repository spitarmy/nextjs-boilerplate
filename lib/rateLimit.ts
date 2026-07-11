/**
 * In-memory rate limiter for Vercel serverless functions.
 *
 * Each serverless instance maintains its own Map, so this provides
 * per-instance rate limiting. Not a global lock, but significantly
 * reduces spam from a single client hitting the same warm instance.
 */

interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the next request would be allowed (only set when blocked). */
  retryAfter?: number;
}

// ── Config ──────────────────────────────────────────────────────────
const PER_USER_MAX = 10;          // max assessments per user per window
const GLOBAL_MAX = 60;            // max assessments across ALL users per window
const WINDOW_MS = 5 * 60 * 1000;  // 5 minutes in milliseconds
const CLEANUP_INTERVAL_MS = 60 * 1000; // purge stale entries every 60 s

// ── State ───────────────────────────────────────────────────────────
/** userId → array of request timestamps (ms) */
const perUserMap = new Map<string, number[]>();

/** Global request timestamps (ms) */
let globalTimestamps: number[] = [];

/** Timestamp of last cleanup sweep */
let lastCleanup = Date.now();

// ── Helpers ─────────────────────────────────────────────────────────

/** Remove timestamps older than the current window. */
function pruneTimestamps(timestamps: number[], now: number): number[] {
  const cutoff = now - WINDOW_MS;
  // Timestamps are appended in order, so we can binary-skip to the first valid one.
  let i = 0;
  while (i < timestamps.length && timestamps[i] <= cutoff) i++;
  return i === 0 ? timestamps : timestamps.slice(i);
}

/** Periodic sweep to avoid unbounded memory growth. */
function maybeCleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [uid, ts] of perUserMap) {
    const pruned = pruneTimestamps(ts, now);
    if (pruned.length === 0) {
      perUserMap.delete(uid);
    } else {
      perUserMap.set(uid, pruned);
    }
  }
  globalTimestamps = pruneTimestamps(globalTimestamps, now);
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Check whether a request from `userId` should be allowed.
 *
 * When the request is blocked, `retryAfter` indicates the number of
 * seconds until the oldest timestamp in the window expires (i.e. when
 * a slot frees up).
 */
export function checkRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  maybeCleanup(now);

  // ── Global limit ────────────────────────────────────────────────
  globalTimestamps = pruneTimestamps(globalTimestamps, now);

  if (globalTimestamps.length >= GLOBAL_MAX) {
    const oldestGlobal = globalTimestamps[0];
    const retryAfter = Math.ceil((oldestGlobal + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
  }

  // ── Per-user limit ──────────────────────────────────────────────
  let userTimestamps = perUserMap.get(userId) ?? [];
  userTimestamps = pruneTimestamps(userTimestamps, now);

  if (userTimestamps.length >= PER_USER_MAX) {
    const oldestUser = userTimestamps[0];
    const retryAfter = Math.ceil((oldestUser + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
  }

  // ── Allowed – record the request ────────────────────────────────
  userTimestamps.push(now);
  perUserMap.set(userId, userTimestamps);
  globalTimestamps.push(now);

  return { allowed: true };
}
