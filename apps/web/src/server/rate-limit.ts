/** Cửa sổ rate limit: 24 giờ tính từ lượt đầu tiên, không phải ngày lịch. */
export const DAY_MS = 24 * 60 * 60 * 1_000

export const ANONYMOUS_DAILY_LIMIT = 20
export const REGISTERED_DAILY_LIMIT = 200

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  /** Số giây phải chờ. 0 khi request được phép. */
  retryAfterSeconds: number
  resetAt: number
}

export interface RateLimiterOptions {
  limit: number
  windowMs?: number
  now?: () => number
}

export interface RateLimiter {
  check(key: string): RateLimitResult
  reset(): void
}

interface Bucket {
  count: number
  resetAt: number
}

const SWEEP_THRESHOLD = 5_000

/**
 * Rate limit in-memory cho single-node: reset khi restart và không chia sẻ
 * giữa các instance. Đủ cho bản demo; scale ngang sẽ cần Redis (ADR-008).
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const limit = Math.max(1, Math.floor(options.limit))
  const windowMs = options.windowMs ?? DAY_MS
  const now = options.now ?? Date.now
  const buckets = new Map<string, Bucket>()

  function sweep(current: number): void {
    if (buckets.size < SWEEP_THRESHOLD) return

    for (const [key, bucket] of buckets) {
      if (current >= bucket.resetAt) buckets.delete(key)
    }
  }

  return {
    check(key) {
      const current = now()
      sweep(current)

      const existing = buckets.get(key)

      if (!existing || current >= existing.resetAt) {
        const bucket = { count: 1, resetAt: current + windowMs }
        buckets.set(key, bucket)

        return {
          allowed: true,
          limit,
          remaining: Math.max(0, limit - 1),
          retryAfterSeconds: 0,
          resetAt: bucket.resetAt,
        }
      }

      if (existing.count >= limit) {
        return {
          allowed: false,
          limit,
          remaining: 0,
          retryAfterSeconds: Math.ceil((existing.resetAt - current) / 1_000),
          resetAt: existing.resetAt,
        }
      }

      existing.count += 1

      return {
        allowed: true,
        limit,
        remaining: limit - existing.count,
        retryAfterSeconds: 0,
        resetAt: existing.resetAt,
      }
    },

    reset() {
      buckets.clear()
    },
  }
}

let guestLimiter: RateLimiter | undefined

/** Singleton dùng trong route; test luôn tạo limiter riêng để không dính state. */
export function getGuestChatLimiter(): RateLimiter {
  guestLimiter ??= createRateLimiter({ limit: ANONYMOUS_DAILY_LIMIT })
  return guestLimiter
}

let registeredLimiter: RateLimiter | undefined

/** User đã đăng nhập: quota theo `user.id`, không theo IP dùng chung. */
export function getRegisteredChatLimiter(): RateLimiter {
  registeredLimiter ??= createRateLimiter({ limit: REGISTERED_DAILY_LIMIT })
  return registeredLimiter
}

export const AUTH_ATTEMPT_LIMIT = 10
export const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1_000
export const REGISTER_ATTEMPT_LIMIT = 5
export const REGISTER_ATTEMPT_WINDOW_MS = 60 * 60 * 1_000

let loginLimiter: RateLimiter | undefined

/** Khoá theo `ip:email` để một IP thử nhiều tài khoản vẫn bị chặn. */
export function getLoginLimiter(): RateLimiter {
  loginLimiter ??= createRateLimiter({
    limit: AUTH_ATTEMPT_LIMIT,
    windowMs: AUTH_ATTEMPT_WINDOW_MS,
  })
  return loginLimiter
}

let registerLimiter: RateLimiter | undefined

/** Khoá theo IP: chặn tạo hàng loạt tài khoản từ một máy. */
export function getRegisterLimiter(): RateLimiter {
  registerLimiter ??= createRateLimiter({
    limit: REGISTER_ATTEMPT_LIMIT,
    windowMs: REGISTER_ATTEMPT_WINDOW_MS,
  })
  return registerLimiter
}
