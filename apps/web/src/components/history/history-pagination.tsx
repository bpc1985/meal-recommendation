import type { MealType } from '@mam/domain'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePreferences } from '@/components/preferences-provider'
import { buttonVariants } from '@/components/ui/button'
import { paginationItems } from '@/lib/pagination'
import { cn } from '@/lib/utils'

interface HistoryPaginationProps {
  page: number
  pageCount: number
  meal: MealType | null
}

const stepClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'rounded-xl')

export function HistoryPagination({ page, pageCount, meal }: HistoryPaginationProps) {
  const { t } = usePreferences()

  if (pageCount <= 1) return null

  const searchFor = (target: number) => ({
    page: target > 1 ? target : undefined,
    meal: meal ?? undefined,
  })

  const step = (target: number, label: string, testId: string, icon: ReactNode) => {
    const content = (
      <>
        {target < page ? icon : null}
        <span className="sr-only sm:not-sr-only">{label}</span>
        {target > page ? icon : null}
      </>
    )

    if (target < 1 || target > pageCount) {
      return (
        <span aria-disabled="true" className={cn(stepClass, 'opacity-50')} data-testid={testId}>
          {content}
        </span>
      )
    }

    return (
      <Link
        to="/history"
        search={searchFor(target)}
        rel={target < page ? 'prev' : 'next'}
        className={stepClass}
        data-testid={testId}
      >
        {content}
      </Link>
    )
  }

  return (
    <nav
      aria-label={t('history.pagination.label')}
      data-testid="history-pagination"
      className="flex flex-col items-center gap-2 pt-2"
    >
      <ul className="flex list-none flex-wrap items-center justify-center gap-1 p-0">
        <li>
          {step(
            page - 1,
            t('history.pagination.prev'),
            'history-page-prev',
            <ChevronLeft className="size-4" aria-hidden />,
          )}
        </li>
        {paginationItems(page, pageCount).map((item, index) => (
          <li key={item === 'ellipsis' ? `ellipsis-${index}` : item}>
            {item === 'ellipsis' ? (
              <span aria-hidden className="inline-flex size-8 items-center justify-center text-sm">
                …
              </span>
            ) : (
              <Link
                to="/history"
                search={searchFor(item)}
                aria-label={t('history.pagination.page', { page: item })}
                aria-current={item === page ? 'page' : undefined}
                data-testid={`history-page-${item}`}
                className={cn(
                  buttonVariants({ variant: item === page ? 'default' : 'ghost', size: 'icon-sm' }),
                  'rounded-xl tabular',
                )}
              >
                {item}
              </Link>
            )}
          </li>
        ))}
        <li>
          {step(
            page + 1,
            t('history.pagination.next'),
            'history-page-next',
            <ChevronRight className="size-4" aria-hidden />,
          )}
        </li>
      </ul>
      <p className="tabular text-xs text-muted-foreground" data-testid="history-page-status">
        {t('history.pagination.status', { page, pageCount })}
      </p>
    </nav>
  )
}
