import { describe, expect, it } from 'vitest'
import { recommendInputSchema } from '../lib/recommend-input'

const valid = {
  roleSlug: 'student',
  budget: { unit: 'day', amount: 60_000 },
  dietTags: [],
  locale: 'vi',
}

describe('recommendInputSchema', () => {
  it('nhận input hợp lệ', () => {
    expect(recommendInputSchema.safeParse(valid).success).toBe(true)
  })

  it('từ chối ngân sách âm', () => {
    const result = recommendInputSchema.safeParse({
      ...valid,
      budget: { unit: 'day', amount: -1 },
    })

    expect(result.success).toBe(false)
  })

  it('từ chối đơn vị ngân sách lạ', () => {
    const result = recommendInputSchema.safeParse({
      ...valid,
      budget: { unit: 'year', amount: 1_000_000 },
    })

    expect(result.success).toBe(false)
  })

  it('từ chối ngân sách lẻ dưới 1.000đ', () => {
    expect(
      recommendInputSchema.safeParse({ ...valid, budget: { unit: 'day', amount: 999 } }).success,
    ).toBe(false)
  })

  it('từ chối diet tag ngoài allowlist (chặn injection vào SQL LIKE)', () => {
    const result = recommendInputSchema.safeParse({ ...valid, dietTags: ["pork' OR 1=1 --"] })

    expect(result.success).toBe(false)
  })

  it('mặc định locale vi và dietTags rỗng', () => {
    const parsed = recommendInputSchema.parse({
      roleSlug: 'student',
      budget: { unit: 'day', amount: 60_000 },
    })

    expect(parsed.locale).toBe('vi')
    expect(parsed.dietTags).toEqual([])
  })

  it('từ chối vai trò rỗng', () => {
    expect(recommendInputSchema.safeParse({ ...valid, roleSlug: '   ' }).success).toBe(false)
  })
})
