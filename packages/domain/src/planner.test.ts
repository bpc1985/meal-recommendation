import { describe, expect, it } from 'vitest'
import type { DishCandidate, MealType } from './contracts'
import { buildPlan } from './planner'

function dish(
  id: string,
  mealTypes: MealType[],
  priceVnd: number,
  tags: string[] = [],
): DishCandidate {
  return {
    id,
    nameVi: `Món ${id}`,
    nameEn: `Dish ${id}`,
    priceVnd,
    mealTypes,
    tags,
    fillLevel: 2,
    prepMinutes: 10,
  }
}

/**
 * Bộ món nhỏ, giá biết trước:
 * - bữa sáng rẻ nhất 10k, bữa trưa/dinner dùng chung `ld0` 15k.
 * - `ld0` phục vụ cả trưa và tối nên không thể xuất hiện 2 lần trong cùng ngày.
 */
function fixtureDishes(): DishCandidate[] {
  return [
    dish('b0', ['breakfast'], 10_000),
    dish('b1', ['breakfast'], 12_000, ['vegetarian']),
    dish('b2', ['breakfast'], 15_000),
    dish('b3', ['breakfast'], 18_000),
    dish('b4', ['breakfast'], 14_000, ['vegetarian']),
    dish('ld0', ['lunch', 'dinner'], 15_000),
    dish('l0', ['lunch'], 22_000, ['pork']),
    dish('l1', ['lunch'], 25_000, ['vegetarian']),
    dish('l2', ['lunch'], 28_000, ['seafood']),
    dish('l3', ['lunch'], 32_000, ['high_protein']),
    dish('l4', ['lunch'], 27_000, ['vegetarian']),
    dish('d0', ['dinner'], 24_000),
    dish('d1', ['dinner'], 20_000, ['vegetarian']),
    dish('d2', ['dinner'], 26_000),
    dish('d3', ['dinner'], 30_000, ['beef']),
    dish('d4', ['dinner'], 22_000, ['vegetarian']),
  ]
}

const mealsPerDay = (plan: ReturnType<typeof buildPlan>, dayIndex: number) =>
  plan.days[dayIndex]?.meals.map((meal) => meal.mealType)

