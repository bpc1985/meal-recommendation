import { describe, expect, it } from 'vitest'
import { createPlanInputSchema, planIdSchema, swapPlanMealInputSchema } from './plan-input'

const base = {
  days: 7,
  budget: { unit: 'day', amount: 75_000 },
  roleSlug: 'student',
  dietTags: [],
  startDate: '2026-11-02',
  title: 'Thực đơn 7 ngày',
}

describe('createPlanInputSchema', () => {
  it('nhận 7 hoặc 30 ngày', () => {
    expect(createPlanInputSchema.safeParse(base).success).toBe(true)
    expect(createPlanInputSchema.safeParse({ ...base, days: 30 }).success).toBe(true)
  })

  it('từ chối số ngày khác, ngày sai định dạng, tag lạ và tiêu đề rỗng', () => {
    expect(createPlanInputSchema.safeParse({ ...base, days: 10 }).success).toBe(false)
    expect(createPlanInputSchema.safeParse({ ...base, startDate: '02/11/2026' }).success).toBe(
      false,
    )
    expect(createPlanInputSchema.safeParse({ ...base, dietTags: ['khong-co'] }).success).toBe(false)
    expect(createPlanInputSchema.safeParse({ ...base, title: '   ' }).success).toBe(false)
    expect(
      createPlanInputSchema.safeParse({ ...base, budget: { unit: 'day', amount: 0 } }).success,
    ).toBe(false)
  })

  it('mặc định dietTags là mảng rỗng', () => {
    const parsed = createPlanInputSchema.parse({ ...base, dietTags: undefined })

    expect(parsed.dietTags).toEqual([])
  })
})

describe('planIdSchema', () => {
  it('từ chối id rỗng', () => {
    expect(planIdSchema.safeParse({ planId: '  ' }).success).toBe(false)
    expect(planIdSchema.safeParse({ planId: 'abc' }).success).toBe(true)
  })
})

describe('swapPlanMealInputSchema', () => {
  const swap = { planId: 'plan-1', dayIndex: 2, mealType: 'lunch' }

  it('nhận ô hợp lệ, có hoặc không có món gốc', () => {
    expect(swapPlanMealInputSchema.safeParse(swap).success).toBe(true)
    expect(swapPlanMealInputSchema.safeParse({ ...swap, anchorDishId: 'dish-1' }).success).toBe(
      true,
    )
  })

  it('từ chối bữa lạ, ngày âm, ngày lẻ, ngày quá 31 và planId rỗng', () => {
    for (const bad of [
      { ...swap, mealType: 'snack' },
      { ...swap, dayIndex: -1 },
      { ...swap, dayIndex: 1.5 },
      { ...swap, dayIndex: 31 },
      { ...swap, planId: ' ' },
      { ...swap, anchorDishId: '' },
    ]) {
      expect(swapPlanMealInputSchema.safeParse(bad).success).toBe(false)
    }
  })
})
