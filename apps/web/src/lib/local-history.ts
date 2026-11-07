import type { MealType } from '@mam/domain'
import type { ChatDish, ChatUiMessage } from './chat-types'

export const CHAT_HISTORY_KEY = 'mam_chat_history_v1'
/** 20 lượt hỏi–đáp, mỗi lượt tối đa 2 tin nhắn. */
export const CHAT_HISTORY_LIMIT = 40

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function isMealType(value: unknown): value is MealType {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner'
}

function isDish(value: unknown): value is ChatDish {
  if (!value || typeof value !== 'object') return false

  const dish = value as Record<string, unknown>

  return (
    typeof dish.id === 'string' &&
    typeof dish.nameVi === 'string' &&
    typeof dish.nameEn === 'string' &&
    typeof dish.priceVnd === 'number' &&
    Array.isArray(dish.mealTypes) &&
    dish.mealTypes.every(isMealType)
  )
}

function isMessage(value: unknown): value is ChatUiMessage {
  if (!value || typeof value !== 'object') return false

  const message = value as Record<string, unknown>

  if (
    typeof message.id !== 'string' ||
    (message.role !== 'user' && message.role !== 'assistant') ||
    typeof message.content !== 'string'
  ) {
    return false
  }

  if (message.dishes !== undefined && !Array.isArray(message.dishes)) return false
  if (Array.isArray(message.dishes) && !message.dishes.every(isDish)) return false

  return message.degraded === undefined || typeof message.degraded === 'boolean'
}

function newest(messages: readonly ChatUiMessage[]): ChatUiMessage[] {
  return messages.slice(-CHAT_HISTORY_LIMIT)
}

/** Khách không có server history: chỉ đọc từ localStorage, hỏng thì coi như rỗng. */
export function loadChatHistory(storage: StorageLike): ChatUiMessage[] {
  try {
    const raw = storage.getItem(CHAT_HISTORY_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return newest(parsed.filter(isMessage))
  } catch {
    return []
  }
}

export function saveChatHistory(storage: StorageLike, messages: readonly ChatUiMessage[]): void {
  try {
    storage.setItem(CHAT_HISTORY_KEY, JSON.stringify(newest(messages)))
  } catch {
    // Chế độ riêng tư / quota đầy: chat vẫn chạy, chỉ mất lịch sử.
  }
}

export function clearChatHistory(storage: StorageLike): void {
  try {
    storage.removeItem(CHAT_HISTORY_KEY)
  } catch {
    // Bỏ qua: xoá localStorage lỗi không nên chặn người dùng.
  }
}
