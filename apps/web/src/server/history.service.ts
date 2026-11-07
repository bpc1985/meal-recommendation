import { insertRecommendationBatch, type Db, type NewRecommendationRecord } from '@mam/db'
import type { Budget } from '@mam/domain'
import type { RecommendationResult } from '../lib/recommend-types'

export interface SaveHistoryInput {
  roleSlug: string
  budget: Budget
}

/**
 * Ghi một lượt gợi ý của user đăng nhập: 3 bữa = 3 row cùng `batchId`.
 *
 * Chỉ gọi khi đã có session — khách không ghi DB (spec §5). Trả `null` khi lượt
 * không có món nào, để không tạo batch rỗng trong lịch sử.
 */
export function saveRecommendationBatch(
  db: Db,
  userId: string,
  input: SaveHistoryInput,
  result: RecommendationResult,
  options: { now?: number; batchId?: string } = {},
): string | null {
  if (result.meals.length === 0) return null

  const batchId = options.batchId ?? crypto.randomUUID()
  const createdAt = options.now ?? Date.now()

  const records: NewRecommendationRecord[] = result.meals.map((meal) => ({
    userId,
    batchId,
    roleSlug: input.roleSlug,
    budgetUnit: input.budget.unit,
    budgetAmount: input.budget.amount,
    dailyBudgetVnd: result.dailyBudgetVnd,
    mealType: meal.mealType,
    dishIds: [meal.dishId],
    totalVnd: meal.priceVnd,
    rationaleVi: meal.reasonVi,
    rationaleEn: meal.reasonEn,
    source: result.source,
    model: null,
    createdAt,
  }))

  insertRecommendationBatch(db, records)

  return batchId
}
