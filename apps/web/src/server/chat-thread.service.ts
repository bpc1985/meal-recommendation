import {
  appendChatMessage,
  deleteChatThreadForUser,
  findDishesByIds,
  getChatThreadForUser,
  insertChatThread,
  listChatThreadsForUser,
  type Db,
} from '@mam/db'
import type { AdvisorLocale } from '@mam/ai'
import type { ChatDish, ChatThreadSummary, ChatThreadView, ChatUiMessage } from '../lib/chat-types'

/** Tiêu đề sidebar lấy từ câu hỏi đầu tiên; dài hơn thì cắt cho vừa một dòng. */
export const CHAT_THREAD_TITLE_MAX = 60

export interface BeginChatTurnInput {
  userId: string
  locale: AdvisorLocale
  /** Có thì nhắn tiếp vào thread này (chỉ khi thuộc về user); không thì tạo thread mới. */
  threadId?: string | null
  message: string
  now?: number
}

export interface BeginChatTurnResult {
  threadId: string
  created: boolean
}

export function chatThreadTitle(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim()

  if (normalized.length <= CHAT_THREAD_TITLE_MAX) return normalized

  return `${normalized.slice(0, CHAT_THREAD_TITLE_MAX - 1).trimEnd()}…`
}

/**
 * Mở một lượt chat của user: thread mới (title = câu hỏi) hoặc thread cũ nếu
 * `threadId` thuộc về chính user đó. `threadId` lạ của người khác bị bỏ qua để
 * không ai ghi được vào hội thoại của người khác.
 */
export function beginChatTurn(db: Db, input: BeginChatTurnInput): BeginChatTurnResult {
  const now = input.now ?? Date.now()
  // Wire schema đã trim; trim lại để service dùng độc lập (test, script) không lưu rác.
  const message = input.message.trim()
  const existing = input.threadId ? getChatThreadForUser(db, input.threadId, input.userId) : null
  const threadId =
    existing?.thread.id ??
    insertChatThread(db, {
      userId: input.userId,
      title: chatThreadTitle(message),
      locale: input.locale,
      createdAt: now,
    })

  appendChatMessage(db, {
    threadId,
    role: 'user',
    content: message,
    createdAt: now,
  })

  return { threadId, created: existing === null }
}

/**
 * Lưu câu trả lời sau khi stream xong. Bỏ qua text rỗng để không có bubble trống
 * trong lịch sử (stream bị huỷ trước khi có chữ).
 */
export function finishChatTurn(
  db: Db,
  input: {
    threadId: string
    text: string
    dishIds: readonly string[]
    now?: number
  },
): void {
  const text = input.text.trim()
  if (text.length === 0) return

  appendChatMessage(db, {
    threadId: input.threadId,
    role: 'assistant',
    content: text,
    dishIds: [...new Set(input.dishIds)],
    createdAt: input.now ?? Date.now(),
  })
}

/** Id món có thể trỏ tới món đã bị xoá khỏi DB — bỏ qua thay vì vỡ cả thread. */
function toChatDishes(db: Db, dishIds: readonly string[]): ChatDish[] {
  const byId = new Map(findDishesByIds(db, dishIds).map((dish) => [dish.id, dish]))

  return dishIds.flatMap((id) => {
    const dish = byId.get(id)
    if (!dish) return []

    return [
      {
        id: dish.id,
        nameVi: dish.nameVi,
        nameEn: dish.nameEn,
        priceVnd: dish.priceVnd,
        mealTypes: dish.mealTypes,
      },
    ]
  })
}

export function listChatThreads(db: Db, userId: string): ChatThreadSummary[] {
  return listChatThreadsForUser(db, userId)
}

/** `null` khi thread không tồn tại hoặc của user khác. */
export function getChatThread(db: Db, userId: string, threadId: string): ChatThreadView | null {
  const detail = getChatThreadForUser(db, threadId, userId)
  if (!detail) return null

  const messages: ChatUiMessage[] = detail.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    ...(message.dishIds.length > 0 ? { dishes: toChatDishes(db, message.dishIds) } : {}),
  }))

  return { thread: detail.thread, messages }
}

export function deleteChatThread(db: Db, userId: string, threadId: string): boolean {
  return deleteChatThreadForUser(db, threadId, userId)
}
