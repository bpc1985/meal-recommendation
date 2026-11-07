import { mealTypes, type MealType, type SuggestionSource } from '@mam/domain'
import type { TranslationKey } from '@mam/i18n'
import { Link } from '@tanstack/react-router'
import { CalendarX, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { usePreferences } from '@/components/preferences-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { HistoryBatch } from '@/lib/history-types'
import { cn } from '@/lib/utils'
import { HistoryPagination } from './history-pagination'

export interface HistoryRole {
  slug: string
  nameVi: string
  nameEn: string
}

interface HistoryListProps {
  items: HistoryBatch[]
  roles: HistoryRole[]
  mealFilter: MealType | null
  page: number
  pageCount: number
  loading: boolean
  error: boolean
  deletingId: string | null
  onFilterChange: (meal: MealType | null) => void
  onRetry: () => void
  onDelete: (batchId: string) => void
}

const MEAL_LABEL_KEY = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  dinner: 'meal.dinner',
} as const satisfies Record<MealType, TranslationKey>

const SOURCE_LABEL_KEY = {
  mock: 'recommend.source.mock',
  ai: 'recommend.source.ai',
  curated: 'recommend.source.fallback',
  fallback: 'recommend.source.fallback',
} as const satisfies Record<SuggestionSource, TranslationKey>

const FILTERS: readonly (MealType | null)[] = [null, ...mealTypes]

export function HistoryList({
  items,
  roles,
  mealFilter,
  page,
  pageCount,
  loading,
  error,
  deletingId,
  onFilterChange,
  onRetry,
  onDelete,
}: HistoryListProps) {
  const { t, locale, formatMoney, formatDateTime } = usePreferences()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const roleName = (slug: string) => {
    const role = roles.find((item) => item.slug === slug)

    return role ? (locale === 'vi' ? role.nameVi : role.nameEn) : slug
  }

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{t('history.filter.label')}</span>
      {FILTERS.map((filter) => {
        const active = mealFilter === filter
        const label = filter === null ? t('history.filter.all') : t(MEAL_LABEL_KEY[filter])

        return (
          <button
            key={filter ?? 'all'}
            type="button"
            aria-pressed={active}
            data-testid={`history-filter-${filter ?? 'all'}`}
            onClick={() => onFilterChange(filter)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/80 bg-surface-sunken text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )

  if (error) {
    return (
      <div
        role="alert"
        data-testid="history-error"
        className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm text-destructive"
      >
        {t('history.error')}
        <Button size="sm" variant="outline" className="rounded-xl" onClick={onRetry}>
          {t('history.retry')}
        </Button>
      </div>
    )
  }

  if (loading && items.length === 0) {
    return (
      <div className="mt-6 space-y-3" aria-busy>
        {filters}
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="mt-6 space-y-4">
        {filters}
        <div
          data-testid="history-empty"
          className="rounded-2xl border border-dashed border-border/80 px-6 py-10 text-center"
        >
          <CalendarX className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h2 className="mt-3 text-base font-semibold">{t('history.empty.title')}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t('history.empty.hint')}
          </p>
          <Button asChild className="mt-5 rounded-xl">
            <Link to="/recommend" data-testid="history-empty-cta">
              {t('history.empty.cta')}
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-4">
      {filters}

      <ul className={cn('grid list-none gap-3 p-0', loading && 'opacity-60')} aria-busy={loading}>
        {items.map((batch) => {
          const confirming = confirmingId === batch.batchId
          const deleting = deletingId === batch.batchId
          const source = batch.meals[0]?.source ?? 'mock'
          const reasons = batch.meals
            .map((meal) => ({
              mealType: meal.mealType,
              text: locale === 'vi' ? meal.rationaleVi : meal.rationaleEn,
            }))
            .filter((entry) => entry.text.trim().length > 0)

          return (
            <li
              key={batch.batchId}
              data-testid={`history-batch-${batch.batchId}`}
              className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="tabular text-xs text-muted-foreground">
                    {formatDateTime(batch.createdAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-full">
                      {roleName(batch.roleSlug)}
                    </Badge>
                    <Badge variant="outline" className="rounded-full">
                      {t(SOURCE_LABEL_KEY[source])}
                    </Badge>
                    <Badge variant="outline" className="rounded-full tabular">
                      {t('history.batch.meals', { count: batch.meals.length })}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className="tabular text-lg font-semibold"
                    data-testid={`history-total-${batch.batchId}`}
                  >
                    {formatMoney(batch.totalVnd)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular">
                    {t('history.batch.budget', { amount: formatMoney(batch.dailyBudgetVnd) })}
                  </p>
                </div>
              </div>

              <ul className="mt-4 list-none space-y-0 p-0">
                {batch.meals.map((meal) => (
                  <li
                    key={meal.id}
                    data-testid={`history-meal-${batch.batchId}-${meal.mealType}`}
                    data-dish-id={meal.dishId}
                    data-dish-name={locale === 'vi' ? meal.nameVi : meal.nameEn}
                    data-price-vnd={meal.priceVnd}
                    className="flex items-baseline justify-between gap-3 border-t border-border/50 py-2 text-sm first:border-t-0 first:pt-0"
                  >
                    <span>
                      <span className="block text-xs text-muted-foreground">
                        {t(MEAL_LABEL_KEY[meal.mealType])}
                      </span>
                      {locale === 'vi' ? meal.nameVi : meal.nameEn}
                    </span>
                    <span className="tabular shrink-0">{formatMoney(meal.priceVnd)}</span>
                  </li>
                ))}
              </ul>

              {reasons.length > 0 ? (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    {t('history.card.why')}
                  </summary>
                  <ul className="mt-2 list-none space-y-1 p-0 text-xs text-muted-foreground">
                    {reasons.map((entry) => {
                      const label = t(MEAL_LABEL_KEY[entry.mealType])
                      // Reason của mock đã mở đầu bằng "Bữa sáng: …" — đừng lặp nhãn.
                      const labelled = entry.text.toLowerCase().startsWith(label.toLowerCase())

                      return (
                        <li key={entry.mealType}>
                          {labelled ? (
                            entry.text
                          ) : (
                            <>
                              <span className="font-medium text-foreground">{label}:</span>{' '}
                              {entry.text}
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </details>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {confirming ? (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {t('history.deleteConfirm')}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-xl"
                      data-testid={`history-delete-confirm-${batch.batchId}`}
                      disabled={deleting}
                      onClick={() => onDelete(batch.batchId)}
                    >
                      {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                      {t('history.deleteYes')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl"
                      onClick={() => setConfirmingId(null)}
                    >
                      {t('history.deleteNo')}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl text-muted-foreground"
                    data-testid={`history-delete-${batch.batchId}`}
                    onClick={() => setConfirmingId(batch.batchId)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {t('history.delete')}
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <HistoryPagination page={page} pageCount={pageCount} meal={mealFilter} />
    </div>
  )
}
