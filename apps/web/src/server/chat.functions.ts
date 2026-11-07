import { getDb } from '@mam/db'
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { chatThreadInputSchema } from '../lib/chat-input'
import { getSessionUser, type PublicUser } from './auth.service'
import {
  deleteChatThread as deleteThread,
  getChatThread as getThread,
  listChatThreads as listThreads,
} from './chat-thread.service'
import { SESSION_COOKIE } from './session'

function currentUser(): PublicUser | null {
  return getSessionUser(getDb(), getCookie(SESSION_COOKIE))
}

/** Khách luôn trả rỗng — route `/chat` cũng không gọi khi chưa đăng nhập. */
export const listChatThreads = createServerFn().handler(async () => {
  const user = currentUser()

  if (!user) return []

  return listThreads(getDb(), user.id)
})

export const getChatThread = createServerFn()
  .validator(chatThreadInputSchema)
  .handler(async ({ data }) => {
    const user = currentUser()

    if (!user) return null

    return getThread(getDb(), user.id, data.threadId)
  })

export const deleteChatThread = createServerFn({ method: 'POST' })
  .validator(chatThreadInputSchema)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const user = currentUser()

    if (!user) return { ok: false }

    return { ok: deleteThread(getDb(), user.id, data.threadId) }
  })
