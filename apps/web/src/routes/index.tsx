import { createFileRoute } from '@tanstack/react-router'
import { usePreferences } from '@/components/preferences-provider'
import { Button } from '@/components/ui/button'
import { getCatalogStats, listRoles } from '@/server/catalog.functions'
import type { TranslationKey } from '@mam/i18n'

export const Route = createFileRoute('/')({
  loader: async () => {
    const [roles, stats] = await Promise.all([listRoles(), getCatalogStats()])
    return { roles, stats }
  },
  component: HomePage,
})

const VALUE_ITEMS: Array<{ title: TranslationKey; desc: TranslationKey }> = [
  { title: 'home.value.price.title', desc: 'home.value.price.desc' },
  { title: 'home.value.budget.title', desc: 'home.value.budget.desc' },
  { title: 'home.value.plan.title', desc: 'home.value.plan.desc' },
]

function HomePage() {
  const { roles, stats } = Route.useLoaderData()
  const { t, locale, formatMoney } = usePreferences()

  return (
    <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
      <section className="home-hero">
        <div>
          <h1 className="home-title">{t('home.title')}</h1>

          <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-muted-foreground">
            {t('home.subtitle')}
          </p>

          <div className="home-actions mt-7 flex flex-wrap items-center gap-2">
            <Button asChild size="lg">
              <a href="/recommend">{t('home.ctaPrimary')}</a>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <a href="/chat">{t('home.ctaSecondary')}</a>
            </Button>
          </div>

          <p className="mt-5 max-w-[54ch] text-xs leading-relaxed text-muted-foreground">
            {t('home.disclaimer')}
          </p>
        </div>

        <section className="home-roles" aria-labelledby="home-roles-title">
          <h2 id="home-roles-title" className="text-base font-semibold">
            {t('home.rolesTitle')}
          </h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{t('common.sampleData', { count: stats.dishes })}</span>
            <span>{t('role.count', { count: roles.length })}</span>
          </div>
          <dl className="home-role-list">
            {roles.map((role) => (
              <div key={role.slug} className="home-role">
                <dt>{locale === 'vi' ? role.nameVi : role.nameEn}</dt>
                <dd className="home-role-budget tabular">
                  {formatMoney(role.defaultDailyBudgetVnd)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </section>

      <section className="home-values">
        {VALUE_ITEMS.map((card) => (
          <div key={card.title}>
            <h2 className="text-sm font-semibold">{t(card.title)}</h2>
            <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
              {t(card.desc)}
            </p>
          </div>
        ))}
      </section>
    </div>
  )
}
