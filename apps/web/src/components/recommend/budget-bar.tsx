import { usePreferences } from '@/components/preferences-provider'
import { cn } from '@/lib/utils'

interface BudgetBarProps {
  spentVnd: number
  budgetVnd: number
}

export function BudgetBar({ spentVnd, budgetVnd }: BudgetBarProps) {
  const { t, formatMoney } = usePreferences()

  const ratio = budgetVnd > 0 ? spentVnd / budgetVnd : 1
  const remaining = budgetVnd - spentVnd
  const tone = ratio > 1 ? 'bg-budget-over' : ratio > 0.9 ? 'bg-budget-warn' : 'bg-budget-safe'

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {t('budget.usedOf', {
            spent: formatMoney(spentVnd),
            budget: formatMoney(budgetVnd),
          })}
        </span>
        <span className={cn('tabular font-medium', remaining < 0 && 'text-destructive')}>
          {remaining >= 0
            ? t('recommend.remaining', { amount: formatMoney(remaining) })
            : t('recommend.overBudget', { amount: formatMoney(Math.abs(remaining)) })}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={budgetVnd}
        aria-valuenow={Math.min(spentVnd, budgetVnd)}
        aria-label={t('recommend.total')}
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-budget-track"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', tone)}
          style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
        />
      </div>
    </div>
  )
}
