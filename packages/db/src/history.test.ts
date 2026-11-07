import type { MealType } from '@mam/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertUser } from './accounts'
import type { Db } from './client'
import {
  deleteHistoryBatchForUser,
  insertRecommendationBatch,
  listHistoryForUser,
  type NewRecommendationRecord,
} from './history'
import { findDishCandidates } from './queries'
import { createTestDb } from './testing'

const meals: MealType[] = ['breakfast', 'lunch', 'dinner']

function pickDish(db: Db, mealType: MealType) {
  return findDishCandidates(db, { mealType, maxPriceVnd: 100_000, limit: 10 })[0]!
}

/** Một lượt gợi ý = 3 bữa, cùng `batchId` và `createdAt`, mỗi bữa đúng một món. */
function batch(
  db: Db,
  userId: string,
  batchId: string,
  createdAt: number,
  overrides: Partial<NewRecommendationRecord> = {},
): NewRecommendationRecord[] {
  return meals.map((mealType) => {
    const dish = pickDish(db, mealType)

    return {
      userId,
      batchId,
      roleSlug: 'student',
      budgetUnit: 'day',
      budgetAmount: 60_000,
      dailyBudgetVnd: 60_000,
      mealType,
      dishIds: [dish.id],
      totalVnd: dish.priceVnd,
      rationaleVi: `Lý do ${mealType}`,
      rationaleEn: `Reason ${mealType}`,
      source: 'mock',
      model: null,
      createdAt,
      ...overrides,
    }
  })
}

