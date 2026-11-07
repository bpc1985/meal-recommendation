import { describe, expect, it, vi } from 'vitest'

// advisor.ts dựng advisor ngay khi import theo process.env (có thể đã nạp từ .env gốc),
// nên ép mock trước khi import để test không phụ thuộc máy đang chạy.
vi.stubEnv('AI_PROVIDER', 'mock')
const { createAdvisorFromEnv } = await import('./advisor')

describe('createAdvisorFromEnv', () => {
  it('không đặt AI_PROVIDER → dùng mock', () => {
    expect(createAdvisorFromEnv({}).kind).toBe('mock')
  })

  it('AI_PROVIDER=gemini có key → advisor Gemini', () => {
    const advisor = createAdvisorFromEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' })

    expect(advisor.kind).toBe('gemini')
  })

  it('AI_PROVIDER=gemini thiếu key → nổ ngay, nêu tên GEMINI_API_KEY', () => {
    expect(() => createAdvisorFromEnv({ AI_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY/)
  })

  it('AI_PROVIDER=openrouter đã bị bỏ → báo không hợp lệ', () => {
    expect(() => createAdvisorFromEnv({ AI_PROVIDER: 'openrouter' })).toThrow(/không hợp lệ/)
  })
})
