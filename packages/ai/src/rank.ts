import type { DishCandidate } from '@mam/domain'
import type { PickRequest, RankedCandidate } from './types'

const EXCLUDED_TAG_PREFIX = 'no-'

/**
 * Tách `dietTags` thành hai nhóm:
 * - `vegetarian`   → bắt buộc món phải có tag này
 * - `no-spicy`     → loại mọi món có tag `spicy`
 */
export function parseDietTags(dietTags: readonly string[]): {
  required: string[]
  excluded: string[]
} {
  const required: string[] = []
  const excluded: string[] = []

  for (const tag of dietTags) {
    if (tag.startsWith(EXCLUDED_TAG_PREFIX)) {
      excluded.push(tag.slice(EXCLUDED_TAG_PREFIX.length))
    } else {
      required.push(tag)
    }
  }

  return { required, excluded }
}

const IN_BUDGET_BONUS = 40
const OVER_BUDGET_PENALTY = 200
const FILL_WEIGHT = 6
const QUICK_BONUS = 3
const QUICK_MINUTES = 10
/** Thưởng tối đa cho món dùng gần hết trần bữa — lớn hơn chênh lệch fill/quick. */
const UTILIZATION_WEIGHT = 30
const MIN_FILL_LEVEL = 1
const MAX_FILL_LEVEL = 3
/**
 * Lớn hơn mọi chênh lệch điểm giữa hai món vừa ngân sách (sát trần + độ no + làm nhanh),
 * nên món thích vừa ngân sách luôn đứng trên món không thích. Chỉ cộng khi vừa ngân sách.
 */
const LIKED_BONUS =
  UTILIZATION_WEIGHT + (MAX_FILL_LEVEL - MIN_FILL_LEVEL) * FILL_WEIGHT + QUICK_BONUS + 1

/**
 * Điểm càng cao càng phù hợp. Món vượt ngân sách vẫn được giữ trong danh sách
 * (để advisor có thể chọn khi không còn lựa chọn nào) nhưng bị phạt nặng theo
 * mức vượt, nên luôn xếp sau món vừa ngân sách.
 *
 * Trong nhóm món vừa ngân sách, món dùng gần hết trần bữa được cộng thêm
 * `b.priceVnd / mealBudgetVnd * UTILIZATION_WEIGHT` — ngân sách của user là
 * mục tiêu chi tiêu, không phải chỗ để bỏ phí. Món user thích được cộng
 * `LIKED_BONUS`; món thích vượt ngân sách không được cộng.
 */
export function scoreCandidate(request: PickRequest, dish: DishCandidate): number {
  const overBy = Math.max(0, dish.priceVnd - request.mealBudgetVnd)
  const overRatio = request.mealBudgetVnd > 0 ? overBy / request.mealBudgetVnd : 1

  let score = overBy === 0 ? IN_BUDGET_BONUS : -OVER_BUDGET_PENALTY * overRatio
  if (overBy === 0 && request.mealBudgetVnd > 0) {
    score += (dish.priceVnd / request.mealBudgetVnd) * UTILIZATION_WEIGHT
  }
  if (overBy === 0 && request.likedDishIds?.has(dish.id)) score += LIKED_BONUS
  score += dish.fillLevel * FILL_WEIGHT
  if (dish.prepMinutes <= QUICK_MINUTES) score += QUICK_BONUS

  return Math.round(score * 1_000) / 1_000
}

function reasonsFor(request: PickRequest, dish: DishCandidate): string[] {
  const reasons: string[] = []
  const inBudget = dish.priceVnd <= request.mealBudgetVnd

  // Cùng điều kiện với `LIKED_BONUS`: món thích vượt ngân sách không được gọi là "món bạn thích".
  if (inBudget && request.likedDishIds?.has(dish.id)) reasons.push('liked')
  if (inBudget) reasons.push('in_budget')
  if (dish.fillLevel >= 3) reasons.push('filling')
  if (dish.prepMinutes <= QUICK_MINUTES) reasons.push('quick')
  for (const tag of request.dietTags) {
    if (!tag.startsWith(EXCLUDED_TAG_PREFIX)) reasons.push(`tag:${tag}`)
  }

  return reasons
}

/** Lọc theo bữa + chế độ ăn, rồi xếp hạng. Deterministic: hoà điểm thì theo `id`. */
export function rankCandidates(
  request: PickRequest,
  candidates: readonly DishCandidate[],
): RankedCandidate[] {
  const { required, excluded } = parseDietTags(request.dietTags)

  return candidates
    .filter((dish) => dish.mealTypes.includes(request.mealType))
    .filter((dish) => excluded.every((tag) => !dish.tags.includes(tag)))
    .filter((dish) => required.every((tag) => dish.tags.includes(tag)))
    .map((dish) => ({
      dish,
      score: scoreCandidate(request, dish),
      reasons: reasonsFor(request, dish),
    }))
    .sort((a, b) => b.score - a.score || a.dish.id.localeCompare(b.dish.id))
}
