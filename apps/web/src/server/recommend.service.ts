import type { AdvisorLocale, DishPreferenceSets, MealAdvisor } from '@mam/ai'
import { createMockAdvisor } from '@mam/ai'
import { findDishCandidates, type Db } from '@mam/db'
import {
  mealTypes,
  remainingVnd as computeRemaining,
  splitMealBudget,
  sumVnd,
  toDailyBudget,
  type Budget,
  type MealSuggestion,
  type MealType,
} from '@mam/domain'
import type { RecommendationResult } from '../lib/recommend-types'

export type { RecommendationResult } from '../lib/recommend-types'

export interface RecommendInput {
  roleSlug: string
  budget: Budget
  dietTags: string[]
  locale: AdvisorLocale
  /** Món chán bị loại khỏi ứng viên; món thích được ưu tiên khi vừa ngân sách. */
  preferences: DishPreferenceSets
  /** Cho phép test bơm advisor giả; production dùng `getAdvisor()`. */
  advisor?: MealAdvisor
}

const CANDIDATE_LIMIT = 20

/**
 * Luồng gợi ý: DB lấy ứng viên (đã bỏ món chán) → advisor chọn → guard đã chạy trong advisor →
 * server tính lại tổng từ giá trong DB.
 *
 * Bất biến: giá trong kết quả luôn là giá DB, không bao giờ là giá advisor "nói".
 */
export async function buildRecommendation(
  db: Db,
  input: RecommendInput,
): Promise<RecommendationResult> {
  const advisor = input.advisor ?? createMockAdvisor()
  const dailyBudgetVnd = toDailyBudget(input.budget)
  const mealBudgets = splitMealBudget(dailyBudgetVnd)

  const meals: MealSuggestion[] = []
  const missingMeals: MealType[] = []
  const excludeDishIds = [...input.preferences.disliked]
  const preferDishIds = [...input.preferences.liked]
  let usedFallback = false
  let usedAi = false

  for (const mealType of mealTypes) {
    // Ba bữa không trùng món: món bữa trước đã chọn bị loại như món chán. Hết món mới vừa trần
    // bữa thì bữa đó vào missingMeals, không dùng lại món cũ.
    const candidates = findDishCandidates(db, {
      mealType,
      maxPriceVnd: mealBudgets[mealType],
      dietTags: input.dietTags,
      limit: CANDIDATE_LIMIT,
      excludeDishIds,
      preferDishIds,
    })

    if (candidates.length === 0) {
      missingMeals.push(mealType)
      usedFallback = true
      continue
    }

    const result = await advisor.pick(
      {
        roleSlug: input.roleSlug,
        mealType,
        dailyBudgetVnd,
        mealBudgetVnd: mealBudgets[mealType],
        dietTags: input.dietTags,
        locale: input.locale,
        likedDishIds: input.preferences.liked,
      },
      candidates,
    )

    if (result.source === 'ai') usedAi = true

    const pick = result.picks[0]
    const dish = pick ? candidates.find((candidate) => candidate.id === pick.dishId) : undefined

    if (!pick || !dish) {
      missingMeals.push(mealType)
      usedFallback = true
      continue
    }

    excludeDishIds.push(dish.id)

    meals.push({
      mealType,
      dishId: dish.id,
      nameVi: dish.nameVi,
      nameEn: dish.nameEn,
      priceVnd: dish.priceVnd,
      reasonVi: pick.reasonVi,
      reasonEn: pick.reasonEn,
    })
  }

  const totalVnd = sumVnd(meals.map((meal) => meal.priceVnd))

  return {
    meals,
    missingMeals,
    totalVnd,
    remainingVnd: computeRemaining(dailyBudgetVnd, totalVnd),
    dailyBudgetVnd,
    mealBudgets,
    source: usedFallback ? 'fallback' : usedAi ? 'ai' : 'mock',
  }
}
