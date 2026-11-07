import { NO_PREFERENCES, type DishPreferenceSets } from '@mam/ai'
import {
  dishPreferenceKinds,
  findDishesByIds,
  listDishPreferences,
  setDishPreference,
  type Db,
  type DishPreferences,
} from '@mam/db'
import { z } from 'zod'
import { getSessionUser, type PublicUser } from './auth.service'

export const dishPreferenceInputSchema = z.object({
  dishId: z.string().trim().min(1).max(64),
  kind: z.enum(dishPreferenceKinds).nullable(),
})

export type DishPreferenceInput = z.infer<typeof dishPreferenceInputSchema>

export type SetPreferenceResult =
  { ok: true } | { ok: false; error: 'unauthorized' | 'dish_not_found' }

/** Khách không có lựa chọn trên server (bất biến #4); món phải có thật trong DB. */
export function setPreferenceForUser(
  db: Db,
  userId: string | null,
  input: DishPreferenceInput,
): SetPreferenceResult {
  if (!userId) return { ok: false, error: 'unauthorized' }
  if (findDishesByIds(db, [input.dishId]).length === 0) {
    return { ok: false, error: 'dish_not_found' }
  }

  setDishPreference(db, userId, input.dishId, input.kind)
  return { ok: true }
}

/** `null` nghĩa là khách: trang hiện lời mời đăng nhập thay vì nút đang tắt. */
export function listPreferencesForUser(db: Db, userId: string | null): DishPreferences | null {
  return userId ? listDishPreferences(db, userId) : null
}

/**
 * Đọc session một lần cho cả người gọi và dạng tập dùng khi dựng gợi ý và chat.
 * Đây là nơi duy nhất phân nhánh khách: khách không có dữ liệu trên server (bất biến #4)
 * nên nhận `NO_PREFERENCES`.
 */
export function loadSessionPreferences(
  db: Db,
  sessionToken: string | undefined,
): { user: PublicUser | null; preferences: DishPreferenceSets } {
  const user = getSessionUser(db, sessionToken)
  if (!user) return { user: null, preferences: NO_PREFERENCES }

  const { liked, disliked } = listDishPreferences(db, user.id)
  return { user, preferences: { liked: new Set(liked), disliked: new Set(disliked) } }
}
