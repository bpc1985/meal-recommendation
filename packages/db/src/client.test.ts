import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, type Db } from './client'
import { sessions, users } from './schema'

const migrationsFolder = new URL('../migrations', import.meta.url).pathname

function freshDb(): { db: Db; sqlite: ReturnType<typeof createDb>['sqlite'] } {
  const connection = createDb(':memory:')
  migrate(connection.db, { migrationsFolder })
  return connection
}

async function insertUser(db: Db, email = 'an@example.com') {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: 'hash', displayName: 'An' })
    .returning()

  if (!user) throw new Error('insert failed')
  return user
}

describe('database schema', () => {
  let db: Db
  let sqlite: ReturnType<typeof createDb>['sqlite']

  beforeEach(() => {
    const connection = freshDb()
    db = connection.db
    sqlite = connection.sqlite
  })

  it('tạo user với giá trị mặc định hợp lý', async () => {
    const user = await insertUser(db)

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(user.locale).toBe('vi')
    expect(user.dietTags).toEqual([])
    expect(user.createdAt).toBeGreaterThan(0)

    sqlite.close()
  })

  it('từ chối email trùng', async () => {
    await insertUser(db)

    await expect(insertUser(db)).rejects.toThrow(/UNIQUE constraint failed/)
    sqlite.close()
  })

  it('xoá user thì xoá luôn session (cascade)', async () => {
    const user = await insertUser(db)
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: 'token-hash',
      expiresAt: Date.now() + 86_400_000,
    })

    await db.delete(users).where(eq(users.id, user.id))

    expect(await db.select().from(sessions)).toEqual([])
    sqlite.close()
  })

  it('lưu và đọc lại mảng json (mealTypes, dietTags)', async () => {
    const user = await db
      .update(users)
      .set({ dietTags: ['vegetarian', 'no-spicy'] })
      .where(eq(users.id, (await insertUser(db, 'b@example.com')).id))
      .returning()

    expect(user[0]?.dietTags).toEqual(['vegetarian', 'no-spicy'])
    sqlite.close()
  })
})

describe('resolveDatabasePath', () => {
  it('ưu tiên DATABASE_PATH từ môi trường', async () => {
    const { resolveDatabasePath } = await import('./client')
    const previous = process.env.DATABASE_PATH
    process.env.DATABASE_PATH = '/tmp/custom.db'

    expect(resolveDatabasePath('/somewhere')).toBe('/tmp/custom.db')

    process.env.DATABASE_PATH = previous
  })

  it('tìm repo root từ thư mục con', async () => {
    const { resolveDatabasePath } = await import('./client')
    const previous = process.env.DATABASE_PATH
    delete process.env.DATABASE_PATH

    expect(resolveDatabasePath(process.cwd())).toMatch(/\/data\/mam\.db$/)

    process.env.DATABASE_PATH = previous
  })
})
