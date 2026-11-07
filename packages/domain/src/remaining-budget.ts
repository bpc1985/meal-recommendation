import { VND_STEP, sumVnd } from './budget'
import { daysBetween } from './calendar'

export interface RemainingBudgetInput {
  /** `YYYY-MM-DD` */
  startDate: string
  days: number
  budgetVnd: number
  /** Tổng tiền từng ngày, chỉ số là `dayIndex`; ngày thiếu tính 0₫. */
  dayTotals: readonly number[]
  /** `YYYY-MM-DD` theo giờ Việt Nam, server tính rồi truyền vào. */
  today: string
}

/**
 * Ba giai đoạn của một thực đơn so với hôm nay. Chi vượt thì `remainingVnd` và
 * `newDailyVnd` về 0, phần vượt nằm ở `overspentVnd`.
 */
export type RemainingBudget =
  | { kind: 'notStarted' }
  | {
      kind: 'inProgress'
      spentVnd: number
      remainingVnd: number
      /** Kể cả hôm nay. */
      daysLeft: number
      newDailyVnd: number
      overspentVnd: number
    }
  | { kind: 'finished'; spentVnd: number; remainingVnd: number; overspentVnd: number }

/** "Đã tiêu" là tổng các ngày của thực đơn đứng trước hôm nay. */
export function remainingBudget({
  startDate,
  days,
  budgetVnd,
  dayTotals,
  today,
}: RemainingBudgetInput): RemainingBudget {
  const elapsed = daysBetween(startDate, today)
  if (elapsed < 0) return { kind: 'notStarted' }

  const spentDays = Math.min(elapsed, days)
  const spentVnd = sumVnd(dayTotals.slice(0, spentDays))
  const balance = budgetVnd - spentVnd
  const remainingVnd = Math.max(0, balance)
  const overspentVnd = Math.max(0, -balance)

  if (elapsed >= days) return { kind: 'finished', spentVnd, remainingVnd, overspentVnd }

  const daysLeft = days - elapsed

  return {
    kind: 'inProgress',
    spentVnd,
    remainingVnd,
    daysLeft,
    newDailyVnd: Math.floor(remainingVnd / daysLeft / VND_STEP) * VND_STEP,
    overspentVnd,
  }
}
