import type { MealType } from '@mam/domain'

export interface ChatDish {
  id: string
  nameVi: string
  nameEn: string
  priceVnd: number
  mealTypes: MealType[]
}

/** Hợp đồng NDJSON giữa `/api/chat` và UI. */
export type ChatWireEvent =
  | { type: 'thread'; threadId: string }
  | { type: 'text'; text: string }
  | { type: 'dish'; dishId: string }
  | { type: 'meta'; dishes: ChatDish[]; degraded: boolean }
  | { type: 'done' }

export interface ChatUiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  dishes?: ChatDish[]
  degraded?: boolean
}

/** Sidebar thread đã lưu (user đăng nhập). */
export interface ChatThreadSummary {
  id: string
  title: string
  locale: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface ChatThreadView {
  thread: ChatThreadSummary
  messages: ChatUiMessage[]
}
