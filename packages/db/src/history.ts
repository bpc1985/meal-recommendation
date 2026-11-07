import type { MealType, SuggestionSource } from '@mam/domain'
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Db } from './client'
import { dishes, recommendations } from './schema'

export interface NewRecommendationRecord {
  userId: string
  /** Cả lượt gợi ý (3 bữa) dùng chung một id để history nhóm lại. */
  batchId: string
  roleSlug: string
  budgetUnit: string
  budgetAmount: number
  dailyBudgetVnd: number
  mealType: MealType
  dishIds: string[]
  /** Giá của riêng bữa này — cộng các row trong batch ra tổng lượt. */
  totalVnd: number
  rationaleVi: string
  rationaleEn: string
  source: SuggestionSource
  model: string | null
  createdAt: number
}

export interface HistoryMealRow {
  id: string
  mealType: MealType
  dishId: string
  nameVi: string
  nameEn: string
  priceVnd: number
  rationaleVi: string
  rationaleEn: string
  source: SuggestionSource
}

export interface HistoryBatchRow {
  batchId: string
  createdAt: number
  roleSlug: string
  budgetUnit: string
  budgetAmount: number
  dailyBudgetVnd: number
  totalVnd: number
  meals: HistoryMealRow[]
}

export interface HistoryPage {
  items: HistoryBatchRow[]
  /** Trang thực sự trả về, đã kẹp vào `[1, pageCount]`. */
  page: number
  pageCount: number
  /** Số lượt (batch) khớp user + filter. */
  total: number
}

export interface HistoryQuery {
  page?: number
  /** `null` = mọi bữa; có giá trị thì chỉ trả row của bữa đó. */
  mealType?: MealType | null
  pageSize?: number
}

export const HISTORY_PAGE_SIZE = 10

const MEAL_ORDER: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2 }

/** Một statement, nên batch hoặc vào hết hoặc không vào gì. */
export function insertRecommendationBatch(
  db: Db,
  records: readonly NewRecommendationRecord[],
): void {
  if (records.length === 0) return

  db.insert(recommendations)
    .values(records.map((record) => ({ ...record })))
    .run()
}

/**
 * Trang lịch sử của một user: nhóm theo `batchId`, mới nhất trước, 10 lượt/trang.
 *
 * Thứ tự `(max(created_at), batch_id)` giảm dần nên hai lượt trùng mili-giây vẫn
 * đứng yên giữa các trang. Trang xin vượt quá thì kẹp về trang cuối.
 */
export function listHistoryForUser(
  db: Db,
  userId: string,
  options: HistoryQuery = {},
): HistoryPage {
  const pageSize = options.pageSize ?? HISTORY_PAGE_SIZE
  const mealType = options.mealType ?? null
  const scope = and(
    eq(recommendations.userId, userId),
    isNotNull(recommendations.batchId),
    mealType ? eq(recommendations.mealType, mealType) : undefined,
  )

  const total =
    db
      .select({
        total: sql<number>`count(distinct ${recommendations.batchId})`.mapWith(Number),
      })
      .from(recommendations)
      .where(scope)
      .get()?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount)

  if (total === 0) return { items: [], page, pageCount, total }

  const newestAt = sql<number>`max(${recommendations.createdAt})`.mapWith(Number)
  const pageRows = db
    .select({ batchId: recommendations.batchId, createdAt: newestAt })
    .from(recommendations)
    .where(scope)
    .groupBy(recommendations.batchId)
    .orderBy(desc(newestAt), desc(recommendations.batchId))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  const batchIds = pageRows.flatMap((row) => (row.batchId ? [row.batchId] : []))

  const rows = db
    .select({
      id: recommendations.id,
      batchId: recommendations.batchId,
      mealType: recommendations.mealType,
      dishIds: recommendations.dishIds,
      priceVnd: recommendations.totalVnd,
      rationaleVi: recommendations.rationaleVi,
      rationaleEn: recommendations.rationaleEn,
      source: recommendations.source,
      roleSlug: recommendations.roleSlug,
      budgetUnit: recommendations.budgetUnit,
      budgetAmount: recommendations.budgetAmount,
      dailyBudgetVnd: recommendations.dailyBudgetVnd,
      createdAt: recommendations.createdAt,
    })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.userId, userId),
        inArray(recommendations.batchId, batchIds),
        mealType ? eq(recommendations.mealType, mealType) : undefined,
      ),
    )
    .all()

  const dishIds = [...new Set(rows.flatMap((row) => row.dishIds))]
  const dishRows =
    dishIds.length > 0
      ? db
          .select({ id: dishes.id, nameVi: dishes.nameVi, nameEn: dishes.nameEn })
          .from(dishes)
          .where(inArray(dishes.id, dishIds))
          .all()
      : []
  const dishById = new Map(dishRows.map((dish) => [dish.id, dish]))

  const byBatch = new Map<string, HistoryBatchRow>()

  for (const row of rows) {
    if (!row.batchId) continue

    let batch = byBatch.get(row.batchId)

    if (!batch) {
      batch = {
        batchId: row.batchId,
        createdAt: row.createdAt,
        roleSlug: row.roleSlug,
        budgetUnit: row.budgetUnit,
        budgetAmount: row.budgetAmount,
        dailyBudgetVnd: row.dailyBudgetVnd,
        totalVnd: 0,
        meals: [],
      }
      byBatch.set(row.batchId, batch)
    }

    const dishId = row.dishIds[0] ?? ''
    const dish = dishById.get(dishId)

    batch.totalVnd += row.priceVnd
    batch.meals.push({
      id: row.id,
      mealType: row.mealType,
      dishId,
      nameVi: dish?.nameVi ?? dishId,
      nameEn: dish?.nameEn ?? dishId,
      priceVnd: row.priceVnd,
      rationaleVi: row.rationaleVi,
      rationaleEn: row.rationaleEn,
      source: row.source,
    })
  }

  const items = pageRows.flatMap((row) => {
    if (!row.batchId) return []

    const batch = byBatch.get(row.batchId)
    if (!batch) return []

    batch.meals.sort((a, b) => MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType])

    return [batch]
  })

  return { items, page, pageCount, total }
}

/** `false` khi lượt không tồn tại hoặc của user khác — hai case không phân biệt được. */
export function deleteHistoryBatchForUser(db: Db, batchId: string, userId: string): boolean {
  const result = db
    .delete(recommendations)
    .where(and(eq(recommendations.batchId, batchId), eq(recommendations.userId, userId)))
    .run()

  return result.changes > 0
}
