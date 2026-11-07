import type { Db } from '@mam/db'
import { listHistoryForUser } from '@mam/db'
import type { MealSuggestion } from '@mam/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertUser } from '../../../../packages/db/src/accounts'
import { findDishCandidates } from '../../../../packages/db/src/queries'
import { createTestDb } from '../../../../packages/db/src/testing'
import { saveRecommendationBatch } from './history.service'
import type { RecommendationResult } from '../lib/recommend-types'

const budget = { unit: 'day', amount: 60_000 } as const

function suggestions(db: Db): MealSuggestion[] {
  return (['breakfast', 'lunch', 'dinner'] as const).map((mealType) => {
    const dish = findDishCandidates(db, { mealType, maxPriceVnd: 100_000, limit: 10 })[0]!

    return {
      mealType,
      dishId: dish.id,
      nameVi: dish.nameVi,
      nameEn: dish.nameEn,
      priceVnd: dish.priceVnd,
      reasonVi: `Vì ${mealType} rẻ`,
      reasonEn: `${mealType} is cheap`,
    }
  })
}

function resultWith(meals: MealSuggestion[]): RecommendationResult {
  return {
    meals,
    missingMeals: [],
    totalVnd: meals.reduce((sum, meal) => sum + meal.priceVnd, 0),
    remainingVnd: 0,
    dailyBudgetVnd: 60_000,
    mealBudgets: { breakfast: 18_000, lunch: 21_000, dinner: 21_000 },
    source: 'ai',
  }
}

describe('saveRecommendationBatch', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']
  let userId: string

  beforeEach(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
    userId = insertUser(db, { email: 'an@example.com', passwordHash: 'scrypt$stub' }).id
  })

  afterEach(() => {
    sqlite.close()
  })

  it('lưu đủ 3 bữa vào một lượt với header của request', () => {
    const meals = suggestions(db)
    const batchId = saveRecommendationBatch(
      db,
      userId,
      { roleSlug: 'student', budget },
      resultWith(meals),
    )

    expect(batchId).not.toBeNull()

    const [item] = listHistoryForUser(db, userId).items

    expect(item!.batchId).toBe(batchId)
    expect(item!.roleSlug).toBe('student')
    expect(item!.budgetUnit).toBe('day')
    expect(item!.budgetAmount).toBe(60_000)
    expect(item!.dailyBudgetVnd).toBe(60_000)
    expect(item!.meals.map((meal) => meal.dishId)).toEqual(meals.map((meal) => meal.dishId))
    expect(item!.meals.map((meal) => meal.rationaleVi)).toEqual(meals.map((meal) => meal.reasonVi))
    expect(item!.meals.map((meal) => meal.source)).toEqual(['ai', 'ai', 'ai'])
    expect(item!.totalVnd).toBe(resultWith(meals).totalVnd)
  })

  it('chỉ lưu các bữa tìm được món', () => {
    const meals = suggestions(db).slice(0, 2)
    const batchId = saveRecommendationBatch(
      db,
      userId,
      { roleSlug: 'student', budget },
      resultWith(meals),
    )

    expect(batchId).not.toBeNull()
    expect(listHistoryForUser(db, userId).items[0]!.meals).toHaveLength(2)
  })

  it('không có món nào thì không ghi gì cả', () => {
    const batchId = saveRecommendationBatch(
      db,
      userId,
      { roleSlug: 'student', budget },
      resultWith([]),
    )

    expect(batchId).toBeNull()
    expect(listHistoryForUser(db, userId).items).toEqual([])
  })

  it('mỗi lần gọi là một lượt riêng', () => {
    saveRecommendationBatch(
      db,
      userId,
      { roleSlug: 'student', budget },
      resultWith(suggestions(db)),
    )
    saveRecommendationBatch(
      db,
      userId,
      { roleSlug: 'student', budget },
      resultWith(suggestions(db)),
    )

    expect(listHistoryForUser(db, userId).items).toHaveLength(2)
  })
})
