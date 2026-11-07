import type { Db } from '@mam/db'
import { createTestDb } from '@mam/db/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  findSessionUser,
  getSessionCookieOptions,
  hashSessionToken,
  readSessionToken,
  revokeSession,
} from './session'

async function seedUser(db: Db, email = 'an@example.com') {
  const { insertUser } = await import('@mam/db')

  return insertUser(db, { email, passwordHash: 'scrypt$stub' })
}

describe('session', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']

  beforeEach(() => {
    const connection = createTestDb({ seed: false })
    db = connection.db
    sqlite = connection.sqlite
  })

  afterEach(() => {
    sqlite.close()
  })

  it('không lưu token thô, chỉ lưu SHA-256', async () => {
    const user = await seedUser(db)
    const { token } = createSession(db, user.id)

    const { sessions } = await import('@mam/db')
    const rows = db.select().from(sessions).all()

    expect(rows).toHaveLength(1)
    expect(rows[0]?.tokenHash).toBe(hashSessionToken(token))
    expect(rows[0]?.tokenHash).not.toBe(token)
    expect(rows[0]?.tokenHash).toHaveLength(64)
  })

  it('token hợp lệ trả user, token lạ trả null', async () => {
    const user = await seedUser(db)
    const { token } = createSession(db, user.id)

    expect(findSessionUser(db, token)?.id).toBe(user.id)
    expect(findSessionUser(db, 'token-gia')).toBeNull()
  })

  it('session hết hạn bị xoá và không dùng lại được', async () => {
    const user = await seedUser(db)
    const now = 1_700_000_000_000
    const { token } = createSession(db, user.id, now)

    expect(findSessionUser(db, token, now + SESSION_TTL_MS - 1)?.id).toBe(user.id)

    const later = now + SESSION_TTL_MS + 1
    expect(findSessionUser(db, token, later)).toBeNull()

    const { sessions } = await import('@mam/db')
    expect(db.select().from(sessions).all()).toHaveLength(0)
  })

  it('revokeSession xoá row, token cũ không còn hiệu lực', async () => {
    const user = await seedUser(db)
    const { token } = createSession(db, user.id)

    revokeSession(db, token)

    expect(findSessionUser(db, token)).toBeNull()
  })
})

describe('session cookie', () => {
  it('đọc token từ header cookie, bỏ qua cookie khác', () => {
    expect(readSessionToken(`${SESSION_COOKIE}=abc123; mam_locale=vi`)).toBe('abc123')
    expect(readSessionToken('mam_locale=vi; mam_session=xyz')).toBe('xyz')
    expect(readSessionToken('mam_locale=vi')).toBeUndefined()
    expect(readSessionToken('')).toBeUndefined()
    expect(readSessionToken(undefined)).toBeUndefined()
  })

  it('HttpOnly + SameSite=Lax, Secure chỉ bật ở production', () => {
    const dev = getSessionCookieOptions('development')
    const prod = getSessionCookieOptions('production')

    expect(dev).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false, path: '/' })
    expect(prod.secure).toBe(true)
    expect(dev.maxAge).toBe(SESSION_TTL_MS / 1_000)
  })
})
