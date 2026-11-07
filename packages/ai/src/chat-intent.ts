import { DIET_TAGS, type DietTag, type MealType } from '@mam/domain'

export interface ChatIntent {
  mealType: MealType | null
  budgetVnd: number | null
  dietTags: DietTag[]
}

const EMPTY: ChatIntent = { mealType: null, budgetVnd: null, dietTags: [] }

/** Bỏ dấu để "ăn tối" và "an toi" cùng khớp, giữ nguyên độ dài câu. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
}

const MEAL_PATTERNS: ReadonlyArray<[MealType, RegExp]> = [
  ['breakfast', /\b(bua sang|an sang|sang nay|breakfast|morning)\b/],
  ['lunch', /\b(bua trua|an trua|trua nay|lunch|noon)\b/],
  ['dinner', /\b(bua toi|an toi|toi nay|dinner|evening)\b/],
]

const DIET_PATTERNS: ReadonlyArray<[DietTag, RegExp]> = [
  ['vegetarian', /\b(chay|thuan chay|vegan|vegetarian|plant based)\b/],
  ['no-spicy', /\b(khong cay|no spicy|not spicy)\b/],
  ['no-pork', /\b(khong (an )?(thit )?lon|no pork)\b/],
  ['no-beef', /\b(khong (an )?(thit )?bo|no beef)\b/],
  ['no-seafood', /\b(khong (an )?hai san|no seafood)\b/],
  ['no-egg', /\b(khong (an )?trung|no egg)\b/],
]

const BUDGET_CUE =
  /\b(ngan sach|budget|khoang|tam|duoi|toi da|chi tieu|an|mua|under|below|about|around|max)\b/

const AMOUNT_PATTERN = /(\d+(?:[.,]\d+)?)\s*(trieu|tr|nghin|ngan|k|vnd|dong|d)?\b/g

const MIN_BUDGET_VND = 1_000
const MAX_BUDGET_VND = 100_000_000

function multiplierFor(unit: string | undefined): number {
  switch (unit) {
    case 'trieu':
    case 'tr':
      return 1_000_000
    case 'nghin':
    case 'ngan':
    case 'k':
      return 1_000
    default:
      return 1
  }
}

/**
 * "45.000" → 45000, "1,5" → 1.5, "1.500" → 1500. Dấu phân cách hàng nghìn
 * được nhận ra khi mọi nhóm sau dấu đều có đúng 3 chữ số.
 */
function parseNumber(raw: string): number {
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) {
    return Number(raw.replace(/[.,]/g, ''))
  }

  return Number(raw.replace(',', '.'))
}

function extractBudget(normalized: string, hasCue: boolean): number | null {
  for (const match of normalized.matchAll(AMOUNT_PATTERN)) {
    const [, raw, unit] = match
    if (!raw) continue

    const parsed = parseNumber(raw)
    if (!Number.isFinite(parsed)) continue

    let value = parsed * multiplierFor(unit)

    // "ngân sách 30" là cách nói tắt của 30.000đ.
    if (!unit && hasCue && value > 0 && value < MIN_BUDGET_VND) value *= 1_000

    // Bỏ qua số không phải tiền, ví dụ "3 bữa" hoặc "2026".
    if (value < MIN_BUDGET_VND || value > MAX_BUDGET_VND) continue

    return Math.round(value)
  }

  return null
}

function detectMealType(normalized: string): MealType | null {
  let best: { mealType: MealType; index: number } | null = null

  for (const [mealType, pattern] of MEAL_PATTERNS) {
    const index = normalized.search(pattern)
    if (index === -1) continue
    if (!best || index < best.index) best = { mealType, index }
  }

  return best?.mealType ?? null
}

function detectDietTags(normalized: string): DietTag[] {
  const found = new Set(
    DIET_PATTERNS.filter(([, pattern]) => pattern.test(normalized)).map(([tag]) => tag),
  )

  return DIET_TAGS.filter((tag) => found.has(tag))
}

/**
 * Đọc ý định từ câu chat tự do (vi/en). Không gọi AI, nên mock provider vẫn
 * trả lời đúng nghiệp vụ và test không cần network.
 */
export function parseChatIntent(text: string): ChatIntent {
  if (!text.trim()) return { ...EMPTY, dietTags: [] }

  const normalized = normalize(text)

  return {
    mealType: detectMealType(normalized),
    budgetVnd: extractBudget(normalized, BUDGET_CUE.test(normalized)),
    dietTags: detectDietTags(normalized),
  }
}
