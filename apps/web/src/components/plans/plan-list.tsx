import { Link } from '@tanstack/react-router'
import { CalendarDays, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { usePreferences } from '@/components/preferences-provider'
import { Button } from '@/components/ui/button'
import type { PlanSummary } from '@/lib/plan-types'

interface PlanListProps {
  plans: PlanSummary[]
  deletingId: string | null
  onDelete: (planId: string) => void
}

export function PlanList({ plans, deletingId, onDelete }: PlanListProps) {
  const { t, formatMoney, formatDay } = usePreferences()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  if (plans.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-dashed border-border/80 px-5 py-8 text-sm text-muted-foreground">
        {t('plans.list.empty')}
      </p>
    )
  }

  return (
    <ul className="mt-6 grid list-none gap-3 p-0 lg:grid-cols-2">
      {plans.map((plan) => {
        const confirming = confirmingId === plan.id
        const deleting = deletingId === plan.id

        return (
          <li
            key={plan.id}
            data-testid={`plan-card-${plan.id}`}
            className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold tracking-tight">{plan.title}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden />
                  {formatDay(plan.startDate)} ·{' '}
                  {t('plans.list.meta', { days: plan.days, count: plan.itemCount })}
                </p>
              </div>
              <p className="tabular text-lg font-semibold">
                <span className="sr-only">{t('plans.list.total')}: </span>
                {formatMoney(plan.totalVnd)}
              </p>
            </div>

            <p className="mt-2 text-xs text-muted-foreground tabular">
              {t('plans.list.budget')}: {formatMoney(plan.dailyBudgetVnd * plan.days)}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button asChild size="sm" className="rounded-xl">
                <Link to="/plans/$planId" params={{ planId: plan.id }}>
                  {t('plans.list.view')}
                </Link>
              </Button>

              {confirming ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('plans.list.deleteConfirm')}
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="rounded-xl"
                    data-testid={`plan-delete-confirm-${plan.id}`}
                    onClick={() => onDelete(plan.id)}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    {t('plans.list.deleteYes')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => setConfirmingId(null)}
                  >
                    {t('plans.list.deleteNo')}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-muted-foreground"
                  data-testid={`plan-delete-${plan.id}`}
                  onClick={() => setConfirmingId(plan.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  {t('plans.list.delete')}
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
