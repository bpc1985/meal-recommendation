import type { Dish, DishCandidate, MealType } from '@mam/domain'
import { and, asc, count, desc, inArray, like, lte, notLike } from 'drizzle-orm'
import type { Db, DbExecutor } from './client'
import { dishes, roles } from './schema'

const EXCLUDED_TAG_PREFIX = 'no-'
const DEFAULT_LIMIT = 20

export function listRoles(db: Db) {
  return db.select().from(roles).orderBy(asc(roles.sortOrder)).all()
}

export function countDishes(db: Db): number {
  const [row] = db.select({ value: count() }).from(dishes).all()
  return row?.value ?? 0
}

export interface CandidateQuery {
  mealType: MealType
  /** Trần giá cho bữa này — món đắt hơn không bao giờ được đưa vào ứng viên. */
  maxPriceVnd: number
  /** `vegetarian` → bắt buộc; `no-spicy` → loại. */
  dietTags?: readonly string[]
  limit?: number
  /** Món user đã chán: loại trước khi cắt `limit`, để cửa sổ ứng viên vẫn đủ món. */
  excludeDishIds?: readonly string[]
  /** Món user thích: xếp lên đầu cửa sổ để không bị `limit` cắt mất. Không nới bộ lọc nào. */
  preferDishIds?: readonly string[]
}

/**
 * Lấy tối đa 20 ứng viên cho một bữa. Lọc ngay trong SQL để AI không bao giờ
 * nhìn thấy món vượt ngân sách hay món vi phạm chế độ ăn.
 *
 * Thứ tự cố ý ưu tiên món đắt gần trần: nếu chỉ lấy 20 món rẻ nhất, các món
 * sát ngân sách sẽ bị cắt khỏi cửa sổ ứng viên và tổng bữa luôn thấp hơn mức
 * user có thể chi. Ranker vẫn chấm điểm lại toàn bộ danh sách.
 *
 * Lưu ý: `mealTypes` và `tags` là cột JSON dạng `["lunch","dinner"]`, nên khớp
 * theo chuỗi `"giá-trị"` (có dấu ngoặc kép) là đủ chính xác và không cần
 * bật extension JSON1.
 */
export function findDishCandidates(db: DbExecutor, query: CandidateQuery): DishCandidate[] {
  const conditions = [
    like(dishes.mealTypes, `%"${query.mealType}"%`),
    lte(dishes.priceVnd, query.maxPriceVnd),
  ]

  for (const tag of query.dietTags ?? []) {
    conditions.push(
      tag.startsWith(EXCLUDED_TAG_PREFIX)
        ? notLike(dishes.tags, `%"${tag.slice(EXCLUDED_TAG_PREFIX.length)}"%`)
        : like(dishes.tags, `%"${tag}"%`),
    )
  }

  const limit = query.limit ?? DEFAULT_LIMIT
  const ordered = db
    .select({
      id: dishes.id,
      nameVi: dishes.nameVi,
      nameEn: dishes.nameEn,
      priceVnd: dishes.priceVnd,
      mealTypes: dishes.mealTypes,
      tags: dishes.tags,
      fillLevel: dishes.fillLevel,
      prepMinutes: dishes.prepMinutes,
    })
    .from(dishes)
    .where(and(...conditions))
    .orderBy(desc(dishes.fillLevel), desc(dishes.priceVnd), asc(dishes.slug))

  const excluded = new Set(query.excludeDishIds)
  const preferred = new Set(query.preferDishIds)
  if (excluded.size === 0 && preferred.size === 0) return ordered.limit(limit).all()

  // Có món thích/chán: lấy cả danh sách đã lọc (≤ số món trong DB) rồi loại và xếp trong JS
  // trước khi cắt `limit`. Rẻ hơn dựng NOT IN/IN cho từng bữa (đo T28: ~355 → ~270 µs/truy vấn).
  const kept = ordered.all().filter((dish) => !excluded.has(dish.id))
  return [
    ...kept.filter((dish) => preferred.has(dish.id)),
    ...kept.filter((dish) => !preferred.has(dish.id)),
  ].slice(0, limit)
}

/** Tra món theo id để render lại thẻ món trong chat đã lưu — tên/giá luôn từ DB. */
export function findDishesByIds(db: Db, ids: readonly string[]): DishCandidate[] {
  if (ids.length === 0) return []

  return db
    .select({
      id: dishes.id,
      nameVi: dishes.nameVi,
      nameEn: dishes.nameEn,
      priceVnd: dishes.priceVnd,
      mealTypes: dishes.mealTypes,
      tags: dishes.tags,
      fillLevel: dishes.fillLevel,
      prepMinutes: dishes.prepMinutes,
    })
    .from(dishes)
    .where(inArray(dishes.id, [...ids]))
    .all()
}

/** Thẻ món cho trang duyệt `/dishes`: mọi thứ cần vẽ, trừ khoảng giá nội bộ. */
export type DishCard = Omit<Dish, 'priceMinVnd' | 'priceMaxVnd'>

/** Toàn bộ món (100 món seed ≈ 33,5KB JSON) để client tải một lần rồi tự lọc. */
export function listAllDishes(db: Db): DishCard[] {
  return db
    .select({
      id: dishes.id,
      slug: dishes.slug,
      nameVi: dishes.nameVi,
      nameEn: dishes.nameEn,
      priceVnd: dishes.priceVnd,
      mealTypes: dishes.mealTypes,
      tags: dishes.tags,
      region: dishes.region,
      prepMinutes: dishes.prepMinutes,
      fillLevel: dishes.fillLevel,
      descVi: dishes.descVi,
      descEn: dishes.descEn,
    })
    .from(dishes)
    .orderBy(asc(dishes.slug))
    .all()
}
