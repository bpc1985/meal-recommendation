import { describe, expect, it } from 'vitest'
import {
  createTranslator,
  dictionaries,
  formatDateTime,
  formatNumber,
  formatVnd,
  parseLocale,
} from './index'

describe('dictionaries', () => {
  it('vi và en có đúng cùng bộ key', () => {
    const viKeys = Object.keys(dictionaries.vi).sort()
    const enKeys = Object.keys(dictionaries.en).sort()

    expect(enKeys).toEqual(viKeys)
  })

  it('không có giá trị rỗng', () => {
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('')
      }
    }
  })
})

describe('createTranslator', () => {
  it('dịch theo locale', () => {
    expect(createTranslator('vi')('nav.recommend')).toBe('Gợi ý bữa ăn')
    expect(createTranslator('en')('nav.recommend')).toBe('Meal ideas')
  })

  it('nội suy tham số', () => {
    expect(createTranslator('vi')('recommend.roleBudgetHint', { amount: '60.000 ₫' })).toBe(
      'Gợi ý 60.000 ₫ mỗi ngày',
    )
    expect(createTranslator('en')('recommend.roleBudgetHint', { amount: '₫60,000' })).toBe(
      'Suggested ₫60,000 per day',
    )
  })

  it('giữ nguyên placeholder nếu thiếu tham số', () => {
    expect(createTranslator('vi')('recommend.roleBudgetHint', {})).toContain('{amount}')
  })
})

describe('parseLocale', () => {
  it('mặc định vi', () => {
    expect(parseLocale(undefined)).toBe('vi')
    expect(parseLocale('fr')).toBe('vi')
  })

  it('nhận en', () => {
    expect(parseLocale('en')).toBe('en')
    expect(parseLocale('vi')).toBe('vi')
  })
})

describe('formatters', () => {
  it('định dạng VND theo vi-VN', () => {
    expect(formatVnd(45_000, 'vi')).toBe('45.000\u00A0₫')
  })

  it('định dạng VND theo en-US', () => {
    expect(formatVnd(45_000, 'en')).toBe('₫45,000')
  })

  it('không hiển thị phần thập phân', () => {
    expect(formatVnd(45_500, 'vi')).not.toMatch(/[,.]\d{2}\s?₫/)
  })

  it('định dạng số thường', () => {
    expect(formatNumber(1_500_000, 'vi')).toBe('1.500.000')
    expect(formatNumber(1_500_000, 'en')).toBe('1,500,000')
  })

  it('định dạng ngày + giờ theo múi giờ Việt Nam', () => {
    // 07:32 UTC = 14:32 giờ Việt Nam, ngày 02/11.
    const at = new Date('2026-11-02T07:32:00Z')

    expect(formatDateTime(at, 'vi')).toContain('14:32')
    expect(formatDateTime(at, 'en')).toContain('14:32')
    expect(formatDateTime(at, 'vi')).toMatch(/02/)
    // Ngày đứng trước giờ, không phụ thuộc thứ tự mặc định của ICU.
    expect(formatDateTime(at, 'vi').indexOf('02')).toBeLessThan(
      formatDateTime(at, 'vi').indexOf('14:32'),
    )
  })
})
