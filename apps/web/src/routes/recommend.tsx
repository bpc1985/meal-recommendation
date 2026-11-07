import { todayIsoDate } from '@mam/domain'
import type { TranslationKey } from '@mam/i18n'
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { usePreferences } from '@/components/preferences-provider'
import { RecommendForm, type RecommendFormState } from '@/components/recommend/recommend-form'
import {
  RecommendResults,
  RecommendResultsSkeleton,
} from '@/components/recommend/recommend-results'
import {
  budgetPrefillFromSearch,
  parseAmountInput,
  parseRecommendSearch,
  recommendInputSchema,
  type RecommendInputData,
} from '@/lib/recommend-input'
import type { RecommendationResult } from '@/lib/recommend-types'
import { listRoles } from '@/server/catalog.functions'
import { createPlan } from '@/server/plan.functions'
import { recommendMeals } from '@/server/recommend.functions'

export const Route = createFileRoute('/recommend')({
  validateSearch: parseRecommendSearch,
  loader: async () => ({ roles: await listRoles() }),
  component: RecommendPage,
})

const rootRoute = getRouteApi('__root__')

function RecommendPage() {
  const { roles } = Route.useLoaderData()
  const search = Route.useSearch()
  const { user } = rootRoute.useLoaderData()
  const { t, locale, formatMoney } = usePreferences()

  const [state, setState] = useState<RecommendFormState>(() => {
    const first = roles[0]

    return {
      // Ngân sách trên URL thắng; sau đó user đã đăng nhập mở ra đúng vai trò/ngân sách/chế độ ăn đã lưu.
      roleSlug: user?.roleSlug ?? first?.slug ?? 'student',
      amountInput: String(
        search.amount ?? user?.dailyBudgetVnd ?? first?.defaultDailyBudgetVnd ?? 60_000,
      ),
      unit: search.unit ?? 'day',
      dietTags: user?.dietTags ?? [],
    }
  })
  // Còn true khi ngân sách vẫn đúng như URL mang tới; user sửa số tiền hay đơn vị thì thôi báo nguồn.
  const [budgetFromPlan, setBudgetFromPlan] = useState(
    () => budgetPrefillFromSearch(search) !== null,
  )
  const [result, setResult] = useState<RecommendationResult | null>(null)
  const [lastInput, setLastInput] = useState<RecommendInputData | null>(null)
  const [savingPlan, setSavingPlan] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)

  const navigate = useNavigate()

  // Số tiền đến từ URL coi như user đã gõ, để đổi vai trò không ghi đè.
  const amountTouched = useRef(search.amount !== undefined)
  const resultsRef = useRef<HTMLDivElement>(null)

  const handleChange = (patch: Partial<RecommendFormState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch }

      // Picking a role preselects its typical budget, unless the user typed one.
      if (patch.roleSlug && patch.roleSlug !== prev.roleSlug && !amountTouched.current) {
        const role = roles.find((item) => item.slug === patch.roleSlug)
        if (role) next.amountInput = String(role.defaultDailyBudgetVnd)
      }

      return next
    })

    if (patch.amountInput !== undefined) amountTouched.current = true
    if (patch.amountInput !== undefined || patch.unit !== undefined) setBudgetFromPlan(false)
  }

  const handleSubmit = async () => {
    setErrorKey(null)

    const parsed = recommendInputSchema.safeParse({
      roleSlug: state.roleSlug,
      budget: { unit: state.unit, amount: parseAmountInput(state.amountInput) },
      dietTags: state.dietTags,
      locale,
    })

    if (!parsed.success) {
      setErrorKey('recommend.amountInvalid')
      return
    }

    setLoading(true)

    try {
      const next = await recommendMeals({ data: parsed.data })
      setResult(next)
      setLastInput(parsed.data)
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    } catch {
      setErrorKey('recommend.error')
    } finally {
      setLoading(false)
    }
  }

  /**
   * CTA biến 3 bữa vừa xem thành thực đơn 7 ngày. Dùng đúng input đã tạo ra kết
   * quả (không phải state form đã bị sửa sau đó) để thực đơn khớp với gợi ý.
   */
  const handleSavePlan = async () => {
    if (!user) {
      await navigate({ to: '/login', search: { redirect: '/recommend' } })
      return
    }

    if (!lastInput || savingPlan) return

    setSavingPlan(true)

    try {
      const saved = await createPlan({
        data: {
          days: 7,
          budget: lastInput.budget,
          roleSlug: lastInput.roleSlug,
          dietTags: lastInput.dietTags,
          startDate: todayIsoDate(),
          title: t('plans.defaultTitle', { days: 7 }),
        },
      })

      if (saved.ok) {
        toast.success(t('plans.fromRecommend.created'))
        await navigate({ to: '/plans/$planId', params: { planId: saved.planId } })
        return
      }

      if (saved.error === 'infeasible') {
        toast.error(
          saved.minimumDailyBudgetVnd > 0
            ? t('plans.create.minimum', {
                days: 7,
                amount: formatMoney(saved.minimumDailyBudgetVnd),
              })
            : t('plans.create.notEnough'),
        )
      } else {
        toast.error(t('plans.fromRecommend.error'))
      }
    } catch {
      toast.error(t('plans.fromRecommend.error'))
    } finally {
      setSavingPlan(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('recommend.title')}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {t('recommend.subtitle')}
        </p>
      </div>

      <RecommendForm
        roles={roles}
        value={state}
        budgetFromPlan={budgetFromPlan}
        onChange={handleChange}
        onSubmit={handleSubmit}
        loading={loading}
        errorKey={errorKey}
      />

      <div ref={resultsRef} className="scroll-mt-24">
        {loading ? <RecommendResultsSkeleton /> : null}
        {!loading && result ? (
          <RecommendResults
            result={result}
            onSavePlan={handleSavePlan}
            savingPlan={savingPlan}
            planHint={user ? null : t('plans.fromRecommend.loginNeeded')}
          />
        ) : null}
      </div>
    </div>
  )
}
