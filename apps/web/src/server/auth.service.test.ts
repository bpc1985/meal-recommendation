import type { Db } from '@mam/db'
import { createTestDb } from '@mam/db/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSessionUser, loginUser, registerUser, toPublicUser } from './auth.service'

const PASSWORD = 'matkhau123'

describe('registerUser', () => {
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

  it('chuẩn hoá email, hash mật khẩu và trả token dùng được ngay', async () => {
    const result = await registerUser(db, { email: '  An@Example.COM ', password: PASSWORD })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.user.email).toBe('an@example.com')
    expect(result.user).not.toHaveProperty('passwordHash')
    expect(getSessionUser(db, result.token)?.id).toBe(result.user.id)

    const { users } = await import('@mam/db')
    const row = db.select().from(users).all()[0]

    expect(row?.passwordHash).not.toBe(PASSWORD)
    expect(row?.passwordHash.startsWith('scrypt$')).toBe(true)
  })

  it('email trùng (không phân biệt hoa thường) → email_taken', async () => {
    await registerUser(db, { email: 'an@example.com', password: PASSWORD })
    const duplicate = await registerUser(db, { email: 'AN@example.com', password: PASSWORD })

    expect(duplicate).toEqual({ ok: false, error: 'email_taken' })
  })

  it('mật khẩu ngắn → weak_password, không tạo user', async () => {
    const result = await registerUser(db, { email: 'an@example.com', password: '1234567' })

    expect(result).toEqual({ ok: false, error: 'weak_password' })

    const { users } = await import('@mam/db')
    expect(db.select().from(users).all()).toHaveLength(0)
  })

  it('email kiểu SQL injection chỉ là email sai, bảng users không đổi', async () => {
    await registerUser(db, { email: 'an@example.com', password: PASSWORD })
    const attack = await loginUser(db, { email: "' OR 1=1 --", password: PASSWORD })

    expect(attack).toEqual({ ok: false, error: 'invalid_credentials' })

    const { users } = await import('@mam/db')
    expect(db.select().from(users).all()).toHaveLength(1)
  })
})

describe('loginUser', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']

  beforeEach(async () => {
    const connection = createTestDb({ seed: false })
    db = connection.db
    sqlite = connection.sqlite
    await registerUser(db, { email: 'an@example.com', password: PASSWORD })
  })

  afterEach(() => {
    sqlite.close()
  })

  it('đúng mật khẩu → token mới; token cũ bị thu hồi (rotate)', async () => {
    const first = await loginUser(db, { email: 'an@example.com', password: PASSWORD })
    const second = await loginUser(db, { email: 'an@example.com', password: PASSWORD })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(first.token).not.toBe(second.token)
    expect(getSessionUser(db, first.token)).toBeNull()
    expect(getSessionUser(db, second.token)?.email).toBe('an@example.com')
  })

  it('sai mật khẩu và email không tồn tại trả cùng một lỗi', async () => {
    const wrongPassword = await loginUser(db, { email: 'an@example.com', password: 'saibet123' })
    const unknownEmail = await loginUser(db, { email: 'khong@example.com', password: PASSWORD })

    expect(wrongPassword).toEqual({ ok: false, error: 'invalid_credentials' })
    expect(unknownEmail).toEqual({ ok: false, error: 'invalid_credentials' })
  })
})

describe('toPublicUser', () => {
  it('bỏ passwordHash khỏi dữ liệu trả về client', async () => {
    const { createTestDb: createDb } = await import('@mam/db/testing')
    const connection = createDb({ seed: false })

    try {
      const result = await registerUser(connection.db, {
        email: 'an@example.com',
        password: PASSWORD,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(Object.keys(result.user).sort()).toEqual([
        'createdAt',
        'dailyBudgetVnd',
        'dietTags',
        'displayName',
        'email',
        'id',
        'locale',
        'roleSlug',
      ])
      expect(toPublicUser).toBeTypeOf('function')
    } finally {
      connection.sqlite.close()
    }
  })
})
