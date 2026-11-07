import { deletePlanForUser, findPlanForUser, getDb, listPlansForUser } from '@mam/db'
import { todayIsoDate } from '@mam/domain'
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { createPlanInputSchema, planIdSchema, swapPlanMealInputSchema } from '../lib/plan-input'
import { getSessionUser, type PublicUser } from './auth.service'
import type { PlanDetailData } from '../lib/plan-types'
import {
  createPlanForUser,
  remainingBudgetOf,
  swapPlanMealForUser,
  type CreatePlanResult,
  type SwapPlanMealResult,
} from './plan.service'
import { SESSION_COOKIE } from './session'

function currentUser(): PublicUser | null {
  return getSessionUser(getDb(), getCookie(SESSION_COOKIE))
}

/**
 * Danh sách plan của user hiện tại. Chưa đăng nhập trả `[]` thay vì lỗi — route
 * đã có guard, đây chỉ là lớp phòng thủ cho server fn.
 */
export const listPlans = createServerFn().handler(async () => {
  const user = currentUser()

  return user ? listPlansForUser(getDb(), user.id) : []
})

export const getPlan = createServerFn()
  .validator(planIdSchema)
  .handler(async ({ data }): Promise<PlanDetailData | null> => {
    const user = currentUser()
    const detail = user ? findPlanForUser(getDb(), data.planId, user.id) : null
    if (!detail) return null

    return {
      ...detail,
      // "Hôm nay" lấy ở server theo giờ Việt Nam, không theo đồng hồ trình duyệt.
      remaining: remainingBudgetOf(detail, todayIsoDate()),
    }
  })

export const createPlan = createServerFn({ method: 'POST' })
  .validator(createPlanInputSchema)
  .handler(async ({ data }): Promise<CreatePlanResult | { ok: false; error: 'unauthorized' }> => {
    const user = currentUser()

    if (!user) return { ok: false, error: 'unauthorized' }

    return createPlanForUser(getDb(), user.id, data)
  })

export const deletePlan = createServerFn({ method: 'POST' })
  .validator(planIdSchema)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const user = currentUser()

    if (!user) return { ok: false }

    return { ok: deletePlanForUser(getDb(), data.planId, user.id) }
  })

/** Thực đơn của user khác trả `not_found`, không phân biệt với thực đơn không tồn tại. */
export const swapPlanMeal = createServerFn({ method: 'POST' })
  .validator(swapPlanMealInputSchema)
  .handler(async ({ data }): Promise<SwapPlanMealResult | { ok: false; error: 'unauthorized' }> => {
    const user = currentUser()

    if (!user) return { ok: false, error: 'unauthorized' }

    return swapPlanMealForUser(getDb(), user.id, data)
  })
