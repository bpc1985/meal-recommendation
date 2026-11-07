import type { RemainingBudget } from '@mam/domain'
import { Link } from '@tanstack/react-router'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { usePreferences } from '@/components/preferences-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface RemainingBudgetCardProps {
  remaining: RemainingBudget
  startDate: string
  budgetVnd: number
}

export function RemainingBudgetCard({ remaining, startDate, budgetVnd }: RemainingBudgetCardProps) {
  const { t, formatMoney, formatDay } = usePreferences()

  const overspentVnd = remaining.kind === 'notStarted' ? 0 : remaining.overspentVnd
  // Dưới 1.000₫ thì `budgetSchema` của /recommend không nhận, nên không mời gợi ý.
  const recommendAmount =
    remaining.kind === 'inProgress' && remaining.newDailyVnd >= 1_000 ? remaining.newDailyVnd : null

  return (
    <Card
      className="mt-4 rounded-2xl border-border/70 shadow-sm"
      data-testid="plan-remaining"
      data-kind={remaining.kind}
    >
      <CardContent className="flex flex-wrap items-end justify-between gap-4">
        <section aria-labelledby="plan-remaining-heading" className="min-w-0 flex-1 basis-72">
          <h2 id="plan-remaining-heading" className="text-xs text-muted-foreground">
            {t('plans.remaining.title')}
          </h2>

          {remaining.kind === 'inProgress' ? (
            <>
              <dl className="mt-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('plans.remaining.spentLabel')}
                  </dt>
                  <dd className="tabular text-lg font-medium" data-testid="plan-remaining-spent">
                    {formatMoney(remaining.spentVnd)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('plans.remaining.leftLabel')}
                  </dt>
                  <dd className="tabular text-lg font-medium">
                    <span data-testid="plan-remaining-left">
                      {formatMoney(remaining.remainingVnd)}
                    </span>{' '}
                    <span
                      className="text-sm font-normal text-muted-foreground"
                      data-testid="plan-remaining-days"
                    >
                      {t('plans.remaining.forDays', {
                        days: t(
                          remaining.daysLeft === 1
                            ? 'plans.remaining.dayOne'
                            : 'plans.remaining.dayOther',
                          { count: remaining.daysLeft },
                        ),
                      })}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('plans.remaining.dailyLabel')}
                  </dt>
                  <dd
                    className="tabular text-2xl font-semibold text-primary"
                    data-testid="plan-remaining-daily"
                  >
                    {formatMoney(remaining.newDailyVnd)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground" data-testid="plan-remaining-note">
                {t('plans.remaining.spentNote')}
              </p>
            </>
          ) : (
            <p
              className="tabular mt-1 text-base font-medium text-pretty"
              data-testid="plan-remaining-summary"
            >
              {remaining.kind === 'notStarted'
                ? t('plans.remaining.notStarted', {
                    date: formatDay(startDate),
                    budget: formatMoney(budgetVnd),
                  })
                : t('plans.remaining.finished', {
                    spent: formatMoney(remaining.spentVnd),
                    budget: formatMoney(budgetVnd),
                  })}
            </p>
          )}

          {overspentVnd > 0 ? (
            <div className="mt-3 text-sm text-destructive">
              <p className="flex items-center gap-2" data-testid="plan-remaining-overspent">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                {t('plans.remaining.overspent', { amount: formatMoney(overspentVnd) })}
              </p>
              {remaining.kind === 'inProgress' ? (
                <p
                  className="mt-1 pl-6 text-foreground"
                  data-testid="plan-remaining-overspent-hint"
                >
                  {t('plans.remaining.overspentHint')}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {recommendAmount !== null ? (
          <Button asChild className="rounded-xl print:hidden">
            <Link
              to="/recommend"
              search={{ unit: 'day', amount: recommendAmount }}
              // Router cuộn lên đầu sau khi render, đè mất cú cuộn tới ô ngân sách của form.
              resetScroll={false}
              data-testid="plan-remaining-recommend"
            >
              <Sparkles className="size-4" aria-hidden />
              {t('plans.remaining.recommend')}
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
