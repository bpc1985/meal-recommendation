import type { MealType } from '@mam/domain'
import { createFileRoute, redirect, useRouter, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { HistoryList } from '@/components/history/history-list'
import { usePreferences } from '@/components/preferences-provider'
import { parseHistorySearch } from '@/lib/history-input'
import type { HistoryPage as HistoryPageData } from '@/lib/history-types'
import { requireUser } from '@/lib/require-user'
import { listRoles } from '@/server/catalog.functions'
import { deleteHistory, listHistory } from '@/server/history.functions'

export const Route = createFileRoute('/history')({
  validateSearch: parseHistorySearch,
  beforeLoad: ({ location }) => requireUser(location.href),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [history, roles] = await Promise.all([
      listHistory({ data: { page: deps.page, mealType: deps.meal } }).catch(
        (): HistoryPageData | null => null,
      ),
      listRoles(),
    ])

    // Server kẹp trang (vd. `?page=999` hoặc vừa xoá lượt cuối của trang cuối) — URL đi theo.
    if (history && history.page !== (deps.page ?? 1)) {
      throw redirect({
        to: '/history',
        search: { ...deps, page: history.page > 1 ? history.page : undefined },
        replace: true,
      })
    }

    return { history, roles }
  },
  component: HistoryPage,
})

function HistoryPage() {
  const { history, roles } = Route.useLoaderData()
  const { meal } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const loading = useRouterState({ select: (state) => state.isLoading })
  const { t } = usePreferences()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleFilterChange = (filter: MealType | null) => {
    void navigate({ search: { meal: filter ?? undefined } })
  }

  const handleRetry = () => {
    void router.invalidate({ sync: true })
  }

  const handleDelete = async (batchId: string) => {
    setDeletingId(batchId)

    try {
      const result = await deleteHistory({ data: { batchId } })

      if (result.ok) {
        await router.invalidate({ sync: true })
        toast.success(t('history.deleted'))
      } else {
        toast.error(t('history.deleteError'))
      }
    } catch {
      toast.error(t('history.deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('history.title')}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {t('history.subtitle')}
        </p>
      </div>

      <HistoryList
        items={history?.items ?? []}
        roles={roles}
        mealFilter={meal ?? null}
        page={history?.page ?? 1}
        pageCount={history?.pageCount ?? 1}
        loading={loading}
        error={history === null}
        deletingId={deletingId}
        onFilterChange={handleFilterChange}
        onRetry={handleRetry}
        onDelete={handleDelete}
      />
    </div>
  )
}
