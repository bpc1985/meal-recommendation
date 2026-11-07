import { describe, expect, it } from 'vitest'
import { chatThreadInputSchema } from './chat-input'

describe('chatThreadInputSchema', () => {
  it('nhận threadId thường', () => {
    expect(chatThreadInputSchema.safeParse({ threadId: 'thread-1' }).success).toBe(true)
  })

  it('từ chối threadId rỗng hoặc chỉ khoảng trắng', () => {
    expect(chatThreadInputSchema.safeParse({ threadId: '   ' }).success).toBe(false)
  })

  it('từ chối threadId quá dài', () => {
    expect(chatThreadInputSchema.safeParse({ threadId: 'x'.repeat(81) }).success).toBe(false)
  })
})
