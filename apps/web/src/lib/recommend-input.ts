import type { TranslationKey } from '@mam/i18n'
import { DIET_TAGS, budgetSchema, type Budget, type BudgetUnit, type DietTag } from '@mam/domain'
import { z } from 'zod'

export { DIET_TAGS, type DietTag }

export const recommendInputSchema = z.object({
  roleSlug: z.string().trim().min(1, 'Chọn vai trò').max(60),
  budget: budgetSchema,
  dietTags: z.array(z.enum(DIET_TAGS)).max(DIET_TAGS.length).default([]),
  locale: z.enum(['vi', 'en']).default('vi'),
})

export type RecommendInputData = z.infer<typeof recommendInputSchema>

/** Nhãn i18n cho từng tag, dùng ở form. */
export const DIET_TAG_LABEL_KEY: Record<DietTag, TranslationKey> = {
  vegetarian: 'recommend.diet.vegetarian',
  'no-spicy': 'recommend.diet.noSpicy',
  'no-pork': 'recommend.diet.noPork',
  'no-beef': 'recommend.diet.noBeef',
  'no-seafood': 'recommend.diet.noSeafood',
  'no-egg': 'recommend.diet.noEgg',
}

export const BUDGET_UNIT_LABEL_KEY = {
  meal: 'recommend.unit.meal',
  day: 'recommend.unit.day',
  month: 'recommend.unit.month',
} as const satisfies Record<BudgetUnit, TranslationKey>

/** "60.000" / "60,000" / "60000đ" → 60000. Trả NaN nếu không có chữ số. */
export function parseAmountInput(raw: string): number {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 0 ? Number.NaN : Number(digits)
}

/**
 * Search của `/recommend`, dùng để điền sẵn form (vd. từ thẻ ngân sách còn lại
 * của thực đơn). Luôn trả đủ hai khoá, giá trị rác thành `undefined`, vì router
 * gộp search của route cha vào nên khoá bỏ trống sẽ giữ giá trị cũ.
 */
export interface RecommendSearch {
  unit?: BudgetUnit
  amount?: number
}

export function parseRecommendSearch(search: Record<string, unknown>): RecommendSearch {
  const unit = budgetSchema.shape.unit.safeParse(search.unit)
  const amount = budgetSchema.shape.amount.safeParse(search.amount)

  return {
    unit: unit.success ? unit.data : undefined,
    amount: amount.success ? amount.data : undefined,
  }
}

/** Ngân sách mà URL mang tới đầy đủ (vd. từ thực đơn), để form báo nguồn và đưa ô số tiền vào tầm mắt. */
export function budgetPrefillFromSearch(search: RecommendSearch): Budget | null {
  return search.unit !== undefined && search.amount !== undefined
    ? { unit: search.unit, amount: search.amount }
    : null
}
