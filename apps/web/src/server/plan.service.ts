import {
  findDishCandidates,
  insertPlan,
  listDishPreferences,
  findPlanForUser,
  listRoles,
  updatePlanItem,
  type Db,
  type PlanDetail,
} from '@mam/db'
import {
  buildPlan,
  mealTypes,
  remainingBudget,
  sumVnd,
  swapPlanMeal,
  toDailyBudget,
  type Budget,
  type DishCandidate,
  type MealType,
  type RemainingBudget,
} from '@mam/domain'

export interface CreatePlanRequest {
  days: number
  budget: Budget
  roleSlug: string
  dietTags: string[]
  startDate: string
  title: string
}

export type CreatePlanFailure =
  | { ok: false; error: 'invalid_role' }
  | { ok: false; error: 'infeasible'; minimumDailyBudgetVnd: number }

export type CreatePlanResult = { ok: true; planId: string; totalVnd: number } | CreatePlanFailure

/**
 * Ứng viên mỗi bữa. Lấy rộng (toàn bộ món trong trần giá) thay vì top 20 theo
 * độ no: ngân sách sát sàn cần cả những món rẻ, ít no mà truy vấn AI thường bỏ qua.
 */
const CANDIDATES_PER_MEAL = 100

/** FNV-1a: cùng request → cùng seed → cùng plan, không cần lưu seed vào DB. */
function seedFrom(value: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

function collectCandidates(
  db: Db,
  dailyBudgetVnd: number,
  dietTags: readonly string[],
  excludeDishIds: readonly string[],
): DishCandidate[] {
  const byId = new Map<string, DishCandidate>()

  for (const mealType of mealTypes) {
    const candidates = findDishCandidates(db, {
      mealType,
      maxPriceVnd: dailyBudgetVnd,
      dietTags,
      limit: CANDIDATES_PER_MEAL,
      excludeDishIds,
    })

    for (const dish of candidates) byId.set(dish.id, dish)
  }

  return [...byId.values()]
}

/**
 * Xếp lịch từ dữ liệu DB rồi lưu. Giá trong `plan_items` lấy từ plan (đã lấy từ
 * bảng `dishes`), không nhận giá từ client. Toàn bộ chạy đồng bộ trên SQLite nên
 * lỗi giữa chừng đã được transaction của `insertPlan` xử lý.
 */
export function createPlanForUser(
  db: Db,
  userId: string,
  input: CreatePlanRequest,
): CreatePlanResult {
  if (!listRoles(db).some((role) => role.slug === input.roleSlug)) {
    return { ok: false, error: 'invalid_role' }
  }

  const dailyBudgetVnd = toDailyBudget(input.budget)
  const dietTags = [...input.dietTags].sort()
  // Planner chỉ loại món chán; không ưu tiên món thích để giữ nguyên thuật toán xếp lịch.
  const { disliked } = listDishPreferences(db, userId)
  const candidates = collectCandidates(db, dailyBudgetVnd, dietTags, disliked)

  const plan = buildPlan({
    days: input.days,
    dailyBudgetVnd,
    roleSlug: input.roleSlug,
    dietTags,
    dishes: candidates,
    seed: seedFrom(
      [
        userId,
        input.startDate,
        input.days,
        input.budget.unit,
        input.budget.amount,
        input.roleSlug,
        dietTags.join(','),
      ].join('|'),
    ),
  })

  if (!plan.feasible) {
    return {
      ok: false,
      error: 'infeasible',
      minimumDailyBudgetVnd: plan.minimumDailyBudgetVnd,
    }
  }

  const planId = insertPlan(
    db,
    {
      userId,
      title: input.title,
      startDate: input.startDate,
      days: input.days,
      budgetUnit: input.budget.unit,
      budgetAmount: input.budget.amount,
      dailyBudgetVnd,
      roleSlug: input.roleSlug,
      dietTags,
    },
    plan.days.flatMap((day) =>
      day.meals.map((meal) => ({
        dayIndex: day.dayIndex,
        mealType: meal.mealType,
        dishId: meal.dishId,
        priceVnd: meal.priceVnd,
      })),
    ),
  )

  return { ok: true, planId, totalVnd: plan.totalVnd }
}

/** `today` là `YYYY-MM-DD` theo giờ Việt Nam, do server truyền vào. */
export function remainingBudgetOf({ plan, items }: PlanDetail, today: string): RemainingBudget {
  return remainingBudget({
    startDate: plan.startDate,
    days: plan.days,
    budgetVnd: plan.dailyBudgetVnd * plan.days,
    dayTotals: Array.from({ length: plan.days }, (_, dayIndex) =>
      sumVnd(items.filter((item) => item.dayIndex === dayIndex).map((item) => item.priceVnd)),
    ),
    today,
  })
}

export interface SwapPlanMealRequest {
  planId: string
  dayIndex: number
  mealType: MealType
  /** Món của ô trước lần bấm đầu tiên; client giữ để bấm liên tiếp đi hết vòng xoay. */
  anchorDishId?: string
}

export type SwapPlanMealResult =
  | { ok: true; dishId: string; nameVi: string; nameEn: string; priceVnd: number }
  | { ok: false; error: 'not_found' | 'no_alternative' }

/** Đủ lấy toàn bộ món của một bữa: đổi món phải thấy mọi món hợp lệ, không chỉ top theo độ no. */
const SWAP_CANDIDATE_LIMIT = 1_000

/**
 * Đổi một ô của thực đơn sang món kế tiếp trong vòng xoay của `swapPlanMeal`.
 * Thực đơn của user khác coi như không tồn tại. Ứng viên lấy từ DB theo chế độ
 * ăn đã lưu với thực đơn và bỏ món user chán; giá ghi xuống lấy từ bảng `dishes`.
 */
export function swapPlanMealForUser(
  db: Db,
  userId: string,
  request: SwapPlanMealRequest,
): SwapPlanMealResult {
  // Đọc thực đơn và ghi ô trong một transaction giữ khoá ghi từ đầu, để ô hàng xóm không đổi
  // xen giữa lúc chọn món và lúc ghi (vd. hai tiến trình server cùng file DB).
  return db.transaction(
    (tx): SwapPlanMealResult => {
      const detail = findPlanForUser(tx, request.planId, userId)
      if (!detail) return { ok: false, error: 'not_found' }

      const { plan, items } = detail
      const { disliked } = listDishPreferences(tx, userId)
      const candidates = findDishCandidates(tx, {
        mealType: request.mealType,
        maxPriceVnd: plan.dailyBudgetVnd,
        dietTags: plan.dietTags,
        limit: SWAP_CANDIDATE_LIMIT,
        excludeDishIds: disliked,
      })

      const next = swapPlanMeal(
        {
          dailyBudgetVnd: plan.dailyBudgetVnd,
          dietTags: plan.dietTags,
          days: Array.from({ length: plan.days }, (_, dayIndex) => ({
            meals: items.filter((item) => item.dayIndex === dayIndex),
          })),
        },
        {
          dayIndex: request.dayIndex,
          mealType: request.mealType,
          anchorDishId: request.anchorDishId,
          excludeDishIds: disliked,
        },
        candidates,
      )
      if (!next) return { ok: false, error: 'no_alternative' }

      const updated = updatePlanItem(tx, userId, {
        planId: plan.id,
        dayIndex: request.dayIndex,
        mealType: request.mealType,
        dishId: next.id,
      })
      if (!updated) return { ok: false, error: 'not_found' }

      return {
        ok: true,
        dishId: next.id,
        nameVi: next.nameVi,
        nameEn: next.nameEn,
        priceVnd: next.priceVnd,
      }
    },
    { behavior: 'immediate' },
  )
}
