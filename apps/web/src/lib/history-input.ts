import { mealTypes, type MealType } from '@mam/domain'
import { z } from 'zod'

const HISTORY_MAX_PAGE = 100_000

const pageSchema = z.number().int().min(1).max(HISTORY_MAX_PAGE)
const mealSchema = z.enum(mealTypes)

export const historyQuerySchema = z.object({
  page: pageSchema.optional(),
  mealType: mealSchema.optional(),
})

export type HistoryQueryInput = z.infer<typeof historyQuerySchema>

export const historyDeleteSchema = z.object({
  batchId: z.string().trim().min(1).max(80),
})

export type HistoryDeleteInput = z.infer<typeof historyDeleteSchema>

/** Search của `/history`; trang 1 không ghi lên URL. */
export interface HistorySearch {
  page?: number
  meal?: MealType
}

/**
 * URL do người dùng gõ/chia sẻ: giá trị rác thành `undefined` (về trang 1, mọi bữa)
 * thay vì báo lỗi. Luôn trả đủ khoá: router ghép search thô của URL dưới kết quả
 * này, khoá nào bị bỏ sót thì giá trị thô lọt vào `useSearch()` và `loaderDeps`.
 */
export function parseHistorySearch(search: Record<string, unknown>): HistorySearch {
  const page = pageSchema.safeParse(
    typeof search.page === 'string' ? Number(search.page) : search.page,
  )
  const meal = mealSchema.safeParse(search.meal)

  return {
    page: page.success && page.data > 1 ? page.data : undefined,
    meal: meal.success ? meal.data : undefined,
  }
}
