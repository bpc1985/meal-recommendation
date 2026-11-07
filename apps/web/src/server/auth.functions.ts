import { getDb } from '@mam/db'
import { createServerFn } from '@tanstack/react-start'
import { deleteCookie, getCookie, getRequest, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { loginInputSchema, registerInputSchema } from '../lib/auth-input'
import {
  getSessionUser,
  loginUser,
  logoutUser,
  normalizeEmail,
  registerUser,
  type AuthError,
  type PublicUser,
} from './auth.service'
import { clientKey } from './client-key'
import { getLoginLimiter, getRegisterLimiter } from './rate-limit'
import { SESSION_COOKIE, getSessionCookieOptions } from './session'

export interface AuthSuccess {
  ok: true
  user: PublicUser
}

export interface AuthFailure {
  ok: false
  error: AuthError | 'rate_limited'
  retryAfterSeconds?: number
}

export type AuthResponse = AuthSuccess | AuthFailure

const registerFields = registerInputSchema.extend({
  locale: z.enum(['vi', 'en']).optional(),
})

function sessionToken(): string | undefined {
  return getCookie(SESSION_COOKIE)
}

/** User hiện tại cho root loader và route guard; null khi chưa đăng nhập. */
export const fetchSessionUser = createServerFn().handler(async (): Promise<PublicUser | null> =>
  getSessionUser(getDb(), sessionToken()),
)

export const register = createServerFn({ method: 'POST' })
  .validator(registerFields)
  .handler(async ({ data }): Promise<AuthResponse> => {
    const limit = getRegisterLimiter().check(clientKey(getRequest()))

    if (!limit.allowed) {
      return { ok: false, error: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds }
    }

    const result = await registerUser(getDb(), {
      ...data,
      email: normalizeEmail(data.email),
    })

    if (!result.ok) return { ok: false, error: result.error }

    setCookie(SESSION_COOKIE, result.token, getSessionCookieOptions())

    return { ok: true, user: result.user }
  })

export const login = createServerFn({ method: 'POST' })
  .validator(loginInputSchema)
  .handler(async ({ data }): Promise<AuthResponse> => {
    const email = normalizeEmail(data.email)
    const limit = getLoginLimiter().check(`${clientKey(getRequest())}:${email}`)

    if (!limit.allowed) {
      return { ok: false, error: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds }
    }

    const result = await loginUser(getDb(), { email, password: data.password })

    if (!result.ok) return { ok: false, error: result.error }

    setCookie(SESSION_COOKIE, result.token, getSessionCookieOptions())

    return { ok: true, user: result.user }
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  logoutUser(getDb(), sessionToken())
  deleteCookie(SESSION_COOKIE, { path: '/' })

  return { ok: true }
})