describe('history queries', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']
  let userA: string
  let userB: string

  beforeEach(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
    userA = insertUser(db, { email: 'an@example.com', passwordHash: 'scrypt$stub' }).id
    userB = insertUser(db, { email: 'binh@example.com', passwordHash: 'scrypt$stub' }).id
  })

  afterEach(() => {
    sqlite.close()
  })

  it('gom 3 bữa vào một lượt, tổng bằng tổng các bữa', () => {
    const records = batch(db, userA, 'batch-1', 1_000)
    insertRecommendationBatch(db, records)

    const page = listHistoryForUser(db, userA)

    expect(page.items).toHaveLength(1)
    expect(page).toMatchObject({ page: 1, pageCount: 1, total: 1 })
    expect(page.items[0]!.batchId).toBe('batch-1')
    expect(page.items[0]!.meals.map((meal) => meal.mealType)).toEqual(meals)
    expect(page.items[0]!.totalVnd).toBe(records.reduce((sum, record) => sum + record.totalVnd, 0))
    expect(page.items[0]!.meals[0]!.nameVi).not.toBe('')
    expect(page.items[0]!.meals[0]!.nameEn).not.toBe('')
    expect(page.items[0]!.meals[0]!.rationaleVi).toBe('Lý do breakfast')
  })

  it('sắp mới nhất trước', () => {
    insertRecommendationBatch(db, batch(db, userA, 'old', 1_000))
    insertRecommendationBatch(db, batch(db, userA, 'new', 2_000))

    const page = listHistoryForUser(db, userA)

    expect(page.items.map((item) => item.batchId)).toEqual(['new', 'old'])
  })

  it('mỗi trang 10 lượt, trang 1 là 10 lượt mới nhất, trang 3 còn 5', () => {
    for (let index = 0; index < 25; index += 1) {
      insertRecommendationBatch(db, batch(db, userA, `batch-${index}`, 1_000 + index * 1_000))
    }

    const first = listHistoryForUser(db, userA)

    expect(first).toMatchObject({ page: 1, pageCount: 3, total: 25 })
    expect(first.items.map((item) => item.batchId)).toEqual(
      Array.from({ length: 10 }, (_, offset) => `batch-${24 - offset}`),
    )

    const third = listHistoryForUser(db, userA, { page: 3 })

    expect(third).toMatchObject({ page: 3, pageCount: 3, total: 25 })
    expect(third.items.map((item) => item.batchId)).toEqual([
      'batch-4',
      'batch-3',
      'batch-2',
      'batch-1',
      'batch-0',
    ])
  })

  it('hai trang liền nhau không lặp và không sót lượt trùng mili-giây', () => {
    for (let index = 0; index < 12; index += 1) {
      insertRecommendationBatch(
        db,
        batch(db, userA, `batch-${String(index).padStart(2, '0')}`, 1_000),
      )
    }

    const first = listHistoryForUser(db, userA, { page: 1 })
    const second = listHistoryForUser(db, userA, { page: 2 })
    const ids = [...first.items, ...second.items].map((item) => item.batchId)

    expect(new Set(ids).size).toBe(12)
    expect(second.items).toHaveLength(2)
  })

  it('trang vượt quá số trang thì kẹp về trang cuối', () => {
    for (let index = 0; index < 11; index += 1) {
      insertRecommendationBatch(db, batch(db, userA, `batch-${index}`, 1_000 + index * 1_000))
    }

    const page = listHistoryForUser(db, userA, { page: 999 })

    expect(page).toMatchObject({ page: 2, pageCount: 2, total: 11 })
    expect(page.items.map((item) => item.batchId)).toEqual(['batch-0'])
  })

  it('xoá lượt duy nhất của trang cuối thì lần đọc lại rơi về trang cuối mới', () => {
    for (let index = 0; index < 11; index += 1) {
      insertRecommendationBatch(db, batch(db, userA, `batch-${index}`, 1_000 + index * 1_000))
    }

    deleteHistoryBatchForUser(db, 'batch-0', userA)
    const page = listHistoryForUser(db, userA, { page: 2 })

    expect(page).toMatchObject({ page: 1, pageCount: 1, total: 10 })
    expect(page.items).toHaveLength(10)
  })

  it('lịch sử trống vẫn trả trang 1 trên 1', () => {
    expect(listHistoryForUser(db, userA, { page: 4 })).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
    })
  })

  it('lọc theo bữa đổi tổng số lượt và số trang', () => {
    for (let index = 0; index < 12; index += 1) {
      const records = batch(db, userA, `batch-${index}`, 1_000 + index * 1_000)
      insertRecommendationBatch(
        db,
        index < 3 ? records : records.filter((record) => record.mealType !== 'lunch'),
      )
    }

    expect(listHistoryForUser(db, userA)).toMatchObject({ total: 12, pageCount: 2 })

    const lunch = listHistoryForUser(db, userA, { mealType: 'lunch' })

    expect(lunch).toMatchObject({ page: 1, total: 3, pageCount: 1 })
    expect(lunch.items.map((item) => item.batchId)).toEqual(['batch-2', 'batch-1', 'batch-0'])
  })

  it('lọc theo bữa chỉ trả bữa đó và cộng đúng phần đã lọc', () => {
    const records = batch(db, userA, 'batch-1', 1_000)
    insertRecommendationBatch(db, records)
    const lunch = records.find((record) => record.mealType === 'lunch')!

    const page = listHistoryForUser(db, userA, { mealType: 'lunch' })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.meals).toHaveLength(1)
    expect(page.items[0]!.meals[0]!.mealType).toBe('lunch')
    expect(page.items[0]!.totalVnd).toBe(lunch.totalVnd)
  })

  it('không trả và không đếm dữ liệu của user khác', () => {
    insertRecommendationBatch(db, batch(db, userA, 'mine', 1_000))

    for (let index = 0; index < 15; index += 1) {
      insertRecommendationBatch(db, batch(db, userB, `theirs-${index}`, 2_000 + index))
    }

    const page = listHistoryForUser(db, userA)

    expect(page.items.map((item) => item.batchId)).toEqual(['mine'])
    expect(page).toMatchObject({ total: 1, pageCount: 1 })
  })

  it('xoá lượt của mình thì mất, đọc lại vẫn mất', () => {
    insertRecommendationBatch(db, batch(db, userA, 'batch-1', 1_000))

    expect(deleteHistoryBatchForUser(db, 'batch-1', userA)).toBe(true)
    expect(listHistoryForUser(db, userA).items).toEqual([])
  })

  it('không xoá được lượt của người khác', () => {
    insertRecommendationBatch(db, batch(db, userB, 'theirs', 1_000))

    expect(deleteHistoryBatchForUser(db, 'theirs', userA)).toBe(false)
    expect(listHistoryForUser(db, userB).items).toHaveLength(1)
  })
})
