import { NO_PREFERENCES, type DishPreferenceSets, type MealAdvisor } from '@mam/ai'
import { findDishCandidates, type Db } from '@mam/db'
import { createTestDb } from '@mam/db/testing'
import {
  mealTypes,
  splitMealBudget,
  type Budget,
  type DishCandidate,
  type MealType,
} from '@mam/domain'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildRecommendation } from './recommend.service'

const budget = (unit: Budget['unit'], amount: number): Budget => ({ unit, amount })

function priceById(db: Db, mealType: MealType): Map<string, number> {
  return new Map(
    findDishCandidates(db, { mealType, maxPriceVnd: 500_000, limit: 1_000 }).map((dish) => [
      dish.id,
      dish.priceVnd,
    ]),
  )
}

describe('buildRecommendation', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']

  beforeAll(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
  })

  afterAll(() => {
    sqlite.close()
  })

  it('sinh viên 60k/ngày → đủ 3 bữa, tổng không vượt ngân sách', async () => {
    const result = await buildRecommendation(db, {
      roleSlug: 'student',
      budget: budget('day', 60_000),
      dietTags: [],
      locale: 'vi',
      preferences: NO_PREFERENCES,
    })

    expect(result.meals.map((meal) => meal.mealType)).toEqual([...mealTypes])
    expect(result.missingMeals).toEqual([])
    expect(result.totalVnd).toBeLessThanOrEqual(60_000)
    expect(result.remainingVnd).toBeGreaterThanOrEqual(0)
    expect(result.source).toBe('mock')
  })

  it('giá trong kết quả là giá DB, không phải giá advisor', async () => {
    const result = await buildRecommendation(db, {
      roleSlug: 'office-worker',
      budget: budget('day', 150_000),
      dietTags: [],
      locale: 'vi',
      preferences: NO_PREFERENCES,
    })

    for (const meal of result.meals) {
      expect(priceById(db, meal.mealType).get(meal.dishId)).toBe(meal.priceVnd)
    }
  })

  it('mọi mức ngân sách hợp lệ đều không vượt tổng ngân sách ngày', async () => {
    for (const amount of [60_000, 90_000, 150_000, 300_000]) {
      const result = await buildRecommendation(db, {
        roleSlug: 'student',
        budget: budget('day', amount),
        dietTags: [],
        locale: 'vi',
        preferences: NO_PREFERENCES,
      })

      expect(result.totalVnd).toBeLessThanOrEqual(amount)
    }
  })

  it('gym 180k/ngày → dùng gần đủ ngân sách và không lặp món giữa các bữa', async () => {
    const result = await buildRecommendation(db, {
      roleSlug: 'gym-goer',
      budget: budget('day', 180_000),
      dietTags: [],
      locale: 'vi',
      preferences: NO_PREFERENCES,
    })

    expect(result.totalVnd).toBeLessThanOrEqual(180_000)
    expect(result.totalVnd).toBeGreaterThanOrEqual(150_000)

    const dishIds = result.meals.map((meal) => meal.dishId)
    expect(new Set(dishIds).size).toBe(dishIds.length)
  })

  it('advisor chọn trùng món ở bữa sau → server loại món đã dùng', async () => {
    const greedyAdvisor: MealAdvisor = {
      kind: 'mock',
      async pick(_request, candidates) {
        const first = candidates[0]
        return {
          picks: first ? [{ dishId: first.id, reasonVi: '', reasonEn: '' }] : [],
          source: 'ai',
          tip: '',
        }
      },
      async stream() {
        return { degraded: false, events: (async function* () {})() }
      },
    }

    const result = await buildRecommendation(db, {
      roleSlug: 'gym-goer',
      budget: budget('day', 180_000),
      dietTags: [],
      locale: 'vi',
      preferences: NO_PREFERENCES,
      advisor: greedyAdvisor,
    })

    const dishIds = result.meals.map((meal) => meal.dishId)
    expect(new Set(dishIds).size).toBe(dishIds.length)
  })

  it('45k/ngày: hết món mới vừa trần bữa → bữa đó vào missingMeals, không dùng lại món bữa trước', async () => {
    const result = await buildRecommendation(db, {
      roleSlug: 'student',
      budget: budget('day', 45_000),
      dietTags: [],
      locale: 'vi',
      preferences: NO_PREFERENCES,
    })

    const dishIds = result.meals.map((meal) => meal.dishId)
    expect(new Set(dishIds).size).toBe(dishIds.length)
    expect(result.missingMeals.length).toBeGreaterThan(0)
    expect([...result.meals.map((meal) => meal.mealType), ...result.missingMeals].sort()).toEqual(
      [...mealTypes].sort(),
    )
    expect(result.totalVnd).toBeLessThanOrEqual(45_000)
    expect(result.source).toBe('fallback')
  })

  it('bữa hết ứng viên → không gọi advisor (không tốn lượt AI cho danh sách rỗng)', async () => {
    const calls: MealType[] = []
    const countingAdvisor: MealAdvisor = {
      kind: 'mock',
      async pick(request, candidates) {
        calls.push(request.mealType)
        const first = candidates[0]
        return {
          picks: first ? [{ dishId: first.id, reasonVi: '', reasonEn: '' }] : [],
          source: 'ai',
          tip: '',
        }
      },
      async stream() {
        return { degraded: false, events: (async function* () {})() }
      },
    }

    const result = await buildRecommendation(db, {
      roleSlug: 'student',
      budget: budget('day', 1_000),
      dietTags: [],
      locale: 'vi',
      preferences: NO_PREFERENCES,
      advisor: countingAdvisor,
    })

    expect(calls).toEqual([])
    expect(result.missingMeals).toEqual([...mealTypes])
    expect(result.source).toBe('fallback')
  })

  it('mọi ngân sách 30k–80k/ngày: ba bữa không bao giờ trùng món', async () => {
    for (let amount = 30_000; amount <= 80_000; amount += 1_000) {
      const result = await buildRecommendation(db, {
        roleSlug: 'student',
        budget: budget('day', amount),
        dietTags: [],
        locale: 'vi',
        preferences: NO_PREFERENCES,
      })

      const dishIds = result.meals.map((meal) => meal.dishId)
      expect(new Set(dishIds).size, `ngân sách ${amount}`).toBe(dishIds.length)
      expect(result.totalVnd).toBeLessThanOrEqual(amount)
    }
  })

  it('ngân sách theo tháng được chia đúng trước khi chọn món', async () => {
    const result = await buildRecommendation(db, {
      roleSlug: 'freelance-dev',
      budget: budget('month', 2_500_000),
      dietTags: [],
      locale: 'vi',
      preferences: NO_PREFERENCES,
    })

    expect(result.dailyBudgetVnd).toBe(83_000)
    expect(result.totalVnd).toBeLessThanOrEqual(83_000)
  })

  it('chế độ ăn chay chỉ trả món chay', async () => {
    const result = await buildRecommendation(db, {
      roleSlug: 'student',
      budget: budget('day', 120_000),
      dietTags: ['vegetarian'],
      locale: 'vi',
      preferences: NO_PREFERENCES,
    })

    const vegetarianIds = new Set(
      mealTypes.flatMap((mealType) =>
        findDishCandidates(db, {
          mealType,
          maxPriceVnd: 500_000,
          dietTags: ['vegetarian'],
          limit: 1_000,
        }).map((dish) => dish.id),
      ),
    )

    expect(result.meals.length).toBeGreaterThan(0)
    for (const meal of result.meals) expect(vegetarianIds.has(meal.dishId)).toBe(true)
  })

  it('ngân sách quá thấp → báo thiếu bữa, không throw, tổng = 0', async () => {
    const result = await buildRecommendation(db, {
      roleSlug: 'student',
      budget: budget('day', 1_000),
      dietTags: [],
      locale: 'vi',
      preferences: NO_PREFERENCES,
    })

    expect(result.meals).toEqual([])
    expect(result.missingMeals).toEqual([...mealTypes])
    expect(result.totalVnd).toBe(0)
    expect(result.source).toBe('fallback')
  })

  it('advisor trả dishId không có trong DB → loại, không throw', async () => {
    const ghostAdvisor: MealAdvisor = {
      kind: 'mock',
      async pick() {
        return {
          picks: [{ dishId: 'ghost', reasonVi: '', reasonEn: '' }],
          source: 'ai',
          tip: '',
        }
      },
      async stream() {
        return { degraded: false, events: (async function* () {})() }
      },
    }

    const result = await buildRecommendation(db, {
      roleSlug: 'student',
      budget: budget('day', 60_000),
      dietTags: [],
      locale: 'vi',
      preferences: NO_PREFERENCES,
      advisor: ghostAdvisor,
    })

    expect(result.meals).toEqual([])
    expect(result.totalVnd).toBe(0)
    expect(result.source).toBe('fallback')
  })

  it('deterministic: chạy hai lần cho cùng kết quả', async () => {
    const input = {
      roleSlug: 'student',
      budget: budget('day', 60_000),
      dietTags: [],
      locale: 'vi' as const,
      preferences: NO_PREFERENCES,
    }

    const first = await buildRecommendation(db, input)
    const second = await buildRecommendation(db, input)

    expect(second.meals.map((meal) => meal.dishId)).toEqual(first.meals.map((meal) => meal.dishId))
    expect(second.totalVnd).toBe(first.totalVnd)
  })

  describe('món thích và món chán', () => {
    const prefs = (sets: Partial<DishPreferenceSets>): DishPreferenceSets => ({
      ...NO_PREFERENCES,
      ...sets,
    })

    /** Advisor luôn chọn món rẻ nhất nó được thấy, và ghi lại mọi ứng viên đã thấy. */
    function cheapestAdvisor(seen: Set<string>): MealAdvisor {
      return {
        kind: 'mock',
        async pick(_request, candidates) {
          for (const dish of candidates) seen.add(dish.id)
          const cheapest = [...candidates].sort((a, b) => a.priceVnd - b.priceVnd)[0]
          return {
            picks: cheapest ? [{ dishId: cheapest.id, reasonVi: '', reasonEn: '' }] : [],
            source: 'ai',
            tip: '',
          }
        },
        async stream() {
          return { degraded: false, events: (async function* () {})() }
        },
      }
    }

    const base = {
      roleSlug: 'student',
      budget: budget('day', 120_000),
      dietTags: [],
      locale: 'vi' as const,
    }

    it('món chán không bao giờ tới advisor hay vào kết quả, kể cả khi là món rẻ nhất', async () => {
      const before = await buildRecommendation(db, {
        ...base,
        preferences: NO_PREFERENCES,
        advisor: cheapestAdvisor(new Set()),
      })
      const disliked = new Set(before.meals.map((meal) => meal.dishId))
      expect(disliked.size).toBe(3)

      const seen = new Set<string>()
      const after = await buildRecommendation(db, {
        ...base,
        preferences: prefs({ disliked }),
        advisor: cheapestAdvisor(seen),
      })

      for (const id of disliked) expect(seen.has(id)).toBe(false)
      for (const meal of after.meals) expect(disliked.has(meal.dishId)).toBe(false)
      expect(after.meals).toHaveLength(3)
      expect(after.totalVnd).toBeLessThanOrEqual(120_000)
    })

    it('chán mọi món sáng vừa ngân sách → bữa sáng nằm trong missingMeals, không throw', async () => {
      const cap = splitMealBudget(120_000).breakfast
      const breakfast = findDishCandidates(db, {
        mealType: 'breakfast',
        maxPriceVnd: cap,
        limit: 1_000,
      })

      const result = await buildRecommendation(db, {
        ...base,
        preferences: prefs({ disliked: new Set(breakfast.map((dish) => dish.id)) }),
      })

      expect(result.missingMeals).toContain('breakfast')
      expect(result.meals.map((meal) => meal.mealType)).not.toContain('breakfast')
    })

    it('món thích vừa ngân sách mà mock vốn không chọn sẽ được chọn cho bữa trưa', async () => {
      const before = await buildRecommendation(db, { ...base, preferences: NO_PREFERENCES })
      const usedIds = new Set(before.meals.map((meal) => meal.dishId))
      const lunchOptions = findDishCandidates(db, {
        mealType: 'lunch',
        maxPriceVnd: splitMealBudget(120_000).lunch,
        limit: 1_000,
      })
      // Món xếp chót theo độ no và giá: nằm ngoài cửa sổ 20 ứng viên nếu không được ưu tiên.
      const liked: DishCandidate | undefined = lunchOptions
        .filter((dish) => !usedIds.has(dish.id))
        .at(-1)
      expect(liked).toBeDefined()

      const after = await buildRecommendation(db, {
        ...base,
        preferences: prefs({ liked: new Set([liked!.id]) }),
      })

      expect(after.meals.find((meal) => meal.mealType === 'lunch')?.dishId).toBe(liked!.id)
      expect(after.totalVnd).toBeLessThanOrEqual(120_000)
    })

    it('một món vừa thích vừa nằm trong tập chán thì vẫn bị loại', async () => {
      const before = await buildRecommendation(db, { ...base, preferences: NO_PREFERENCES })
      const lunch = before.meals.find((meal) => meal.mealType === 'lunch')!.dishId

      const after = await buildRecommendation(db, {
        ...base,
        preferences: { liked: new Set([lunch]), disliked: new Set([lunch]) },
      })

      expect(after.meals.map((meal) => meal.dishId)).not.toContain(lunch)
    })
  })
})
