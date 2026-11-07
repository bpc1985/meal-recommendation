import type { Db } from '@mam/db'
import { insertUser, listAllDishes } from '@mam/db'
import { createTestDb } from '@mam/db/testing'
import { NO_PREFERENCES } from '@mam/ai'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  dishPreferenceInputSchema,
  listPreferencesForUser,
  loadSessionPreferences,
  setPreferenceForUser,
} from './dish-preferences.service'
import { createSession } from './session'

describe('dish-preferences.service', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']
  let userA: string
  let userB: string
  let pho: string

  const rowCount = () =>
    (sqlite.prepare('select count(*) as value from dish_preferences').get() as { value: number })
      .value

  beforeEach(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
    userA = insertUser(db, { email: 'an@example.com', passwordHash: 'scrypt$stub' }).id
    userB = insertUser(db, { email: 'binh@example.com', passwordHash: 'scrypt$stub' }).id
    pho = listAllDishes(db).find((dish) => dish.slug === 'pho-bo')!.id
  })

  afterEach(() => sqlite.close())

  it('khách bấm thích: trả unauthorized và không ghi hàng nào', () => {
    expect(setPreferenceForUser(db, null, { dishId: pho, kind: 'like' })).toEqual({
      ok: false,
      error: 'unauthorized',
    })
    expect(rowCount()).toBe(0)
  })

  it('món không tồn tại: trả dish_not_found và không ghi hàng nào', () => {
    expect(setPreferenceForUser(db, userA, { dishId: 'khong-co-mon-nay', kind: 'like' })).toEqual({
      ok: false,
      error: 'dish_not_found',
    })
    expect(rowCount()).toBe(0)
  })

  it('user đăng nhập thích rồi bỏ chọn: danh sách của chính user đổi theo', () => {
    expect(setPreferenceForUser(db, userA, { dishId: pho, kind: 'like' })).toEqual({ ok: true })
    expect(listPreferencesForUser(db, userA)).toEqual({ liked: [pho], disliked: [] })
    expect(listPreferencesForUser(db, userB)).toEqual({ liked: [], disliked: [] })

    expect(setPreferenceForUser(db, userA, { dishId: pho, kind: null })).toEqual({ ok: true })
    expect(listPreferencesForUser(db, userA)).toEqual({ liked: [], disliked: [] })
  })

  it('khách đọc danh sách: null thay vì danh sách rỗng, để UI biết là khách', () => {
    expect(listPreferencesForUser(db, null)).toBeNull()
  })

  it('schema nhận like/dislike/null, từ chối kind lạ và dishId rỗng', () => {
    for (const kind of ['like', 'dislike', null]) {
      expect(dishPreferenceInputSchema.safeParse({ dishId: pho, kind }).success, `${kind}`).toBe(
        true,
      )
    }
    expect(dishPreferenceInputSchema.safeParse({ dishId: pho, kind: 'meh' }).success).toBe(false)
    expect(dishPreferenceInputSchema.safeParse({ dishId: pho }).success).toBe(false)
    expect(dishPreferenceInputSchema.safeParse({ dishId: '', kind: 'like' }).success).toBe(false)
  })

  it('khách (không cookie hoặc token lạ) không có user và dùng NO_PREFERENCES', () => {
    expect(loadSessionPreferences(db, undefined)).toEqual({
      user: null,
      preferences: NO_PREFERENCES,
    })
    expect(loadSessionPreferences(db, 'token-khong-ton-tai').preferences).toBe(NO_PREFERENCES)
  })

  it('cookie session của user dẫn tới đúng tập món thích và món chán của user đó', () => {
    const [first, second] = listAllDishes(db).map((dish) => dish.id)
    setPreferenceForUser(db, userA, { dishId: first!, kind: 'like' })
    setPreferenceForUser(db, userA, { dishId: second!, kind: 'dislike' })
    setPreferenceForUser(db, userB, { dishId: first!, kind: 'dislike' })

    const { user, preferences } = loadSessionPreferences(db, createSession(db, userA).token)

    expect(user?.id).toBe(userA)
    expect([...preferences.liked]).toEqual([first])
    expect([...preferences.disliked]).toEqual([second])
    expect([
      ...loadSessionPreferences(db, createSession(db, userB).token).preferences.disliked,
    ]).toEqual([first])
  })
})
