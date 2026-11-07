import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db } from './client'
import { chatMessages, chatThreads } from './schema'

export type ChatRole = 'user' | 'assistant'

export interface NewChatThread {
  userId: string
  title: string
  locale: string
  createdAt?: number
}

export interface NewChatMessage {
  threadId: string
  role: ChatRole
  content: string
  dishIds?: string[]
  createdAt?: number
}

export interface ChatThreadSummary {
  id: string
  title: string
  locale: string
  createdAt: number
  /** `max(created_at)` của tin nhắn, hoặc `createdAt` khi thread còn trống. */
  updatedAt: number
  messageCount: number
}

export interface ChatMessageRow {
  id: string
  role: ChatRole
  content: string
  dishIds: string[]
  createdAt: number
}

export interface ChatThreadDetail {
  thread: ChatThreadSummary
  messages: ChatMessageRow[]
}

/** Danh sách thread mặc định: 20 gần nhất là đủ cho sidebar. */
export const CHAT_THREAD_PAGE_SIZE = 20

export function insertChatThread(db: Db, values: NewChatThread): string {
  const row = db
    .insert(chatThreads)
    .values({
      userId: values.userId,
      title: values.title,
      locale: values.locale,
      ...(values.createdAt === undefined ? {} : { createdAt: values.createdAt }),
    })
    .returning({ id: chatThreads.id })
    .get()

  return row.id
}

export function appendChatMessage(db: Db, values: NewChatMessage): string {
  const row = db
    .insert(chatMessages)
    .values({
      threadId: values.threadId,
      role: values.role,
      content: values.content,
      dishIds: values.dishIds ?? [],
      ...(values.createdAt === undefined ? {} : { createdAt: values.createdAt }),
    })
    .returning({ id: chatMessages.id })
    .get()

  return row.id
}

/**
 * Sidebar chat: thread của user, sắp theo tin nhắn cuối (không phải lúc tạo), nên
 * mở lại một thread cũ rồi nhắn tiếp sẽ đưa nó lên đầu.
 */
export function listChatThreadsForUser(
  db: Db,
  userId: string,
  limit = CHAT_THREAD_PAGE_SIZE,
): ChatThreadSummary[] {
  const updatedAt =
    sql<number>`coalesce(max(${chatMessages.createdAt}), ${chatThreads.createdAt})`.mapWith(Number)
  /** Hai lượt trong cùng một mili-giây: thread có tin nhắn chèn sau vẫn phải lên trước. */
  const lastMessageRowid = sql<number>`coalesce(max(${chatMessages}.rowid), 0)`.mapWith(Number)
  const messageCount = sql<number>`count(${chatMessages.id})`.mapWith(Number)

  return db
    .select({
      id: chatThreads.id,
      title: chatThreads.title,
      locale: chatThreads.locale,
      createdAt: chatThreads.createdAt,
      updatedAt,
      messageCount,
    })
    .from(chatThreads)
    .leftJoin(chatMessages, eq(chatMessages.threadId, chatThreads.id))
    .where(eq(chatThreads.userId, userId))
    .groupBy(chatThreads.id)
    .orderBy(desc(updatedAt), desc(lastMessageRowid), desc(sql`${chatThreads}.rowid`))
    .limit(limit)
    .all()
}

/** `null` khi thread không tồn tại hoặc của user khác — hai case không phân biệt được. */
export function getChatThreadForUser(
  db: Db,
  threadId: string,
  userId: string,
): ChatThreadDetail | null {
  const thread = listChatThreadsForUser(db, userId, Number.MAX_SAFE_INTEGER).find(
    (row) => row.id === threadId,
  )

  if (!thread) return null

  const messages = db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      dishIds: chatMessages.dishIds,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    // Tin nhắn trong cùng một mili-giây (user + assistant) phải giữ thứ tự chèn.
    .orderBy(asc(chatMessages.createdAt), asc(sql`${chatMessages}.rowid`))
    .all()

  return { thread, messages }
}

/** `false` khi thread không tồn tại hoặc của user khác. */
export function deleteChatThreadForUser(db: Db, threadId: string, userId: string): boolean {
  const result = db
    .delete(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)))
    .run()

  return result.changes > 0
}
