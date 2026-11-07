import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertUser } from './accounts'
import {
  appendChatMessage,
  deleteChatThreadForUser,
  getChatThreadForUser,
  insertChatThread,
  listChatThreadsForUser,
} from './chat'
import type { Db } from './client'
import { createTestDb } from './testing'

describe('chat queries', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']
  let userA: string
  let userB: string

  beforeEach(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
    userA = insertUser(db, { email: 'an@example.com', passwordHash: 'scrypt$stub' }).id
    userB = insertUser(db, { email: 'binh@example.com', passwordHash: 'scrypt$stub' }).id
  })

  afterEach(() => {
    sqlite.close()
  })

  function thread(userId: string, title: string, createdAt: number) {
    return insertChatThread(db, { userId, title, locale: 'vi', createdAt })
  }

  it('lưu thread + tin nhắn, đọc lại đúng thứ tự và dishIds', () => {
    const threadId = thread(userA, 'Trưa nay ăn gì?', 1_000)
    appendChatMessage(db, {
      threadId,
      role: 'user',
      content: 'Trưa nay 40k ăn gì?',
      createdAt: 1_100,
    })
    appendChatMessage(db, {
      threadId,
      role: 'assistant',
      content: 'Thử cơm tấm nhé.',
      dishIds: ['com-tam'],
      createdAt: 1_200,
    })

    const found = getChatThreadForUser(db, threadId, userA)

    expect(found).not.toBeNull()
    expect(found!.thread.title).toBe('Trưa nay ăn gì?')
    expect(found!.thread.locale).toBe('vi')
    expect(found!.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(found!.messages.map((message) => message.content)).toEqual([
      'Trưa nay 40k ăn gì?',
      'Thử cơm tấm nhé.',
    ])
    expect(found!.messages[1]!.dishIds).toEqual(['com-tam'])
    expect(found!.messages[0]!.dishIds).toEqual([])
  })

  it('danh sách thread: lần nhắn cuối mới nhất lên đầu', () => {
    const older = thread(userA, 'Cũ', 1_000)
    appendChatMessage(db, { threadId: older, role: 'user', content: 'cũ', createdAt: 1_100 })

    const newer = thread(userA, 'Mới', 2_000)
    appendChatMessage(db, { threadId: newer, role: 'user', content: 'mới', createdAt: 2_100 })

    const rows = listChatThreadsForUser(db, userA)

    expect(rows.map((row) => row.title)).toEqual(['Mới', 'Cũ'])
    expect(rows.map((row) => row.messageCount)).toEqual([1, 1])
    expect(rows[0]!.updatedAt).toBe(2_100)
  })

  it('thread vừa nhắn lại nhảy lên đầu dù tạo trước', () => {
    const older = thread(userA, 'Cũ', 1_000)
    const newer = thread(userA, 'Mới', 2_000)
    appendChatMessage(db, { threadId: newer, role: 'user', content: 'mới', createdAt: 2_100 })
    appendChatMessage(db, { threadId: older, role: 'user', content: 'nhắn lại', createdAt: 3_000 })

    const rows = listChatThreadsForUser(db, userA)

    expect(rows.map((row) => row.title)).toEqual(['Cũ', 'Mới'])
  })

  it('giới hạn số thread trả về', () => {
    for (let index = 0; index < 5; index += 1) {
      appendChatMessage(db, {
        threadId: thread(userA, `Thread ${index}`, 1_000 + index),
        role: 'user',
        content: 'xin chào',
        createdAt: 1_000 + index,
      })
    }

    expect(listChatThreadsForUser(db, userA, 2)).toHaveLength(2)
  })

  it('không đọc được thread của user khác', () => {
    const theirs = thread(userB, 'Của Bình', 1_000)
    appendChatMessage(db, { threadId: theirs, role: 'user', content: 'bí mật' })

    expect(getChatThreadForUser(db, theirs, userA)).toBeNull()
    expect(listChatThreadsForUser(db, userA)).toEqual([])
  })

  it('xoá thread của mình thì mất luôn tin nhắn', () => {
    const threadId = thread(userA, 'Xoá nhé', 1_000)
    appendChatMessage(db, { threadId, role: 'user', content: 'xoá đi' })

    expect(deleteChatThreadForUser(db, threadId, userA)).toBe(true)
    expect(getChatThreadForUser(db, threadId, userA)).toBeNull()
    expect(listChatThreadsForUser(db, userA)).toEqual([])
  })

  it('không xoá được thread của người khác', () => {
    const theirs = thread(userB, 'Của Bình', 1_000)

    expect(deleteChatThreadForUser(db, theirs, userA)).toBe(false)
    expect(getChatThreadForUser(db, theirs, userB)).not.toBeNull()
  })

  it('thread chưa có tin nhắn hiện với updatedAt = createdAt', () => {
    thread(userA, 'Trống', 5_000)

    const [row] = listChatThreadsForUser(db, userA)

    expect(row!.messageCount).toBe(0)
    expect(row!.updatedAt).toBe(5_000)
  })
})
