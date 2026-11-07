import { z } from 'zod'

/**
 * Allowlist chế độ ăn — dùng chung cho form, server function và chat.
 * Bắt buộc phải là allowlist vì các tag này đi thẳng vào câu SQL `LIKE`
 * của `findDishCandidates`.
 *
 * `vegetarian` là yêu cầu tích cực; tiền tố `no-` là loại trừ.
 */
export const DIET_TAGS = [
  'vegetarian',
  'no-spicy',
  'no-pork',
  'no-beef',
  'no-seafood',
  'no-egg',
] as const

export type DietTag = (typeof DIET_TAGS)[number]

export const dietTagSchema = z.enum(DIET_TAGS)

const EXCLUDED_PREFIX = 'no-'

/**
 * Cùng ngữ nghĩa với `findDishCandidates` (SQL LIKE): tag thường là yêu cầu bắt
 * buộc, `no-x` loại món có tag `x`. Planner lọc lại lần nữa để không phụ thuộc
 * vào việc tầng DB đã lọc đúng.
 */
export function dishMatchesDiet(
  dish: { tags: readonly string[] },
  dietTags: readonly string[],
): boolean {
  for (const tag of dietTags) {
    if (tag.startsWith(EXCLUDED_PREFIX)) {
      if (dish.tags.includes(tag.slice(EXCLUDED_PREFIX.length))) return false
    } else if (!dish.tags.includes(tag)) {
      return false
    }
  }

  return true
}
