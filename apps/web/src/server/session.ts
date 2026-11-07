import { createHash, randomBytes } from 'node:crypto'
import {
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  findActiveSession,
  insertSession,
  type Db,
  type UserRow,
} from '@mam/db'

export const SESSION_COOKIE = 'mam_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000

const TOKEN_BYTES = 32

/** Token thô chỉ nằm trong cookie; DB giữ SHA-256 để lộ DB cũng không chiếm được session. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface CreatedSession {
  token: string
  expiresAt: number
}

export function createSession(db: Db, userId: string, now = Date.now()): CreatedSession {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = now + SESSION_TTL_MS

  insertSession(db, { userId, tokenHash: hashSessionToken(token), expiresAt })

  return { token, expiresAt }
}

/** Token sai/hết hạn đều trả null; session hết hạn bị dọn luôn. */
export function findSessionUser(db: Db, token: string, now = Date.now()): UserRow | null {
  deleteExpiredSessions(db, now)

  return findActiveSession(db, hashSessionToken(token), now)?.user ?? null
}

export function revokeSession(db: Db, token: string): void {
  deleteSessionByTokenHash(db, hashSessionToken(token))
}

export function readSessionToken(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue

    if (part.slice(0, separator).trim() !== SESSION_COOKIE) continue

    const value = part.slice(separator + 1).trim()
    return value.length > 0 ? decodeURIComponent(value) : undefined
  }

  return undefined
}

export interface SessionCookieOptions {
  path: string
  httpOnly: boolean
  sameSite: 'lax'
  secure: boolean
  maxAge: number
}

/** Cookie chỉ đọc từ server; `Secure` bật khi chạy production sau HTTPS. */
export function getSessionCookieOptions(nodeEnv = process.env.NODE_ENV): SessionCookieOptions {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: nodeEnv === 'production',
    maxAge: Math.floor(SESSION_TTL_MS / 1_000),
  }
}
