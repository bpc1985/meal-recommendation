import { describe, expect, it } from 'vitest'
import type { DishCandidate, MealType } from './contracts'
import { swapPlanMeal, type SwappablePlan } from './plan-swap'

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

const catalog: DishCandidate[] = [
  dish('b1', ['breakfast'], 10_000),
  dish('b2', ['breakfast'], 10_000),
  dish('b3', ['breakfast'], 10_000),
  dish('b4', ['breakfast'], 10_000),
  dish('d1', ['dinner'], 20_000),
  dish('d2', ['dinner'], 20_000),
  dish('d3', ['dinner'], 20_000),
  dish('d4', ['dinner'], 20_000),
  dish('l1', ['lunch'], 50_000),
  dish('l2', ['lunch'], 30_000),
  dish('l3', ['lunch'], 30_000),
  dish('l4', ['lunch'], 50_000),
  dish('lx', ['lunch'], 30_000),
  dish('l-near-up', ['lunch'], 32_000),
  dish('l-near-down', ['lunch'], 27_000, ['vegetarian']),
  dish('l-far', ['lunch'], 40_000),
  dish('l-tie-b', ['lunch'], 35_000),
  dish('l-tie-a', ['lunch'], 25_000),
]

const byId = new Map(catalog.map((item) => [item.id, item]))

function day(breakfast: string, lunch: string, dinner: string) {
  return {
    meals: (
      [
        ['breakfast', breakfast],
        ['lunch', lunch],
        ['dinner', dinner],
      ] as const
    ).map(([mealType, dishId]) => ({ mealType, dishId, priceVnd: byId.get(dishId)!.priceVnd })),
  }
}

/** 5 ngày; ngày 3 (index 2) ăn trưa `lx` 30k, tổng ngày 60k. */
function plan(overrides: Partial<SwappablePlan> = {}): SwappablePlan {
  return {
    dailyBudgetVnd: 80_000,
    dietTags: [],
    days: [
      day('b1', 'l1', 'd1'),
      day('b2', 'l2', 'd2'),
      day('b3', 'lx', 'd3'),
      day('b4', 'l3', 'd4'),
      day('b1', 'l4', 'd1'),
    ],
    ...overrides,
  }
}

const lunchDay3 = { dayIndex: 2, mealType: 'lunch' } as const

/** Mô phỏng UI: bấm `presses` lần liên tiếp, giữ món gốc làm mốc, trả các món lần lượt hiện ra. */
function press(start: SwappablePlan, presses: number, candidates = catalog): string[] {
  let current = start
  const anchorDishId = start.days[2]!.meals[1]!.dishId
  const shown: string[] = []

  for (let count = 0; count < presses; count += 1) {
    const next = swapPlanMeal(current, { ...lunchDay3, anchorDishId }, candidates)
    if (!next) break
    shown.push(next.id)
    current = {
      ...current,
      days: current.days.map((item, index) =>
        index === 2
          ? {
              meals: item.meals.map((meal) =>
                meal.mealType === 'lunch'
                  ? { mealType: 'lunch', dishId: next.id, priceVnd: next.priceVnd }
                  : meal,
              ),
            }
          : item,
      ),
    }
  }

  return shown
}

describe('swapPlanMeal', () => {
  it('chọn món cùng bữa có giá gần món cũ nhất, hoà giá thì theo id', () => {
    expect(swapPlanMeal(plan(), lunchDay3, catalog)?.id).toBe('l-near-up')

    const tied = catalog.filter((item) => !item.id.startsWith('l-near'))
    expect(swapPlanMeal(plan(), lunchDay3, tied)?.id).toBe('l-tie-a')
  })

  it('bấm lại với cùng món gốc thì xoay vòng theo thứ tự giá gần nhất rồi quay về món gốc', () => {
    expect(press(plan(), 9)).toEqual([
      'l-near-up',
      'l-near-down',
      'l-tie-a',
      'l-tie-b',
      'l-far',
      'l1',
      'l4',
      'lx',
      'l-near-up',
    ])
  })

  it('không có món gốc thì lấy món hiện tại làm mốc', () => {
    const swapped = plan({
      days: plan().days.map((item, index) => (index === 2 ? day('b3', 'l-far', 'd3') : item)),
    })

    expect(swapPlanMeal(swapped, lunchDay3, catalog)?.id).toBe('l-tie-b')
  })

  it('loại món của hôm trước, hôm nay và hôm sau', () => {
    const onlyNeighbours = catalog.filter((item) => ['l2', 'l3', 'lx', 'l1'].includes(item.id))

    expect(swapPlanMeal(plan(), lunchDay3, onlyNeighbours)?.id).toBe('l1')
    expect(
      swapPlanMeal(
        plan(),
        lunchDay3,
        onlyNeighbours.filter((item) => item.id !== 'l1'),
      ),
    ).toBeNull()

    const sharedWithBreakfast = [dish('bl', ['breakfast', 'lunch'], 10_000), byId.get('lx')!]
    const withBl = plan({
      days: plan().days.map((item, index) =>
        index === 2
          ? {
              meals: [
                { mealType: 'breakfast' as const, dishId: 'bl', priceVnd: 10_000 },
                ...item.meals.slice(1),
              ],
            }
          : item,
      ),
    })
    expect(swapPlanMeal(withBl, lunchDay3, sharedWithBreakfast)).toBeNull()
  })

  it('loại món chán của user', () => {
    expect(swapPlanMeal(plan(), { ...lunchDay3, excludeDishIds: ['l-near-up'] }, catalog)?.id).toBe(
      'l-near-down',
    )
  })

  it('chỉ lấy món khớp chế độ ăn của thực đơn', () => {
    expect(swapPlanMeal(plan({ dietTags: ['vegetarian'] }), lunchDay3, catalog)?.id).toBe(
      'l-near-down',
    )
  })

  it('chỉ lấy món phục vụ đúng bữa', () => {
    const wrongMeal = [dish('dinner-only', ['dinner'], 30_000), byId.get('lx')!]

    expect(swapPlanMeal(plan(), lunchDay3, wrongMeal)).toBeNull()
  })

  it('giữ tổng ngày không vượt ngân sách ngày', () => {
    // Ngày 3 còn 10k + 20k cho sáng/tối: trưa tối đa 32k khi ngân sách 62k.
    const tight = plan({ dailyBudgetVnd: 62_000 })

    expect(press(tight, 4)).toEqual(['l-near-up', 'l-near-down', 'l-tie-a', 'lx'])
  })

  it('trả null khi không còn món thay thế hoặc ô không tồn tại', () => {
    expect(swapPlanMeal(plan({ dailyBudgetVnd: 60_000 }), lunchDay3, [byId.get('lx')!])).toBeNull()
    expect(swapPlanMeal(plan(), { dayIndex: 9, mealType: 'lunch' }, catalog)).toBeNull()
  })
})
