import type { DishCandidate } from '@mam/domain'
import type { AdvisorPick } from './types'

export interface GuardResult {
  picks: AdvisorPick[]
  /** dishId bị loại, theo thứ tự gặp. Rỗng nghĩa là mọi pick đều hợp lệ. */
  rejected: string[]
}

/**
 * Chốt chặn cuối trước khi trả kết quả cho user:
 * 1. `dishId` phải tồn tại trong danh sách ứng viên (AI không được bịa món).
 * 2. Không trùng món trong cùng một bữa.
 * 3. Tổng giá không vượt ngân sách bữa — giá lấy từ candidate, không từ AI.
 *
 * Giữ nguyên thứ tự ưu tiên của advisor: pick đầu tiên được ưu tiên giữ lại.
 */
export function applyGuards(
  picks: readonly AdvisorPick[],
  candidates: readonly DishCandidate[],
  mealBudgetVnd: number,
): GuardResult {
  const byId = new Map(candidates.map((dish) => [dish.id, dish]))
  const accepted: AdvisorPick[] = []
  const rejected: string[] = []
  const seen = new Set<string>()
  let total = 0

  for (const pick of picks) {
    const dish = byId.get(pick.dishId)

    if (!dish || seen.has(dish.id)) {
      rejected.push(pick.dishId)
      continue
    }

    if (total + dish.priceVnd > mealBudgetVnd) {
      rejected.push(pick.dishId)
      continue
    }

    seen.add(dish.id)
    total += dish.priceVnd
    accepted.push(pick)
  }

  return { picks: accepted, rejected }
}
