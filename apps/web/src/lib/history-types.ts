import type { MealType, SuggestionSource } from '@mam/domain'

/** Dạng client-safe của lịch sử — không kéo code DB vào bundle trình duyệt. */
export interface HistoryMeal {
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

export interface HistoryBatch {
  batchId: string
  createdAt: number
  roleSlug: string
  budgetUnit: string
  budgetAmount: number
  dailyBudgetVnd: number
  totalVnd: number
  meals: HistoryMeal[]
}

export interface HistoryPage {
  items: HistoryBatch[]
  page: number
  pageCount: number
  total: number
}
