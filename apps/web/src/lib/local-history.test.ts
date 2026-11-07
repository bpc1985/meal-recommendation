import { describe, expect, it } from 'vitest'
import type { ChatUiMessage } from './chat-types'
import {
  CHAT_HISTORY_KEY,
  CHAT_HISTORY_LIMIT,
  clearChatHistory,
  loadChatHistory,
  saveChatHistory,
} from './local-history'

function fakeStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial))

  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
    removeItem: (key: string) => {
      entries.delete(key)
    },
    dump: () => Object.fromEntries(entries),
  }
}

function message(index: number): ChatUiMessage {
  return {
    id: `m${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message ${index}`,
  }
}

describe('chat history', () => {
  it('lưu và đọc lại nguyên vẹn', () => {
    const storage = fakeStorage()
    const messages: ChatUiMessage[] = [
      message(0),
      {
        ...message(1),
        dishes: [
          {
            id: 'com-chay',
            nameVi: 'Cơm chay',
            nameEn: 'Vegetarian rice',
            priceVnd: 35_000,
            mealTypes: ['lunch'],
          },
        ],
        degraded: true,
      },
    ]

    saveChatHistory(storage, messages)

    expect(loadChatHistory(storage)).toEqual(messages)
  })

  it('chỉ giữ 40 tin nhắn gần nhất', () => {
    const storage = fakeStorage()
    const messages = Array.from({ length: 55 }, (_, index) => message(index))

    saveChatHistory(storage, messages)
    const loaded = loadChatHistory(storage)

    expect(loaded).toHaveLength(CHAT_HISTORY_LIMIT)
    expect(loaded[0]?.id).toBe('m15')
    expect(loaded.at(-1)?.id).toBe('m54')
  })

  it('JSON hỏng → trả mảng rỗng, không throw', () => {
    const storage = fakeStorage({ [CHAT_HISTORY_KEY]: '{not json' })

    expect(loadChatHistory(storage)).toEqual([])
  })

  it('bỏ qua phần tử sai shape nhưng giữ phần tử hợp lệ', () => {
    const storage = fakeStorage({
      [CHAT_HISTORY_KEY]: JSON.stringify([
        { id: 'ok', role: 'user', content: 'hi' },
        { role: 'assistant', content: 'missing id' },
        null,
        { id: 'bad-role', role: 'system', content: 'nope' },
      ]),
    })

    expect(loadChatHistory(storage).map((item) => item.id)).toEqual(['ok'])
  })

  it('xoá hội thoại', () => {
    const storage = fakeStorage()
    saveChatHistory(storage, [message(0)])

    clearChatHistory(storage)

    expect(storage.dump()).toEqual({})
  })

  it('storage đầy (quota) không làm crash UI', () => {
    const storage = fakeStorage()
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    expect(() => saveChatHistory(storage, [message(0)])).not.toThrow()
  })
})
