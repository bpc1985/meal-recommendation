import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db, DbExecutor } from './client'
import { dishPreferences, type DishPreferenceKind } from './schema'

export interface DishPreferences {
  liked: string[]
  disliked: string[]
}

/**
 * Upsert trạng thái của một món; `null` xoá. Gọi lặp lại cùng giá trị ra cùng một hàng.
 * Đổi kind thì `created_at` lấy giờ đổi, vì đó là lúc user chọn trạng thái hiện tại.
 */
export function setDishPreference(
  db: Db,
  userId: string,
  dishId: string,
  kind: DishPreferenceKind | null,
): void {
  if (kind === null) {
    db.delete(dishPreferences)
      .where(and(eq(dishPreferences.userId, userId), eq(dishPreferences.dishId, dishId)))
      .run()
    return
  }

  db.insert(dishPreferences)
    .values({ userId, dishId, kind })
    .onConflictDoUpdate({
      target: [dishPreferences.userId, dishPreferences.dishId],
      set: { kind, createdAt: Date.now() },
      setWhere: sql`${dishPreferences.kind} <> excluded.kind`,
    })
    .run()
}

export function listDishPreferences(db: DbExecutor, userId: string): DishPreferences {
  const rows = db
    .select({ dishId: dishPreferences.dishId, kind: dishPreferences.kind })
    .from(dishPreferences)
    .where(eq(dishPreferences.userId, userId))
    .orderBy(asc(dishPreferences.createdAt), asc(dishPreferences.dishId))
    .all()

  return {
    liked: rows.filter((row) => row.kind === 'like').map((row) => row.dishId),
    disliked: rows.filter((row) => row.kind === 'dislike').map((row) => row.dishId),
  }
}
