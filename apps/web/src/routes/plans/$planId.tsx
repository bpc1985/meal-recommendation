import { addDays, dietTagSchema, mealTypes } from '@mam/domain'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePreferences } from '@/components/preferences-provider'
import { PlanExportMenu } from '@/components/plans/export-menu'
import {
  MEAL_LABEL_KEY,
  SwapMealButton,
  useMealSwap,
  type MealSwap,
} from '@/components/plans/meal-swap'
import { RemainingBudgetCard } from '@/components/plans/remaining-budget-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { PlanDetailItem } from '@/lib/plan-types'
import { DIET_TAG_LABEL_KEY } from '@/lib/recommend-input'
import { requireUser } from '@/lib/require-user'
import { getPlan } from '@/server/plan.functions'
import { listRoles } from '@/server/catalog.functions'

export const Route = createFileRoute('/plans/$planId')({
  beforeLoad: ({ location }) => requireUser(location.href),
  loader: async ({ params }) => ({
    detail: await getPlan({ data: { planId: params.planId } }),
    roles: await listRoles(),
  }),
  component: PlanDetailPage,
})

function PlanDetailPage() {
  const { detail, roles } = Route.useLoaderData()
  const { planId } = Route.useParams()
  const { t, locale, formatMoney, formatDay } = usePreferences()
  const swap = useMealSwap(planId)

  if (!detail) {
    return (
      <div className="mx-auto max-w-[820px] px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('plans.detail.notFound')}</h1>
        <p className="mt-2 text-muted-foreground">{t('plans.detail.notFoundHint')}</p>
        <Button asChild variant="outline" className="mt-6 rounded-xl">
          <Link to="/plans">{t('plans.detail.back')}</Link>
        </Button>
      </div>
    )
  }

  const { plan, items, remaining } = detail
  const days = Array.from({ length: plan.days }, (_, dayIndex) => {
    const dayItems = items
      .filter((item) => item.dayIndex === dayIndex)
      .sort((a, b) => mealTypes.indexOf(a.mealType) - mealTypes.indexOf(b.mealType))

    return {
      dayIndex,
      items: dayItems,
      totalVnd: dayItems.reduce((sum, item) => sum + item.priceVnd, 0),
    }
  })

  const dietLabels = plan.dietTags.flatMap((tag) => {
    const parsed = dietTagSchema.safeParse(tag)
    return parsed.success ? [t(DIET_TAG_LABEL_KEY[parsed.data])] : []
  })
  const role = roles.find((item) => item.slug === plan.roleSlug)
  const roleName = role ? (locale === 'vi' ? role.nameVi : role.nameEn) : plan.roleSlug

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6 sm:py-16">
      <div className="print:hidden">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 rounded-xl text-muted-foreground"
        >
          <Link to="/plans">
            <ArrowLeft className="size-4" aria-hidden />
            {t('plans.detail.back')}
          </Link>
        </Button>
      </div>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {plan.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('plans.detail.dateRange', {
              start: formatDay(plan.startDate),
              end: formatDay(addDays(plan.startDate, plan.days - 1)),
            })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full tabular">
              {t('plans.list.meta', { days: plan.days, count: plan.itemCount })}
            </Badge>
            {roleName ? (
              <Badge variant="secondary" className="rounded-full">
                {roleName}
              </Badge>
            ) : null}
            {dietLabels.map((label) => (
              <Badge key={label} variant="outline" className="rounded-full">
                <span className="sr-only">{t('plans.detail.diet')}: </span>
                {label}
              </Badge>
            ))}
          </div>
          {dietLabels.length === 0 ? (
            <p
              className="mt-2 max-w-prose text-xs text-muted-foreground"
              data-testid="plan-diet-none"
            >
              {t('plans.detail.dietNone')}
            </p>
          ) : null}
        </div>

        <PlanExportMenu plan={plan} items={items} />
      </header>

      <Card className="mt-6 rounded-2xl border-border/70 shadow-sm">
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('plans.detail.total')}</p>
            <p className="tabular text-2xl font-semibold" data-testid="plan-detail-total">
              {formatMoney(plan.totalVnd)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('plans.detail.budget')}</p>
            <p className="tabular text-2xl font-semibold">
              {formatMoney(plan.dailyBudgetVnd * plan.days)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('plans.detail.daily')}</p>
            <p className="tabular text-2xl font-semibold">{formatMoney(plan.dailyBudgetVnd)}</p>
          </div>
        </CardContent>
      </Card>

      <RemainingBudgetCard
        remaining={remaining}
        startDate={plan.startDate}
        budgetVnd={plan.dailyBudgetVnd * plan.days}
      />

      <section aria-labelledby="plan-days-heading" className="mt-10">
        <h2 id="plan-days-heading" className="sr-only">
          {t('plans.detail.tableDay')}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground print:hidden">{t('plans.swap.hint')}</p>
        <p role="status" className="sr-only" data-testid="plan-swap-status">
          {swap.announcement}
        </p>

        <div className="hidden md:block print:block">
          <table
            className="w-full border-collapse text-sm"
            data-testid="plan-detail-table"
            data-days={plan.days}
          >
            <caption className="sr-only">{plan.title}</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('plans.detail.tableDay')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('plans.detail.tableMeal')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('plans.detail.tableDish')}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t('plans.detail.tablePrice')}
                </th>
              </tr>
            </thead>

            {days.map((day) => (
              <tbody
                key={day.dayIndex}
                data-testid={`plan-day-${day.dayIndex}`}
                data-total-vnd={day.totalVnd}
                className="break-inside-avoid"
              >
                {day.items.map((item, index) => (
                  <tr
                    key={`${day.dayIndex}-${item.mealType}`}
                    data-dish-id={item.dishId}
                    data-meal-type={item.mealType}
                    className="border-b border-border/50"
                  >
                    {index === 0 ? (
                      <th
                        scope="rowgroup"
                        rowSpan={day.items.length}
                        className="w-32 py-3 pr-3 align-top text-left font-medium"
                      >
                        {t('plans.detail.day', { index: day.dayIndex + 1 })}
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {formatDay(addDays(plan.startDate, day.dayIndex))}
                        </span>
                      </th>
                    ) : null}
                    <td className="py-3 pr-3 text-muted-foreground">
                      {t(MEAL_LABEL_KEY[item.mealType])}
                    </td>
                    <td className="py-2 pr-3">
                      <SwapMealButton
                        item={item}
                        swap={swap}
                        testId={`plan-swap-${day.dayIndex}-${item.mealType}`}
                      />
                    </td>
                    <td className="tabular py-3 text-right">{formatMoney(item.priceVnd)}</td>
                  </tr>
                ))}
                <tr className="border-b border-border/50 bg-surface-sunken/60">
                  <td colSpan={3} className="py-2 pr-3 text-right text-xs text-muted-foreground">
                    {t('plans.detail.dayTotal')}
                  </td>
                  <td className="tabular py-2 text-right text-sm font-semibold">
                    {formatMoney(day.totalVnd)}
                  </td>
                </tr>
              </tbody>
            ))}
          </table>
        </div>

        <div className="space-y-3 md:hidden print:hidden">
          {days.map((day) => (
            <MobilePlanDay key={day.dayIndex} day={day} startDate={plan.startDate} swap={swap} />
          ))}
        </div>
      </section>

      <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground print:hidden">
        <Printer className="size-3.5" aria-hidden />
        {t('plans.export.disclaimer')}
      </p>
    </div>
  )
}

