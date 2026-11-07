import { deleteHistoryBatchForUser, getDb, listHistoryForUser } from '@mam/db'
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { historyDeleteSchema, historyQuerySchema } from '../lib/history-input'
import type { HistoryPage } from '../lib/history-types'
import { getSessionUser, type PublicUser } from './auth.service'
import { SESSION_COOKIE } from './session'

function currentUser(): PublicUser | null {
  return getSessionUser(getDb(), getCookie(SESSION_COOKIE))
}

/**
 * Một trang lịch sử (10 lượt). Chưa đăng nhập trả trang rỗng thay vì lỗi —
 * route đã có guard, đây là lớp phòng thủ cho server fn.
 */
export const listHistory = createServerFn()
  .validator(historyQuerySchema)
  .handler(async ({ data }): Promise<HistoryPage> => {
    const user = currentUser()

    if (!user) return { items: [], page: 1, pageCount: 1, total: 0 }

    return listHistoryForUser(getDb(), user.id, data)
  })

export const deleteHistory = createServerFn({ method: 'POST' })
  .validator(historyDeleteSchema)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const user = currentUser()

    if (!user) return { ok: false }

    return { ok: deleteHistoryBatchForUser(getDb(), data.batchId, user.id) }
  })
