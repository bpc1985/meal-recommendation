import { describe, expect, it } from 'vitest'
import { budgetPrefillFromSearch, parseRecommendSearch } from './recommend-input'

describe('parseRecommendSearch', () => {
  it('nhận đơn vị và số tiền hợp lệ từ URL', () => {
    expect(parseRecommendSearch({ unit: 'day', amount: 111_000 })).toEqual({
      unit: 'day',
      amount: 111_000,
    })
  })

  it('bỏ số tiền rác nhưng giữ đơn vị hợp lệ', () => {
    for (const amount of [-5, 0, 999, 1.5, 100_000_001, '111000', null, true]) {
      expect(parseRecommendSearch({ unit: 'day', amount })).toEqual({
        unit: 'day',
        amount: undefined,
      })
    }
  })

  it('bỏ đơn vị lạ nhưng giữ số tiền hợp lệ', () => {
    expect(parseRecommendSearch({ unit: 'week', amount: 60_000 })).toEqual({
      unit: undefined,
      amount: 60_000,
    })
  })

  it('luôn trả đủ hai khoá, kể cả khi URL không có gì', () => {
    const search = parseRecommendSearch({})

    expect(Object.keys(search).sort()).toEqual(['amount', 'unit'])
    expect(search).toEqual({ unit: undefined, amount: undefined })
  })
})

describe('budgetPrefillFromSearch', () => {
  it('trả ngân sách khi URL có đủ đơn vị và số tiền hợp lệ', () => {
    expect(budgetPrefillFromSearch({ unit: 'day', amount: 103_000 })).toEqual({
      unit: 'day',
      amount: 103_000,
    })
  })

  it('không coi là điền sẵn khi URL thiếu hoặc hỏng một trong hai khoá', () => {
    expect(budgetPrefillFromSearch(parseRecommendSearch({}))).toBeNull()
    expect(budgetPrefillFromSearch(parseRecommendSearch({ unit: 'day', amount: -5 }))).toBeNull()
    expect(
      budgetPrefillFromSearch(parseRecommendSearch({ unit: 'week', amount: 60_000 })),
    ).toBeNull()
    expect(budgetPrefillFromSearch(parseRecommendSearch({ amount: 60_000 }))).toBeNull()
  })
})