interface PlanDay {
  dayIndex: number
  items: PlanDetailItem[]
  totalVnd: number
}

/**
 * Accordion ngày trên mobile chỉ vẽ danh sách món khi mở: mọi ngày đóng sẵn, nên SSR
 * không phải dựng 90 nút đổi món (thực đơn 30 ngày) mà người dùng chưa nhìn thấy.
 */
function MobilePlanDay({
  day,
  startDate,
  swap,
}: {
  day: PlanDay
  startDate: string
  swap: MealSwap
}) {
  const { t, formatMoney, formatDay } = usePreferences()
  const ref = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)

  // Mở trước khi hydrate xong thì sự kiện toggle đã trôi qua mà React chưa nghe.
  useEffect(() => {
    if (ref.current?.open) setOpen(true)
  }, [])

  return (
    <details
      ref={ref}
      data-testid={`plan-day-mobile-${day.dayIndex}`}
      className="rounded-2xl border border-border/70 bg-card p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
        <span>
          {t('plans.detail.day', { index: day.dayIndex + 1 })}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {formatDay(addDays(startDate, day.dayIndex))}
          </span>
        </span>
        <span className="tabular">{formatMoney(day.totalVnd)}</span>
      </summary>
      {open ? (
        <ul className="mt-3 list-none space-y-2 p-0 text-sm">
          {day.items.map((item) => (
            <li key={item.mealType} className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-xs text-muted-foreground">
                  {t(MEAL_LABEL_KEY[item.mealType])}
                </span>
                <SwapMealButton
                  item={item}
                  swap={swap}
                  testId={`plan-swap-mobile-${day.dayIndex}-${item.mealType}`}
                />
              </span>
              <span className="tabular shrink-0">{formatMoney(item.priceVnd)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  )
}
