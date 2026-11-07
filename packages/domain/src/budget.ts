import { z } from 'zod'

export const budgetUnits = ['meal', 'day', 'month'] as const
export type BudgetUnit = (typeof budgetUnits)[number]

export const budgetSchema = z.object({
  unit: z.enum(budgetUnits),
  amount: z
    .number()
    .int('Ngân sách phải là số nguyên')
    .min(1_000, 'Ngân sách tối thiểu 1.000đ')
    .max(100_000_000, 'Ngân sách tối đa 100.000.000đ'),
})

export type Budget = z.infer<typeof budgetSchema>

/** Tỉ lệ phân bổ ngân sách ngày cho 3 bữa. Tổng = 1. */
export const MEAL_SPLIT = {
  breakfast: 0.25,
  lunch: 0.4,
  dinner: 0.35,
} as const

export const VND_STEP = 1_000

const floorToStep = (value: number): number => Math.floor(value / VND_STEP) * VND_STEP

/**
 * Quy mọi đơn vị ngân sách về ngân sách/ngày, làm tròn xuống bội số 1.000đ.
 * Đây là đơn vị chuẩn duy nhất mà phần còn lại của hệ thống dùng để so sánh.
 */
export function toDailyBudget(budget: Budget, daysInMonth = 30): number {
  const daily =
    budget.unit === 'meal'
      ? budget.amount * 3
      : budget.unit === 'day'
        ? budget.amount
        : budget.amount / daysInMonth

  return floorToStep(daily)
}

export interface MealBudgetSplit {
  breakfast: number
  lunch: number
  dinner: number
}

/**
 * Chia ngân sách ngày cho 3 bữa theo MEAL_SPLIT.
 * Phần lẻ do làm tròn được dồn hết vào bữa tối để tổng luôn khớp ngân sách ngày.
 */
export function splitMealBudget(dailyVnd: number): MealBudgetSplit {
  const total = Math.max(0, Math.floor(dailyVnd))
  const breakfast = floorToStep(total * MEAL_SPLIT.breakfast)
  const lunch = floorToStep(total * MEAL_SPLIT.lunch)

  return { breakfast, lunch, dinner: total - breakfast - lunch }
}

export function sumVnd(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0)
}

/** Số dư còn lại; âm nghĩa là đã vượt ngân sách. */
export function remainingVnd(budgetVnd: number, spentVnd: number): number {
  return budgetVnd - spentVnd
}
