import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { DishBrowser } from '@/components/dishes/dish-browser'
import {
  DishPreferenceToggle,
  useDishPreferences,
} from '@/components/dishes/dish-preference-toggle'
import { usePreferences } from '@/components/preferences-provider'
import { parseDishSearch, toDishFilter, toDishSearch } from '@/lib/dish-filter'
import { listDishes } from '@/server/catalog.functions'
import { listMyPreferences } from '@/server/dish-preferences.functions'

export const Route = createFileRoute('/dishes')({
  validateSearch: parseDishSearch,
  loader: async () => {
    const [dishes, preferences] = await Promise.all([listDishes(), listMyPreferences()])
    return { dishes, preferences }
  },
  // Đổi filter (cùng trang) không gọi lại server; vào lại trang thì tải lại để
  // món thích/chán không lấy bản cũ trong cache của router.
  shouldReload: ({ cause }) => cause === 'enter',
  component: DishesPage,
})

function DishesPage() {
  const { dishes, preferences } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { t } = usePreferences()
  const filter = useMemo(() => toDishFilter(search), [search])
  const { kinds, likedIds, toggle } = useDishPreferences(preferences)

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('dishes.title')}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {t('dishes.subtitle')}
        </p>
      </div>

      <DishBrowser
        dishes={dishes}
        filter={filter}
        likedIds={likedIds}
        renderActions={(dish) => (
          <DishPreferenceToggle
            dish={dish}
            kind={kinds.get(dish.id) ?? null}
            onToggle={(clicked) => toggle(dish.id, clicked)}
          />
        )}
        onFilterChange={(patch, { replace }) => {
          void navigate({
            search: (prev) => toDishSearch({ ...toDishFilter(prev), ...patch }),
            replace,
            resetScroll: false,
          })
        }}
      />
    </div>
  )
}
