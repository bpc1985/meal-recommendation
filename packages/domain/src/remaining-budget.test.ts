import { describe, expect, it } from 'vitest'
import { todayIsoDate } from './calendar'
import { remainingBudget } from './remaining-budget'

/** Thực đơn 7 ngày, 100.000₫/ngày, bắt đầu 01/11/2026. */
const week = {
  startDate: '2026-11-01',
  days: 7,
  budgetVnd: 700_000,
  dayTotals: [85_000, 90_000, 80_000, 95_000, 70_000, 100_000, 60_000],
}

describe('remainingBudget', () => {
  it('báo chưa bắt đầu khi hôm nay trước ngày đầu thực đơn', () => {
    expect(remainingBudget({ ...week, today: '2026-10-31' })).toEqual({ kind: 'notStarted' })
  })

  it('ngày đầu: chưa tiêu gì, ngân sách mới bằng ngân sách gốc mỗi ngày', () => {
    expect(remainingBudget({ ...week, today: '2026-11-01' })).toEqual({
      kind: 'inProgress',
      spentVnd: 0,
      remainingVnd: 700_000,
      daysLeft: 7,
      newDailyVnd: 100_000,
      overspentVnd: 0,
    })
  })

  it('giữa chừng: cộng các ngày trước hôm nay, chia phần còn lại cho số ngày còn lại kể cả hôm nay', () => {
    expect(remainingBudget({ ...week, today: '2026-11-04' })).toEqual({
      kind: 'inProgress',
      spentVnd: 255_000,
      remainingVnd: 445_000,
      daysLeft: 4,
      newDailyVnd: 111_000,
      overspentVnd: 0,
    })
  })

  it('ngày cuối: còn đúng một ngày', () => {
    const spent = 85_000 + 90_000 + 80_000 + 95_000 + 70_000 + 100_000

    expect(remainingBudget({ ...week, today: '2026-11-07' })).toEqual({
      kind: 'inProgress',
      spentVnd: spent,
      remainingVnd: 700_000 - spent,
      daysLeft: 1,
      newDailyVnd: 180_000,
      overspentVnd: 0,
    })
  })

  it('đã kết thúc: tổng đã tiêu là cả thực đơn', () => {
    expect(remainingBudget({ ...week, today: '2026-11-08' })).toEqual({
      kind: 'finished',
      spentVnd: 580_000,
      remainingVnd: 120_000,
      overspentVnd: 0,
    })
  })

  it('làm tròn ngân sách mới xuống bội 1.000₫', () => {
    const result = remainingBudget({
      startDate: '2026-11-01',
      days: 3,
      budgetVnd: 100_000,
      dayTotals: [0, 0, 0],
      today: '2026-11-01',
    })

    expect(result).toMatchObject({ kind: 'inProgress', newDailyVnd: 33_000 })
  })

  it('chi vượt ngân sách: còn lại và ngân sách mới về 0, kèm số tiền vượt', () => {
    const result = remainingBudget({
      startDate: '2026-11-01',
      days: 4,
      budgetVnd: 400_000,
      dayTotals: [250_000, 200_000, 50_000, 50_000],
      today: '2026-11-03',
    })

    expect(result).toEqual({
      kind: 'inProgress',
      spentVnd: 450_000,
      remainingVnd: 0,
      daysLeft: 2,
      newDailyVnd: 0,
      overspentVnd: 50_000,
    })
  })

  it('thực đơn đã kết thúc mà chi vượt cũng báo số tiền vượt', () => {
    const result = remainingBudget({
      startDate: '2026-11-01',
      days: 2,
      budgetVnd: 200_000,
      dayTotals: [150_000, 120_000],
      today: '2026-12-01',
    })

    expect(result).toEqual({
      kind: 'finished',
      spentVnd: 270_000,
      remainingVnd: 0,
      overspentVnd: 70_000,
    })
  })

  it('ngày chưa có món tính là 0₫', () => {
    const result = remainingBudget({ ...week, dayTotals: [85_000], today: '2026-11-04' })

    expect(result).toMatchObject({ kind: 'inProgress', spentVnd: 85_000 })
  })

  it('ranh giới nửa đêm giờ Việt Nam: 23:59:59 vẫn là hôm trước, 00:00 sang ngày mới', () => {
    // 2026-11-03T16:59:59Z là 23:59:59 ngày 03/11 ở Việt Nam (UTC+7).
    const beforeMidnight = todayIsoDate(new Date('2026-11-03T16:59:59Z'))
    const afterMidnight = todayIsoDate(new Date('2026-11-03T17:00:00Z'))

    expect(remainingBudget({ ...week, today: beforeMidnight })).toMatchObject({
      kind: 'inProgress',
      spentVnd: 175_000,
      daysLeft: 5,
    })
    expect(remainingBudget({ ...week, today: afterMidnight })).toMatchObject({
      kind: 'inProgress',
      spentVnd: 255_000,
      daysLeft: 4,
    })
  })

  it('ranh giới nửa đêm trước ngày đầu: 23:59 hôm trước là chưa bắt đầu', () => {
    expect(
      remainingBudget({ ...week, today: todayIsoDate(new Date('2026-10-31T16:59:59Z')) }),
    ).toEqual({ kind: 'notStarted' })
    expect(
      remainingBudget({ ...week, today: todayIsoDate(new Date('2026-10-31T17:00:00Z')) }),
    ).toMatchObject({ kind: 'inProgress', spentVnd: 0, daysLeft: 7 })
  })
})
