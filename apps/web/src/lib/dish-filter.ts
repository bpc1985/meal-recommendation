import type { DishCard } from '@mam/db'
import { mealTypes, type MealType } from '@mam/domain'
import { z } from 'zod'

const QUERY_MAX_LENGTH = 80
const TAG_MAX_COUNT = 10
const TAG_SEPARATOR = ','

/** Trần giá nhận từ URL và ô nhập. */
export const PRICE_MAX = 10_000_000

const mealSchema = z.enum(mealTypes)
const tagSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/)

export interface DishFilter {
  q: string
  meal: MealType | null
  /** Món phải có đủ mọi tag trong danh sách (AND). */
  tags: readonly string[]
  minPrice: number | null
  maxPrice: number | null
  /** Chỉ món user đăng nhập đã thích; khách không có danh sách nên cờ này không lọc gì. */
  liked: boolean
}

export const EMPTY_DISH_FILTER: DishFilter = {
  q: '',
  meal: null,
  tags: [],
  minPrice: null,
  maxPrice: null,
  liked: false,
}

/**
 * Search của `/dishes` đúng như trên URL. Nhiều tag ghép bằng dấu phẩy
 * (`?tag=vegetarian,quick`) vì bộ mã hoá mặc định của router biến mảng thành JSON.
 */
export interface DishSearch {
  q?: string
  meal?: MealType
  tag?: string
  min?: number
  max?: number
  liked?: true
}

/** Bỏ dấu tiếng Việt, đ → d, chữ thường, tách từ ở mọi ký tự không phải chữ/số: "Cơm-Tấm" → com, tam. */
function searchWords(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Bỏ đuôi số nhiều tiếng Anh: noodles → noodle, dishes → dish. */
function singulars(token: string): string[] {
  return [
    token.endsWith('s') ? token.slice(0, -1) : '',
    token.endsWith('es') ? token.slice(0, -2) : '',
  ].filter(Boolean)
}

function nameWords(dish: DishCard): string[] {
  return searchWords(`${dish.nameVi} ${dish.nameEn}`)
}

/**
 * Mỗi từ khoá phải khớp một từ trong tên Việt hoặc Anh. Từ khoá (hoặc dạng số ít
 * của nó) là một từ trọn có trong danh mục thì chỉ khớp trọn từ, kể cả số ít/số
 * nhiều ("pho" ra Phở, không ra "văn phòng"; "noodle" ra cả "noodles");
 * chưa phải từ trọn nào (đang gõ dở "ph", "noodl") thì khớp đầu từ. Xét trên cả
 * danh mục để nghĩa của từ khoá không đổi theo các filter khác.
 */
function queryMatcher(dishes: readonly DishCard[], q: string): (dish: DishCard) => boolean {
  const tokens = searchWords(q)
  if (tokens.length === 0) return () => true

  const catalogWords = new Set(dishes.flatMap(nameWords))
  const tokenTests = tokens.map((token): ((word: string) => boolean) => {
    const known = [token, ...singulars(token)]
    if (!known.some((word) => catalogWords.has(word))) return (word) => word.startsWith(token)

    const forms = new Set([...known, `${token}s`, `${token}es`])
    return (word) => forms.has(word)
  })

  return (dish) => {
    const words = nameWords(dish)
    return tokenTests.every((matches) => words.some(matches))
  }
}

export function filterDishes<T extends DishCard>(
  dishes: readonly T[],
  filter: DishFilter,
  likedIds?: ReadonlySet<string>,
): T[] {
  const matchesQuery = queryMatcher(dishes, filter.q)
  // Tag không món nào có (URL cũ, gõ tay) bị bỏ thay vì làm rỗng kết quả.
  const catalogTags = new Set(dishes.flatMap((dish) => dish.tags))
  const tags = filter.tags.filter((tag) => catalogTags.has(tag))

  return dishes.filter(
    (dish) =>
      matchesQuery(dish) &&
      (filter.meal === null || dish.mealTypes.includes(filter.meal)) &&
      tags.every((tag) => dish.tags.includes(tag)) &&
      (filter.minPrice === null || dish.priceVnd >= filter.minPrice) &&
      (filter.maxPrice === null || dish.priceVnd <= filter.maxPrice) &&
      (!filter.liked || !likedIds || likedIds.has(dish.id)),
  )
}

function parseTags(raw: unknown): string[] {
  const parts = (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(TAG_SEPARATOR))
    .map((value) => value.trim())
    .filter((value) => tagSchema.safeParse(value).success)

  return [...new Set(parts)].slice(0, TAG_MAX_COUNT)
}

/**
 * Giá từ URL hoặc ô nhập, chỉ nhận chữ số: dấu chấm, phẩy, khoảng trắng là
 * phân cách hàng nghìn ("20.000" → 20000; "20,5" → 205 vì giá VND không có lẻ).
 * Âm, số lẻ, vượt `PRICE_MAX` hay không phải số → null.
 */
export function parsePrice(raw: unknown): number | null {
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d[\d.,\s]*$/.test(raw.trim())
        ? Number(raw.replace(/[.,\s]/g, ''))
        : Number.NaN
  return Number.isSafeInteger(value) && value >= 0 && value <= PRICE_MAX ? value : null
}

/**
 * URL do người dùng gõ/chia sẻ: giá trị rác thành `undefined` thay vì báo lỗi.
 * Luôn trả đủ khoá: router ghép search thô của URL dưới kết quả này, khoá nào bị
 * bỏ sót thì giá trị thô (`?q=123` là số) lọt vào `useSearch()`.
 */
export function parseDishSearch(search: Record<string, unknown>): DishSearch {
  const q = typeof search.q === 'string' ? search.q.trim().slice(0, QUERY_MAX_LENGTH) : ''
  const meal = mealSchema.safeParse(search.meal)
  const tags = parseTags(search.tag)

  return {
    q: q || undefined,
    meal: meal.success ? meal.data : undefined,
    tag: tags.length > 0 ? tags.join(TAG_SEPARATOR) : undefined,
    min: parsePrice(search.min) ?? undefined,
    max: parsePrice(search.max) ?? undefined,
    liked: search.liked === true ? true : undefined,
  }
}

export function toDishFilter(search: DishSearch): DishFilter {
  const { q, meal, tag, min, max, liked } = parseDishSearch({ ...search })
  return {
    q: q ?? '',
    meal: meal ?? null,
    tags: tag ? tag.split(TAG_SEPARATOR) : [],
    minPrice: min ?? null,
    maxPrice: max ?? null,
    liked: liked === true,
  }
}

export function toDishSearch(filter: DishFilter): DishSearch {
  return parseDishSearch({
    q: filter.q,
    meal: filter.meal ?? undefined,
    tag: [...filter.tags],
    min: filter.minPrice ?? undefined,
    max: filter.maxPrice ?? undefined,
    liked: filter.liked || undefined,
  })
}
