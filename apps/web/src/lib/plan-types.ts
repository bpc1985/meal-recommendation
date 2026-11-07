import type { MealType, RemainingBudget } from '@mam/domain'

/** Dạng client-safe của plan header — không kéo code DB vào bundle trình duyệt. */
export interface PlanSummary {
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

export interface PlanDetailItem {
  dayIndex: number
  mealType: MealType
  dishId: string
  nameVi: string
  nameEn: string
  priceVnd: number
}

export interface PlanDetailData {
  plan: PlanSummary
  items: PlanDetailItem[]
  remaining: RemainingBudget
}
