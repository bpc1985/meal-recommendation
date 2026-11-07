import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, todayIsoDate } from './calendar'

describe('addDays', () => {
  it('cộng qua tháng và năm', () => {
    expect(addDays('2026-11-02', 0)).toBe('2026-11-02')
    expect(addDays('2026-11-02', 29)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('lùi ngày khi số ngày âm', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
  })
})

describe('daysBetween', () => {
  it('đếm số ngày từ ngày đầu tới ngày sau, âm nếu ngày sau đứng trước', () => {
    expect(daysBetween('2026-11-04', '2026-11-04')).toBe(0)
    expect(daysBetween('2026-11-01', '2026-11-04')).toBe(3)
    expect(daysBetween('2026-11-05', '2026-11-04')).toBe(-1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })
})

describe('todayIsoDate', () => {
  it('lấy ngày theo giờ Việt Nam, không theo UTC', () => {
    expect(todayIsoDate(new Date('2026-11-01T18:30:00Z'))).toBe('2026-11-02')
    expect(todayIsoDate(new Date('2026-11-01T16:59:00Z'))).toBe('2026-11-01')
  })
})
