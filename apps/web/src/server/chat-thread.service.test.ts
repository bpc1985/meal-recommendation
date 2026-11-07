import type { Db } from '@mam/db'
import { findDishCandidates, getChatThreadForUser, insertUser } from '@mam/db'
import { createTestDb } from '@mam/db/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  beginChatTurn,
  chatThreadTitle,
  deleteChatThread,
  finishChatTurn,
  getChatThread,
  listChatThreads,
} from './chat-thread.service'

describe('chat-thread.service', () => {
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

  it('lượt đầu tạo thread mới, tiêu đề lấy từ câu hỏi', () => {
    const { threadId, created } = beginChatTurn(db, {
      userId: userA,
      locale: 'vi',
      message: '  Trưa nay   40k ăn gì?  ',
    })

    expect(created).toBe(true)

    const detail = getChatThread(db, userA, threadId)

    expect(detail!.thread.title).toBe('Trưa nay 40k ăn gì?')
    expect(detail!.thread.locale).toBe('vi')
    expect(detail!.messages).toHaveLength(1)
    expect(detail!.messages[0]!.role).toBe('user')
    expect(detail!.messages[0]!.content).toBe('Trưa nay   40k ăn gì?')
  })

  it('lượt tiếp theo nhắn vào thread cũ, không tạo thread mới', () => {
    const first = beginChatTurn(db, { userId: userA, locale: 'vi', message: 'Câu một' })
    const second = beginChatTurn(db, {
      userId: userA,
      locale: 'vi',
      threadId: first.threadId,
      message: 'Câu hai',
    })

    expect(second.created).toBe(false)
    expect(second.threadId).toBe(first.threadId)
    expect(listChatThreads(db, userA)).toHaveLength(1)

    const detail = getChatThread(db, userA, first.threadId)
    expect(detail!.messages.map((message) => message.content)).toEqual(['Câu một', 'Câu hai'])
  })

  it('threadId của người khác thì tạo thread mới, không ghi vào thread đó', () => {
    const theirs = beginChatTurn(db, { userId: userB, locale: 'vi', message: 'Của Bình' })
    const mine = beginChatTurn(db, {
      userId: userA,
      locale: 'vi',
      threadId: theirs.threadId,
      message: 'Mượn thread',
    })

    expect(mine.threadId).not.toBe(theirs.threadId)
    expect(mine.created).toBe(true)

    const theirsAfter = getChatThread(db, userB, theirs.threadId)
    expect(theirsAfter!.messages).toHaveLength(1)
    expect(theirsAfter!.messages[0]!.content).toBe('Của Bình')
  })

  it('lưu câu trả lời kèm món, đọc lại ra ChatDish có tên/giá từ DB', () => {
    const dish = findDishCandidates(db, { mealType: 'lunch', maxPriceVnd: 100_000, limit: 1 })[0]!
    const { threadId } = beginChatTurn(db, { userId: userA, locale: 'vi', message: 'Trưa ăn gì?' })

    finishChatTurn(db, {
      threadId,
      text: 'Thử món này nhé.',
      dishIds: [dish.id, 'khong-ton-tai', dish.id],
    })

    const detail = getChatThread(db, userA, threadId)
    const assistant = detail!.messages[1]!

    expect(assistant.content).toBe('Thử món này nhé.')
    expect(assistant.dishes).toHaveLength(1)
    expect(assistant.dishes![0]!.id).toBe(dish.id)
    expect(assistant.dishes![0]!.nameVi).toBe(dish.nameVi)
    expect(assistant.dishes![0]!.priceVnd).toBe(dish.priceVnd)
  })

  it('câu trả lời rỗng thì không ghi row nào', () => {
    const { threadId } = beginChatTurn(db, { userId: userA, locale: 'vi', message: 'Hỏi' })

    finishChatTurn(db, { threadId, text: '   ', dishIds: [] })

    expect(getChatThread(db, userA, threadId)!.messages).toHaveLength(1)
  })

  it('danh sách thread mới nhất lên đầu', () => {
    const older = beginChatTurn(db, { userId: userA, locale: 'vi', message: 'Cũ' })
    const newer = beginChatTurn(db, { userId: userA, locale: 'vi', message: 'Mới' })
    beginChatTurn(db, {
      userId: userA,
      locale: 'vi',
      threadId: older.threadId,
      message: 'Nhắn lại',
    })

    expect(listChatThreads(db, userA).map((thread) => thread.title)).toEqual(['Cũ', 'Mới'])
    expect(listChatThreads(db, userA).map((thread) => thread.id)).toContain(newer.threadId)
  })

  it('không đọc/xoá được thread của người khác', () => {
    const theirs = beginChatTurn(db, { userId: userB, locale: 'vi', message: 'Của Bình' })

    expect(getChatThread(db, userA, theirs.threadId)).toBeNull()
    expect(deleteChatThread(db, userA, theirs.threadId)).toBe(false)
    expect(getChatThread(db, userB, theirs.threadId)).not.toBeNull()
  })

  it('xoá thread của mình', () => {
    const mine = beginChatTurn(db, { userId: userA, locale: 'en', message: 'Delete me' })

    expect(deleteChatThread(db, userA, mine.threadId)).toBe(true)
    expect(listChatThreads(db, userA)).toEqual([])
  })

  it('tiêu đề dài bị cắt, khoảng trắng gộp lại', () => {
    expect(chatThreadTitle('  a\n\nb   c ')).toBe('a b c')

    const long = chatThreadTitle('x'.repeat(200))
    expect(long).toHaveLength(60)
    expect(long.endsWith('…')).toBe(true)
  })

  it('thread lưu dish id nhưng đọc ra đúng thứ tự món', () => {
    const dishes = findDishCandidates(db, {
      mealType: 'dinner',
      maxPriceVnd: 100_000,
      limit: 2,
    })
    const { threadId } = beginChatTurn(db, { userId: userA, locale: 'vi', message: 'Tối ăn gì?' })
    finishChatTurn(db, {
      threadId,
      text: 'Hai món nhé.',
      dishIds: dishes.map((dish) => dish.id).reverse(),
    })

    const assistant = getChatThread(db, userA, threadId)!.messages[1]!
    expect(assistant.dishes!.map((dish) => dish.id)).toEqual(
      dishes.map((dish) => dish.id).reverse(),
    )
  })

  it('thread của user khác không lẫn vào danh sách', () => {
    beginChatTurn(db, { userId: userA, locale: 'vi', message: 'Của A' })
    beginChatTurn(db, { userId: userB, locale: 'vi', message: 'Của B' })

    expect(listChatThreads(db, userA).map((thread) => thread.title)).toEqual(['Của A'])
    expect(getChatThreadForUser(db, listChatThreads(db, userB)[0]!.id, userA)).toBeNull()
  })
})
