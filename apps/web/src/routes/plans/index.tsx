import { todayIsoDate } from '@mam/domain'
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { PlanCreateForm, type PlanFormState } from '@/components/plans/plan-create-form'
import { PlanList } from '@/components/plans/plan-list'
import { usePreferences } from '@/components/preferences-provider'
import { requireUser } from '@/lib/require-user'
import { createPlanInputSchema } from '@/lib/plan-input'
import { createPlan, deletePlan, listPlans } from '@/server/plan.functions'
import { listRoles } from '@/server/catalog.functions'

export const Route = createFileRoute('/plans/')({
  beforeLoad: ({ location }) => requireUser(location.href),
  loader: async () => ({ plans: await listPlans(), roles: await listRoles() }),
  component: PlansPage,
})

const rootRoute = getRouteApi('__root__')

function PlansPage() {
  const { plans, roles } = Route.useLoaderData()
  const { user } = rootRoute.useLoaderData()
  const { t, formatMoney } = usePreferences()
  const navigate = useNavigate()

  const first = roles[0]
  const [state, setState] = useState<PlanFormState>(() => ({
    days: 7,
    amountInput: String(user?.dailyBudgetVnd ?? first?.defaultDailyBudgetVnd ?? 60_000),
    unit: 'day',
    roleSlug: user?.roleSlug ?? first?.slug ?? 'student',
    dietTags: user?.dietTags ?? [],
  }))
  const [creating, setCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [savedPlans, setSavedPlans] = useState(plans)

  const handleChange = (patch: Partial<PlanFormState>) => {
    // Lỗi "ngân sách tối thiểu" gắn với input cũ — sửa input thì phải biến mất.
    setErrorMessage(null)
    setState((prev) => ({ ...prev, ...patch }))
  }

  const handleCreate = async () => {
    setErrorMessage(null)

    const parsed = createPlanInputSchema.safeParse({
      days: state.days,
      budget: { unit: state.unit, amount: Number(state.amountInput) },
      roleSlug: state.roleSlug,
      dietTags: state.dietTags,
      startDate: todayIsoDate(),
      title: t('plans.defaultTitle', { days: state.days }),
    })

    if (!parsed.success) {
      setErrorMessage(t('recommend.amountInvalid'))
      return
    }

    setCreating(true)

    try {
      const result = await createPlan({ data: parsed.data })

      if (result.ok) {
        toast.success(t('plans.create.created'))
        await navigate({ to: '/plans/$planId', params: { planId: result.planId } })
        return
      }

      if (result.error === 'infeasible') {
        setErrorMessage(
          result.minimumDailyBudgetVnd > 0
            ? t('plans.create.minimum', {
                days: state.days,
                amount: formatMoney(result.minimumDailyBudgetVnd),
              })
            : t('plans.create.notEnough'),
        )
      } else if (result.error === 'unauthorized') {
        setErrorMessage(t('plans.create.unauthorized'))
      } else {
        setErrorMessage(t('plans.create.error'))
      }
    } catch {
      setErrorMessage(t('plans.create.error'))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (planId: string) => {
    setDeletingId(planId)

    try {
      const result = await deletePlan({ data: { planId } })

      if (result.ok) {
        setSavedPlans((prev) => prev.filter((plan) => plan.id !== planId))
        toast.success(t('plans.list.deleted'))
      } else {
        toast.error(t('plans.list.deleteError'))
      }
    } catch {
      toast.error(t('plans.list.deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('plans.title')}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {t('plans.subtitle')}
        </p>
      </div>

      <PlanCreateForm
        roles={roles}
        value={state}
        onChange={handleChange}
        onSubmit={handleCreate}
        loading={creating}
        errorMessage={errorMessage}
      />

      <section aria-labelledby="saved-plans-heading" className="mt-12">
        <h2 id="saved-plans-heading" className="text-xl font-semibold tracking-tight">
          {t('plans.list.title')}
        </h2>
        <PlanList plans={savedPlans} deletingId={deletingId} onDelete={handleDelete} />
      </section>
    </div>
  )
}
