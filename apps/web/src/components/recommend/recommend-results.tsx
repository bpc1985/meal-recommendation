import type { TranslationKey } from '@mam/i18n'
import { mealTypes, type SuggestionSource } from '@mam/domain'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { usePreferences } from '@/components/preferences-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { RecommendationResult } from '@/lib/recommend-types'
import { BudgetBar } from './budget-bar'
import { MealCard, MissingMealCard } from './meal-card'

const SOURCE_LABEL_KEY = {
  mock: 'recommend.source.mock',
  ai: 'recommend.source.ai',
  curated: 'recommend.source.fallback',
  fallback: 'recommend.source.fallback',
} as const satisfies Record<SuggestionSource, TranslationKey>

interface RecommendResultsProps {
  result: RecommendationResult
  onSavePlan?: () => void
  savingPlan?: boolean
  planHint?: string | null
}

export function RecommendResults({
  result,
  onSavePlan,
  savingPlan = false,
  planHint = null,
}: RecommendResultsProps) {
  const { t, formatMoney } = usePreferences()
  const byMealType = new Map(result.meals.map((meal) => [meal.mealType, meal]))

  return (
    <section aria-labelledby="recommend-results-heading" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="recommend-results-heading" className="text-xl font-semibold tracking-tight">
            {t('recommend.results.title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('recommend.results.note')}</p>
        </div>
        <Badge variant="secondary" className="rounded-full">
          {t(SOURCE_LABEL_KEY[result.source])}
        </Badge>
      </div>

      <ul className="mt-5 grid list-none gap-3 p-0 md:grid-cols-3">
        {mealTypes.map((mealType) => {
          const meal = byMealType.get(mealType)

          return (
            <li key={mealType}>
              {meal ? <MealCard meal={meal} /> : <MissingMealCard mealType={mealType} />}
            </li>
          )
        })}
      </ul>

      <Card className="mt-4 rounded-2xl border-border/70 shadow-sm">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t('recommend.total')}</span>
            <span className="tabular text-2xl font-semibold">{formatMoney(result.totalVnd)}</span>
          </div>

          <BudgetBar spentVnd={result.totalVnd} budgetVnd={result.dailyBudgetVnd} />

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              data-testid="save-plan-cta"
              onClick={onSavePlan}
              disabled={!onSavePlan || savingPlan}
            >
              {savingPlan ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CalendarPlus className="size-4" aria-hidden />
              )}
              {savingPlan ? t('plans.fromRecommend.saving') : t('recommend.planCta')}
            </Button>
            {planHint ? <span className="text-xs text-muted-foreground">{planHint}</span> : null}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

export function RecommendResultsSkeleton() {
  return (
    <section aria-busy="true" className="mt-12">
      <Skeleton className="h-6 w-56" />
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {mealTypes.map((mealType) => (
          <Card key={mealType} className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="space-y-3">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="mt-4 h-24 w-full rounded-2xl" />
    </section>
  )
}
