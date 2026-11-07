import type { MealType } from '@mam/domain'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Db, DbExecutor } from './client'
import { dishes, planItems, plans } from './schema'

export interface NewPlanRecord {
  userId: string
  title: string
  startDate: string
  days: number
  budgetUnit: string
  budgetAmount: number
  dailyBudgetVnd: number
  roleSlug: string
  /** Bỏ trống thì DB ghi `[]`, như thực đơn tạo trước khi lưu chế độ ăn. */
  dietTags?: string[]
}

export interface NewPlanItemRecord {
  dayIndex: number
  mealType: MealType
  dishId: string
  priceVnd: number
}

const MEAL_ORDER: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2 }

/**
 * Header + items phải cùng sống hoặc cùng chết: nếu insert items lỗi (dishId lạ,
 * FK), transaction rollback để không còn plan rỗng trên UI.
 */
export function insertPlan(
  db: Db,
  plan: NewPlanRecord,
  items: readonly NewPlanItemRecord[],
): string {
  return db.transaction((tx) => {
    const row = tx.insert(plans).values(plan).returning({ id: plans.id }).get()

    if (items.length > 0) {
      tx.insert(planItems)
        .values(items.map((item) => ({ ...item, planId: row.id })))
        .run()
    }

    return row.id
  })
}

export interface PlanSummaryRow {
  id: string
  title: string
  startDate: string
  days: number
  budgetUnit: string
  budgetAmount: number
  dailyBudgetVnd: number
  roleSlug: string
  dietTags: string[]
  createdAt: number
  totalVnd: number
  itemCount: number
}

/** Tổng tiền tính bằng SQL thay vì tải hết items về chỉ để cộng. */
export function listPlansForUser(db: DbExecutor, userId: string): PlanSummaryRow[] {
  const rows = db
    .select({
      id: plans.id,
      title: plans.title,
      startDate: plans.startDate,
      days: plans.days,
      budgetUnit: plans.budgetUnit,
      budgetAmount: plans.budgetAmount,
      dailyBudgetVnd: plans.dailyBudgetVnd,
      roleSlug: plans.roleSlug,
      dietTags: plans.dietTags,
      createdAt: plans.createdAt,
      totalVnd: sql<number>`coalesce(sum(${planItems.priceVnd}), 0)`.mapWith(Number),
      itemCount: sql<number>`count(${planItems.id})`.mapWith(Number),
    })
    .from(plans)
    .leftJoin(planItems, eq(planItems.planId, plans.id))
    .where(eq(plans.userId, userId))
    .groupBy(plans.id)
    .orderBy(desc(plans.createdAt))
    .all()

  return rows
}

export interface PlanItemDetail {
  dayIndex: number
  mealType: MealType
  dishId: string
  nameVi: string
  nameEn: string
  priceVnd: number
}

export interface PlanDetail {
  plan: PlanSummaryRow
  items: PlanItemDetail[]
}

export function findPlanForUser(db: DbExecutor, planId: string, userId: string): PlanDetail | null {
  const [plan] = listPlansForUser(db, userId).filter((row) => row.id === planId)
  if (!plan) return null

  const items = db
    .select({
      dayIndex: planItems.dayIndex,
      mealType: planItems.mealType,
      dishId: planItems.dishId,
      nameVi: dishes.nameVi,
      nameEn: dishes.nameEn,
      priceVnd: planItems.priceVnd,
    })
    .from(planItems)
    .innerJoin(dishes, eq(planItems.dishId, dishes.id))
    .where(eq(planItems.planId, planId))
    .orderBy(asc(planItems.dayIndex))
    .all()

  items.sort((a, b) => a.dayIndex - b.dayIndex || MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType])

  return { plan, items }
}

/** Trả `false` khi plan không tồn tại hoặc của user khác — hai case không phân biệt được. */
export function deletePlanForUser(db: Db, planId: string, userId: string): boolean {
  const result = db
    .delete(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .run()

  return result.changes > 0
}

export interface PlanItemUpdate {
  planId: string
  dayIndex: number
  mealType: MealType
  dishId: string
}

/**
 * Đổi món của đúng một ô. Chỉ chủ thực đơn sửa được (scope qua `plans.user_id`);
 * giá ghi vào là giá hiện tại trong bảng `dishes`. `false` khi món, ô hoặc thực
 * đơn không tồn tại hay thuộc user khác. Nếu điều kiện khớp nhiều hơn một hàng
 * (dữ liệu hỏng) thì rollback và ném lỗi thay vì ghi đè nhiều ô.
 */
export function updatePlanItem(db: DbExecutor, userId: string, update: PlanItemUpdate): boolean {
  return db.transaction((tx) => {
    const dish = tx
      .select({ priceVnd: dishes.priceVnd })
      .from(dishes)
      .where(eq(dishes.id, update.dishId))
      .get()
    if (!dish) return false

    const ownedPlan = tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.id, update.planId), eq(plans.userId, userId)))

    const { changes } = tx
      .update(planItems)
      .set({ dishId: update.dishId, priceVnd: dish.priceVnd })
      .where(
        and(
          inArray(planItems.planId, ownedPlan),
          eq(planItems.dayIndex, update.dayIndex),
          eq(planItems.mealType, update.mealType),
        ),
      )
      .run()

    if (changes > 1) tx.rollback()
    return changes === 1
  })
}
