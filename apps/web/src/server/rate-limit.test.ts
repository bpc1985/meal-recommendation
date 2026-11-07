import { describe, expect, it } from 'vitest'
import {
  ANONYMOUS_DAILY_LIMIT,
  AUTH_ATTEMPT_LIMIT,
  AUTH_ATTEMPT_WINDOW_MS,
  DAY_MS,
  REGISTER_ATTEMPT_LIMIT,
  REGISTERED_DAILY_LIMIT,
  createRateLimiter,
  getLoginLimiter,
  getRegisterLimiter,
} from './rate-limit'

describe('createRateLimiter', () => {
  it('cho đúng limit lượt rồi chặn lượt kế tiếp', () => {
    const now = 1_000_000
    const limiter = createRateLimiter({ limit: 2, now: () => now })

    expect(limiter.check('ip-1').allowed).toBe(true)
    expect(limiter.check('ip-1').allowed).toBe(true)
    expect(limiter.check('ip-1').allowed).toBe(false)
  })

  it('trả remaining giảm dần', () => {
    const limiter = createRateLimiter({ limit: 3, now: () => 0 })

    expect(limiter.check('key').remaining).toBe(2)
    expect(limiter.check('key').remaining).toBe(1)
    expect(limiter.check('key').remaining).toBe(0)
  })

  it('tính retryAfter theo cửa sổ 24 giờ', () => {
    let now = 1_000_000
    const limiter = createRateLimiter({ limit: 1, now: () => now })

    limiter.check('key')
    const blocked = limiter.check('key')

    expect(blocked.retryAfterSeconds).toBe(DAY_MS / 1_000)

    now += 60 * 60 * 1_000
    expect(limiter.check('key').retryAfterSeconds).toBe(23 * 60 * 60)
  })

  it('mỗi key có ngân sách riêng', () => {
    const limiter = createRateLimiter({ limit: 1, now: () => 0 })

    expect(limiter.check('ip-1').allowed).toBe(true)
    expect(limiter.check('ip-2').allowed).toBe(true)
    expect(limiter.check('ip-1').allowed).toBe(false)
  })

  it('hết cửa sổ thì đếm lại từ đầu', () => {
    let now = 0
    const limiter = createRateLimiter({ limit: 1, now: () => now })

    limiter.check('key')
    expect(limiter.check('key').allowed).toBe(false)

    now += DAY_MS
    expect(limiter.check('key').allowed).toBe(true)
  })

  it('khách 20 lượt/ngày, người đã đăng nhập 200 lượt/ngày', () => {
    expect(ANONYMOUS_DAILY_LIMIT).toBe(20)
    expect(REGISTERED_DAILY_LIMIT).toBe(200)

    const guest = createRateLimiter({ limit: ANONYMOUS_DAILY_LIMIT, now: () => 0 })
    for (let index = 0; index < ANONYMOUS_DAILY_LIMIT; index += 1) {
      expect(guest.check('guest').allowed).toBe(true)
    }
    expect(guest.check('guest').allowed).toBe(false)

    const member = createRateLimiter({ limit: REGISTERED_DAILY_LIMIT, now: () => 0 })
    for (let index = 0; index < REGISTERED_DAILY_LIMIT; index += 1) {
      expect(member.check('member').allowed).toBe(true)
    }
    expect(member.check('member').allowed).toBe(false)
  })

  it('login 10 lần/15 phút theo ip:email, register 5 lần/giờ theo ip', () => {
    expect(AUTH_ATTEMPT_LIMIT).toBe(10)
    expect(AUTH_ATTEMPT_WINDOW_MS).toBe(15 * 60 * 1_000)
    expect(REGISTER_ATTEMPT_LIMIT).toBe(5)

    const login = getLoginLimiter()
    login.reset()

    for (let index = 0; index < AUTH_ATTEMPT_LIMIT; index += 1) {
      expect(login.check('127.0.0.1:an@example.com').allowed).toBe(true)
    }

    const blocked = login.check('127.0.0.1:an@example.com')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(login.check('127.0.0.1:khac@example.com').allowed).toBe(true)

    const register = getRegisterLimiter()
    register.reset()

    for (let index = 0; index < REGISTER_ATTEMPT_LIMIT; index += 1) {
      expect(register.check('127.0.0.1').allowed).toBe(true)
    }
    expect(register.check('127.0.0.1').allowed).toBe(false)
  })
})
