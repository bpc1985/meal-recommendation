import type { DishCandidate, MealType } from './contracts'
import { dishMatchesDiet } from './diet'

export interface SwappableMeal {
  mealType: MealType
  dishId: string
  priceVnd: number
}

/** `days[i]` là ngày `dayIndex = i`. `BuiltPlan` của planner khớp dạng này khi thêm `dietTags`. */
export interface SwappablePlan {
  dailyBudgetVnd: number
  dietTags: readonly string[]
  days: readonly { meals: readonly SwappableMeal[] }[]
}

export interface SwapTarget {
  dayIndex: number
  mealType: MealType
  /**
   * Món đứng ở ô này trước lần bấm đầu tiên. Thứ tự xoay vòng tính khoảng cách giá
   * tới món này, nên bấm liên tiếp đi lần lượt các món gần giá nhất rồi quay về nó.
   * Bỏ trống thì lấy món hiện tại làm mốc.
   */
  anchorDishId?: string
  /** Món user đã đánh dấu chán. */
  excludeDishIds?: readonly string[]
}

/**
 * Món thay thế cho một ô của thực đơn, hoặc `null` khi không còn món nào khác.
 *
 * Ứng viên hợp lệ: phục vụ đúng bữa, khớp chế độ ăn của thực đơn, không bị chán,
 * không trùng món nào của hôm trước, hôm nay (trừ chính ô này) và hôm sau, và giữ
 * tổng ngày ≤ `dailyBudgetVnd`. Vòng xoay = món mốc đứng đầu, sau đó các ứng viên
 * theo |giá − giá mốc| tăng dần, hoà thì theo `id`. Kết quả là món đứng sau món
 * hiện tại trong vòng đó. Hàm không giữ trạng thái: cùng thực đơn, cùng mốc thì
 * cùng kết quả. Giá trả về là giá của `candidates` (lấy từ bảng `dishes`).
 */
export function swapPlanMeal(
  plan: SwappablePlan,
  target: SwapTarget,
  candidates: readonly DishCandidate[],
): DishCandidate | null {
  const day = plan.days[target.dayIndex]
  const current = day?.meals.find((meal) => meal.mealType === target.mealType)
  if (!day || !current) return null

  const blocked = new Set(target.excludeDishIds)
  for (const neighbour of [plan.days[target.dayIndex - 1], plan.days[target.dayIndex + 1]]) {
    for (const meal of neighbour?.meals ?? []) blocked.add(meal.dishId)
  }
  for (const meal of day.meals) {
    if (meal !== current) blocked.add(meal.dishId)
  }

  const spentElsewhere = day.meals.reduce(
    (sum, meal) => (meal === current ? sum : sum + meal.priceVnd),
    0,
  )
  const valid = candidates.filter(
    (dish) =>
      dish.mealTypes.includes(target.mealType) &&
      dishMatchesDiet(dish, plan.dietTags) &&
      !blocked.has(dish.id) &&
      spentElsewhere + dish.priceVnd <= plan.dailyBudgetVnd,
  )

  const anchorId = target.anchorDishId ?? current.dishId
  const anchorPrice =
    candidates.find((dish) => dish.id === anchorId)?.priceVnd ??
    (anchorId === current.dishId ? current.priceVnd : null)
  const pivotId = anchorPrice === null ? current.dishId : anchorId
  const pivotPrice = anchorPrice ?? current.priceVnd

  const ring = [...valid].sort(
    (a, b) =>
      Number(b.id === pivotId) - Number(a.id === pivotId) ||
      Math.abs(a.priceVnd - pivotPrice) - Math.abs(b.priceVnd - pivotPrice) ||
      a.id.localeCompare(b.id),
  )

  const position = ring.findIndex((dish) => dish.id === current.dishId)
  const next = ring[(position + 1) % ring.length]

  return next && next.id !== current.dishId ? next : null
}
