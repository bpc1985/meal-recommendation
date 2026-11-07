import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { usePreferences } from '@/components/preferences-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCatalogStats, listRoles } from '@/server/catalog.functions'
import type { TranslationKey } from '@mam/i18n'

export const Route = createFileRoute('/')({
  loader: async () => {
    const [roles, stats] = await Promise.all([listRoles(), getCatalogStats()])
    return { roles, stats }
  },
  component: HomePage,
})

const VALUE_CARDS: Array<{ title: TranslationKey; desc: TranslationKey }> = [
  { title: 'home.value.price.title', desc: 'home.value.price.desc' },
  { title: 'home.value.budget.title', desc: 'home.value.budget.desc' },
  { title: 'home.value.plan.title', desc: 'home.value.plan.desc' },
]

function HomePage() {
  const { roles, stats } = Route.useLoaderData()
  const { t, locale, formatMoney } = usePreferences()

  return (
    <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
      <section className="home-hero grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div>
          <Badge
            variant="secondary"
            className="home-eyebrow rounded-full px-3 py-1 text-xs font-medium"
          >
            {t('home.eyebrow')}
          </Badge>

          <h1 className="home-title mt-5 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
            {t('home.title')}
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t('home.subtitle')}
          </p>

          <div className="home-actions mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-xl">
              <a href="/recommend">
                {t('home.ctaPrimary')}
                <ArrowRight className="size-4" aria-hidden />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-xl">
              <a href="/chat">
                <MessageCircle className="size-4" aria-hidden />
                {t('home.ctaSecondary')}
              </a>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">{t('home.disclaimer')}</p>
        </div>

        <Card className="home-roles rounded-2xl border-border/70 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t('home.rolesTitle')}</CardTitle>
            <CardDescription>
              {t('common.sampleData', { count: stats.dishes })} ·{' '}
              {t('role.count', { count: roles.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="home-role-list flex flex-wrap gap-2">
            {roles.map((role) => (
              <span
                key={role.slug}
                className="home-role rounded-xl border border-border/70 bg-surface-sunken px-3 py-2 text-sm"
              >
                <span className="font-medium">{locale === 'vi' ? role.nameVi : role.nameEn}</span>
                <span className="home-role-budget ml-2 text-xs text-muted-foreground tabular">
                  {formatMoney(role.defaultDailyBudgetVnd)}
                </span>
              </span>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="home-values grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {VALUE_CARDS.map((card, index) => (
          <Card key={card.title} className="home-value rounded-2xl border-border/70 shadow-none">
            <CardHeader>
              <span className="home-value-index text-xs font-medium text-primary tabular">
                0{index + 1}
              </span>
              <CardTitle className="text-base">{t(card.title)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(card.desc)}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <p className="sr-only">
        <Link to="/recommend">{t('nav.recommend')}</Link>
      </p>
    </div>
  )
}
