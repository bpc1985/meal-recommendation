import type { MealSuggestion, MealType, MealBudgetSplit, SuggestionSource } from '@mam/domain'

/** Hợp đồng trả về của `recommendMeals`, client-safe (chỉ type, không kéo server code). */
export interface RecommendationResult {
  /** Chỉ chứa bữa tìm được món. Bữa thiếu nằm ở `missingMeals`. */
  meals: MealSuggestion[]
  missingMeals: MealType[]
  totalVnd: number
  remainingVnd: number
  dailyBudgetVnd: number
  mealBudgets: MealBudgetSplit
  source: SuggestionSource
}
