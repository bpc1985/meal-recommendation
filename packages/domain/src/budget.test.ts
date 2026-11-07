import { describe, expect, it } from 'vitest'
import {
  MEAL_SPLIT,
  remainingVnd,
  splitMealBudget,
  sumVnd,
  toDailyBudget,
  type Budget,
} from './budget'

const budget = (unit: Budget['unit'], amount: number): Budget => ({ unit, amount })

describe('toDailyBudget', () => {
  it('nhân 3 khi ngân sách tính theo bữa', () => {
    expect(toDailyBudget(budget('meal', 15_000))).toBe(45_000)
  })

  it('giữ nguyên khi ngân sách tính theo ngày', () => {
    expect(toDailyBudget(budget('day', 120_000))).toBe(120_000)
  })

  it('chia theo số ngày trong tháng khi ngân sách tính theo tháng', () => {
    expect(toDailyBudget(budget('month', 2_500_000), 30)).toBe(83_000)
  })

  it('dùng 31 ngày cho tháng 31 ngày', () => {
    expect(toDailyBudget(budget('month', 3_100_000), 31)).toBe(100_000)
  })

  it('luôn làm tròn xuống bội số 1.000đ', () => {
    expect(toDailyBudget(budget('day', 99_999))).toBe(99_000)
  })

  it('không trả số âm với ngân sách nhỏ nhất hợp lệ', () => {
    expect(toDailyBudget(budget('meal', 1_000))).toBe(3_000)
  })
})

describe('splitMealBudget', () => {
  it('chia đúng tỉ lệ 25/40/35 khi chia hết', () => {
    expect(splitMealBudget(60_000)).toEqual({
      breakfast: 15_000,
      lunch: 24_000,
      dinner: 21_000,
    })
  })

  it('tổng ba bữa luôn bằng đúng ngân sách ngày (không mất đồng nào)', () => {
    for (const daily of [60_000, 61_000, 83_000, 7_000, 1_000, 999_000]) {
      const split = splitMealBudget(daily)
      const total = split.breakfast + split.lunch + split.dinner
      expect(total).toBe(daily)
    }
  })

  it('không bữa nào âm khi ngân sách ngày rất thấp', () => {
    const split = splitMealBudget(1_000)
    expect(split.breakfast).toBeGreaterThanOrEqual(0)
    expect(split.lunch).toBeGreaterThanOrEqual(0)
    expect(split.dinner).toBeGreaterThanOrEqual(0)
  })

  it('trả toàn số 0 với ngân sách 0', () => {
    expect(splitMealBudget(0)).toEqual({ breakfast: 0, lunch: 0, dinner: 0 })
  })

  it('tỉ lệ khớp hằng số MEAL_SPLIT', () => {
    expect(MEAL_SPLIT.breakfast + MEAL_SPLIT.lunch + MEAL_SPLIT.dinner).toBeCloseTo(1)
  })
})

describe('sumVnd', () => {
  it('cộng danh sách giá', () => {
    expect(sumVnd([15_000, 24_000, 21_000])).toBe(60_000)
  })

  it('trả 0 cho danh sách rỗng', () => {
    expect(sumVnd([])).toBe(0)
  })
})

describe('remainingVnd', () => {
  it('dương khi còn dư', () => {
    expect(remainingVnd(60_000, 55_000)).toBe(5_000)
  })

  it('âm khi vượt ngân sách (không kẹp về 0)', () => {
    expect(remainingVnd(60_000, 65_000)).toBe(-5_000)
  })
})