describe('buildPlan', () => {
  it('7 ngày: đủ 3 bữa mỗi ngày, mỗi ngày và cả plan không vượt ngân sách', () => {
    const plan = buildPlan({
      days: 7,
      dailyBudgetVnd: 90_000,
      roleSlug: 'student',
      dietTags: [],
      dishes: fixtureDishes(),
      seed: 42,
    })

    expect(plan.feasible).toBe(true)
    expect(plan.days).toHaveLength(7)
    expect(plan.budgetVnd).toBe(630_000)
    expect(plan.totalVnd).toBeLessThanOrEqual(plan.budgetVnd)

    for (const [index, day] of plan.days.entries()) {
      expect(day.dayIndex).toBe(index)
      expect(mealsPerDay(plan, index)).toEqual(['breakfast', 'lunch', 'dinner'])
      expect(day.totalVnd).toBe(day.meals.reduce((sum, meal) => sum + meal.priceVnd, 0))
      expect(day.totalVnd).toBeLessThanOrEqual(90_000)
    }

    expect(plan.totalVnd).toBe(plan.days.reduce((sum, day) => sum + day.totalVnd, 0))
  })

  it('không món nào lặp lại trong cửa sổ 2 ngày', () => {
    const plan = buildPlan({
      days: 30,
      dailyBudgetVnd: 90_000,
      roleSlug: 'student',
      dietTags: [],
      dishes: fixtureDishes(),
      seed: 7,
    })

    expect(plan.feasible).toBe(true)

    for (let day = 1; day < plan.days.length; day += 1) {
      const previous = new Set(plan.days[day - 1]?.meals.map((meal) => meal.dishId))
      const current = plan.days[day]?.meals.map((meal) => meal.dishId) ?? []

      for (const dishId of current) expect(previous.has(dishId)).toBe(false)
    }

    for (const day of plan.days) {
      const ids = day.meals.map((meal) => meal.dishId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('mỗi tuần có ít nhất một món chay', () => {
    const plan = buildPlan({
      days: 30,
      dailyBudgetVnd: 90_000,
      roleSlug: 'student',
      dietTags: [],
      dishes: fixtureDishes(),
      seed: 3,
    })

    expect(plan.feasible).toBe(true)

    for (let start = 0; start + 7 <= plan.days.length; start += 7) {
      const week = plan.days.slice(start, start + 7)
      const hasVeg = week.some((day) =>
        day.meals.some((meal) => {
          const picked = fixtureDishes().find((item) => item.id === meal.dishId)
          return picked?.tags.includes('vegetarian')
        }),
      )

      expect(hasVeg).toBe(true)
    }
  })

  it('cùng seed → cùng plan; seed khác → plan khác', () => {
    const input = {
      days: 7,
      dailyBudgetVnd: 90_000,
      roleSlug: 'student',
      dietTags: [],
      dishes: fixtureDishes(),
    } as const

    const first = buildPlan({ ...input, seed: 11 })
    const second = buildPlan({ ...input, seed: 11 })

    expect(second).toEqual(first)

    const variants = new Set(
      [11, 12, 13, 14, 15].map((seed) => JSON.stringify(buildPlan({ ...input, seed }).days)),
    )

    expect(variants.size).toBeGreaterThan(1)
  })

  it('ngân sách quá thấp → feasible false, không trả nửa plan, kèm mức tối thiểu', () => {
    const atLowBudget = {
      days: 7,
      dailyBudgetVnd: 44_000,
      roleSlug: 'student',
      dietTags: [],
      dishes: fixtureDishes(),
      seed: 1,
    } as const

    const plan = buildPlan(atLowBudget)

    expect(plan.feasible).toBe(false)
    expect(plan.days).toEqual([])
    expect(plan.totalVnd).toBe(0)
    expect(plan.minimumDailyBudgetVnd).toBeGreaterThan(44_000)

    // Con số gợi ý phải thật sự xếp được, và thấp hơn 1.000đ thì không.
    expect(buildPlan({ ...atLowBudget, dailyBudgetVnd: plan.minimumDailyBudgetVnd }).feasible).toBe(
      true,
    )
    expect(
      buildPlan({ ...atLowBudget, dailyBudgetVnd: plan.minimumDailyBudgetVnd - 1_000 }).feasible,
    ).toBe(false)
  })

  it('đúng mức tối thiểu với plan 1 ngày → feasible', () => {
    const plan = buildPlan({
      days: 1,
      dailyBudgetVnd: 45_000,
      roleSlug: 'student',
      dietTags: [],
      dishes: fixtureDishes(),
      seed: 1,
    })

    expect(plan.feasible).toBe(true)
    expect(plan.totalVnd).toBeLessThanOrEqual(45_000)
    expect(new Set(plan.days[0]?.meals.map((meal) => meal.dishId)).size).toBe(3)
  })

  it('thiếu món cho một bữa (hoặc không đủ món để tránh lặp) → infeasible', () => {
    // Chỉ còn đúng một món trưa (ld0) → ngày thứ hai buộc phải lặp lại món của hôm trước.
    const oneLunch = fixtureDishes().filter(
      (item) => !['l0', 'l1', 'l2', 'l3', 'l4'].includes(item.id),
    )

    const twoDays = buildPlan({
      days: 2,
      dailyBudgetVnd: 200_000,
      roleSlug: 'student',
      dietTags: [],
      dishes: oneLunch,
      seed: 5,
    })

    expect(twoDays.feasible).toBe(false)
    expect(twoDays.days).toEqual([])
    // Không phải vấn đề tiền: thiếu món khác nhau cho bữa trưa.
    expect(twoDays.minimumDailyBudgetVnd).toBe(0)

    const missingDinner = fixtureDishes().filter((item) => !item.mealTypes.includes('dinner'))
    const noDinner = buildPlan({
      days: 1,
      dailyBudgetVnd: 200_000,
      roleSlug: 'student',
      dietTags: [],
      dishes: missingDinner,
      seed: 5,
    })

    expect(noDinner.feasible).toBe(false)
    expect(noDinner.minimumDailyBudgetVnd).toBe(0)
  })

  it('tôn trọng chế độ ăn: chỉ món chay, và loại trừ tag no-*', () => {
    const vegetarianOnly = buildPlan({
      days: 7,
      dailyBudgetVnd: 120_000,
      roleSlug: 'student',
      dietTags: ['vegetarian'],
      dishes: fixtureDishes(),
      seed: 9,
    })

    expect(vegetarianOnly.feasible).toBe(true)

    const byId = new Map(fixtureDishes().map((item) => [item.id, item]))
    for (const day of vegetarianOnly.days) {
      for (const meal of day.meals) {
        expect(byId.get(meal.dishId)?.tags).toContain('vegetarian')
      }
    }

    const noSeafood = buildPlan({
      days: 7,
      dailyBudgetVnd: 120_000,
      roleSlug: 'student',
      dietTags: ['no-seafood'],
      dishes: fixtureDishes(),
      seed: 9,
    })

    expect(noSeafood.feasible).toBe(true)
    expect(noSeafood.days.flatMap((day) => day.meals).map((meal) => meal.dishId)).not.toContain(
      'l2',
    )
  })

  it('không sửa mảng dishes đầu vào và kiểm tra days hợp lệ', () => {
    const dishes = fixtureDishes()
    const snapshot = JSON.parse(JSON.stringify(dishes)) as DishCandidate[]

    buildPlan({
      days: 7,
      dailyBudgetVnd: 90_000,
      roleSlug: 'student',
      dietTags: [],
      dishes,
      seed: 1,
    })

    expect(dishes).toEqual(snapshot)
    expect(() =>
      buildPlan({
        days: 0,
        dailyBudgetVnd: 90_000,
        roleSlug: 'student',
        dietTags: [],
        dishes,
        seed: 1,
      }),
    ).toThrow(/days/)
  })

  it('không bao giờ chọn món không phục vụ bữa đang xét', () => {
    const plan = buildPlan({
      days: 7,
      dailyBudgetVnd: 90_000,
      roleSlug: 'student',
      dietTags: [],
      dishes: fixtureDishes(),
      seed: 21,
    })

    expect(plan.feasible).toBe(true)

    for (const day of plan.days) {
      for (const meal of day.meals) {
        const picked = fixtureDishes().find((item) => item.id === meal.dishId)
        expect(picked?.mealTypes).toContain(meal.mealType)
        expect(meal.priceVnd).toBe(picked?.priceVnd)
        expect(meal.nameVi).toBe(picked?.nameVi)
        expect(meal.nameEn).toBe(picked?.nameEn)
      }
    }
  })

  /*
   * Phản ví dụ từ `pnpm verify:planner`: món rẻ nhất cho bữa trưa lại là món duy
   * nhất còn phục vụ bữa tối. Planner phải giữ món đó cho bữa tối thay vì "ăn"
   * mất ở bữa trưa rồi báo thiếu tiền.
   */
  it('không dùng mất món duy nhất mà bữa sau cần: ngân sách vừa đủ vẫn xếp được', () => {
    const dishes = [
      dish('b0', ['breakfast'], 10_000),
      dish('l0', ['lunch'], 20_000),
      dish('ld0', ['lunch', 'dinner'], 10_000),
    ]
    const input = { days: 1, roleSlug: 'student', dietTags: [], dishes, seed: 1 }

    const exact = buildPlan({ ...input, dailyBudgetVnd: 40_000 })
    expect(exact.feasible).toBe(true)
    expect(exact.days[0]?.meals.map((meal) => meal.dishId)).toEqual(['b0', 'l0', 'ld0'])

    const tooLow = buildPlan({ ...input, dailyBudgetVnd: 30_000 })
    expect(tooLow.feasible).toBe(false)
    expect(tooLow.minimumDailyBudgetVnd).toBe(40_000)
  })

  it('món phục vụ cả 3 bữa không bị bữa sáng giành mất: không báo "thiếu món" khi chỉ thiếu tiền', () => {
    const dishes = [
      dish('b0', ['breakfast'], 10_000),
      dish('l0', ['lunch'], 20_000),
      dish('all0', ['breakfast', 'lunch', 'dinner'], 10_000),
    ]
    const input = { days: 1, roleSlug: 'student', dietTags: [], dishes, seed: 1 }

    expect(buildPlan({ ...input, dailyBudgetVnd: 40_000 }).feasible).toBe(true)

    const tooLow = buildPlan({ ...input, dailyBudgetVnd: 30_000 })
    expect(tooLow.feasible).toBe(false)
    expect(tooLow.minimumDailyBudgetVnd).toBe(40_000)
  })

  /*
   * Phản ví dụ nhiều ngày từ `pnpm verify:planner`: ngày đầu chọn `ld0` (rẻ) cho
   * bữa trưa thì ngày sau hết món cho bữa tối. Có hai ngày khác hẳn nhau cùng vừa
   * ngân sách thì planner phải xếp được, với mọi số ngày.
   */
  it('nhiều ngày: ngày đầu không chặn đường ngày sau khi ngân sách đã đủ', () => {
    const dishes = [
      dish('b0', ['breakfast'], 10_000),
      dish('b1', ['breakfast'], 10_000),
      dish('l0', ['lunch'], 20_000),
      dish('l1', ['lunch'], 20_000),
      dish('d0', ['dinner'], 10_000),
      dish('ld0', ['lunch', 'dinner'], 10_000),
    ]
    const input = { roleSlug: 'student', dietTags: [], dishes, seed: 1 }

    for (const days of [2, 7, 30]) {
      const plan = buildPlan({ ...input, days, dailyBudgetVnd: 40_000 })
      expect(plan.feasible).toBe(true)
      expect(plan.days).toHaveLength(days)
      expect(plan.minimumDailyBudgetVnd).toBe(40_000)

      const tooLow = buildPlan({ ...input, days, dailyBudgetVnd: 30_000 })
      expect(tooLow.feasible).toBe(false)
      expect(tooLow.minimumDailyBudgetVnd).toBe(40_000)
    }
  })

  it('giá lẻ: mức tối thiểu gợi ý làm tròn LÊN bội 1.000đ và xếp được ở mức đó', () => {
    const dishes = [
      dish('b0', ['breakfast'], 10_500),
      dish('l0', ['lunch'], 10_500),
      dish('d0', ['dinner'], 10_500),
    ]
    const input = { days: 1, roleSlug: 'student', dietTags: [], dishes, seed: 1 }

    const tooLow = buildPlan({ ...input, dailyBudgetVnd: 20_000 })
    expect(tooLow.minimumDailyBudgetVnd).toBe(32_000)
    expect(buildPlan({ ...input, dailyBudgetVnd: 32_000 }).feasible).toBe(true)
  })
})
