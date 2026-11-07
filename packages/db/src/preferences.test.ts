import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { insertUser } from './accounts'
import type { Db } from './client'
import { listDishPreferences, setDishPreference } from './preferences'
import { listAllDishes } from './queries'
import { dishes, users } from './schema'
import { createTestDb } from './testing'

describe('món thích và món chán', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']
  let userA: string
  let userB: string
  let pho: string
  let comTam: string

  const rows = (userId: string) =>
    sqlite
      .prepare('select dish_id as dishId, kind from dish_preferences where user_id = ?')
      .all(userId)

  beforeEach(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
    userA = insertUser(db, { email: 'a@example.com', passwordHash: 'x' }).id
    userB = insertUser(db, { email: 'b@example.com', passwordHash: 'x' }).id
    const bySlug = new Map(listAllDishes(db).map((dish) => [dish.slug, dish.id]))
    pho = bySlug.get('pho-bo')!
    comTam = bySlug.get('com-tam')!
  })

  afterEach(() => sqlite.close())

  it('thích lặp lại nhiều lần vẫn chỉ một hàng like', () => {
    setDishPreference(db, userA, pho, 'like')
    setDishPreference(db, userA, pho, 'like')
    setDishPreference(db, userA, pho, 'like')

    expect(rows(userA)).toEqual([{ dishId: pho, kind: 'like' }])
    expect(listDishPreferences(db, userA)).toEqual({ liked: [pho], disliked: [] })
  })

  it('đổi từ thích sang chán thay hàng cũ, không thể vừa thích vừa chán', () => {
    setDishPreference(db, userA, pho, 'like')
    setDishPreference(db, userA, pho, 'dislike')

    expect(rows(userA)).toEqual([{ dishId: pho, kind: 'dislike' }])
    expect(listDishPreferences(db, userA)).toEqual({ liked: [], disliked: [pho] })
  })

  it('đổi kind thì created_at lấy giờ đổi; bấm lặp cùng kind giữ nguyên giờ cũ', () => {
    const createdAt = () =>
      (
        sqlite
          .prepare('select created_at as value from dish_preferences where user_id = ?')
          .get(userA) as { value: number }
      ).value
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(1_000)
      setDishPreference(db, userA, pho, 'like')
      vi.setSystemTime(2_000)
      setDishPreference(db, userA, pho, 'like')
      expect(createdAt()).toBe(1_000)

      vi.setSystemTime(3_000)
      setDishPreference(db, userA, pho, 'dislike')
      expect(createdAt()).toBe(3_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('null xoá lựa chọn; xoá món chưa chọn cũng không lỗi', () => {
    setDishPreference(db, userA, pho, 'like')
    setDishPreference(db, userA, pho, null)
    setDishPreference(db, userA, pho, null)

    expect(rows(userA)).toEqual([])
    expect(listDishPreferences(db, userA)).toEqual({ liked: [], disliked: [] })
  })

  it('mỗi user chỉ đọc và xoá được lựa chọn của mình', () => {
    setDishPreference(db, userA, pho, 'like')
    setDishPreference(db, userB, pho, 'dislike')
    setDishPreference(db, userB, comTam, 'like')

    expect(listDishPreferences(db, userA)).toEqual({ liked: [pho], disliked: [] })
    expect(listDishPreferences(db, userB)).toEqual({ liked: [comTam], disliked: [pho] })

    setDishPreference(db, userB, pho, null)
    expect(listDishPreferences(db, userA)).toEqual({ liked: [pho], disliked: [] })
  })

  it('xoá user thì lựa chọn của user đó bị xoá theo', () => {
    setDishPreference(db, userA, pho, 'like')
    setDishPreference(db, userB, comTam, 'dislike')

    db.delete(users).where(eq(users.id, userA)).run()

    expect(rows(userA)).toEqual([])
    expect(rows(userB)).toEqual([{ dishId: comTam, kind: 'dislike' }])
  })

  it('xoá món thì lựa chọn trên món đó bị xoá theo', () => {
    setDishPreference(db, userA, pho, 'like')
    setDishPreference(db, userA, comTam, 'dislike')

    db.delete(dishes).where(eq(dishes.id, pho)).run()

    expect(rows(userA)).toEqual([{ dishId: comTam, kind: 'dislike' }])
  })

  it('DB từ chối kind ngoài like/dislike và món không tồn tại', () => {
    expect(() =>
      sqlite
        .prepare(
          "insert into dish_preferences (user_id, dish_id, kind, created_at) values (?, ?, 'meh', 0)",
        )
        .run(userA, pho),
    ).toThrow()
    expect(() => setDishPreference(db, userA, 'khong-co-mon-nay', 'like')).toThrow()
  })
})
