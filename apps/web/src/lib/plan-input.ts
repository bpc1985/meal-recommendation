import { DIET_TAGS, PLAN_MAX_DAYS, budgetSchema, mealTypes } from '@mam/domain'
import { z } from 'zod'

/** Chỉ chào 2 lựa chọn đúng nhu cầu MVP; domain vẫn nhận 1..31 ngày. */
export const PLAN_DAY_OPTIONS = [7, 30] as const
export type PlanDayOption = (typeof PLAN_DAY_OPTIONS)[number]

export const planIdSchema = z.object({ planId: z.string().trim().min(1).max(64) })

export const createPlanInputSchema = z.object({
  days: z.union([z.literal(7), z.literal(30)]),
  budget: budgetSchema,
  roleSlug: z.string().trim().min(1).max(60),
  dietTags: z.array(z.enum(DIET_TAGS)).max(DIET_TAGS.length).default([]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  title: z.string().trim().min(1).max(80),
})

export type CreatePlanInput = z.infer<typeof createPlanInputSchema>

/** Một ô của thực đơn. `anchorDishId` chỉ dùng để xếp thứ tự; giá vẫn lấy từ DB. */
export const swapPlanMealInputSchema = z.object({
  planId: z.string().trim().min(1).max(64),
  dayIndex: z
    .number()
    .int()
    .min(0)
    .max(PLAN_MAX_DAYS - 1),
  mealType: z.enum(mealTypes),
  anchorDishId: z.string().trim().min(1).max(64).optional(),
})

export type SwapPlanMealInput = z.infer<typeof swapPlanMealInputSchema>
