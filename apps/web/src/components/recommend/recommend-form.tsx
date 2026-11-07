import { splitMealBudget, toDailyBudget, type BudgetUnit, type Role } from '@mam/domain'
import type { TranslationKey } from '@mam/i18n'
import { Check, ClipboardList, Loader2 } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { usePreferences } from '@/components/preferences-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  BUDGET_UNIT_LABEL_KEY,
  DIET_TAGS,
  DIET_TAG_LABEL_KEY,
  parseAmountInput,
} from '@/lib/recommend-input'

export interface RecommendFormState {
  roleSlug: string
  amountInput: string
  unit: BudgetUnit
  dietTags: string[]
}

interface RecommendFormProps {
  roles: Role[]
  value: RecommendFormState
  /** Ngân sách đang là số điền sẵn từ thực đơn (qua URL), chưa bị user sửa. */
  budgetFromPlan: boolean
  onChange: (patch: Partial<RecommendFormState>) => void
  onSubmit: () => void
  loading: boolean
  errorKey: TranslationKey | null
}

const UNIT_OPTIONS = ['meal', 'day', 'month'] as const

export function RecommendForm({
  roles,
  value,
  budgetFromPlan,
  onChange,
  onSubmit,
  loading,
  errorKey,
}: RecommendFormProps) {
  const { t, locale, formatMoney } = usePreferences()
  const formId = useId()
  const amountId = `${formId}-amount`
  const unitId = `${formId}-unit`
  const noticeId = `${formId}-prefill`
  const budgetSectionRef = useRef<HTMLElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const openedFromPlan = useRef(budgetFromPlan)

  // Chỉ khi mở từ thực đơn: ô ngân sách nằm dưới danh sách vai trò, nên đưa nó vào tầm mắt.
  useEffect(() => {
    if (!openedFromPlan.current) return
    budgetSectionRef.current?.scrollIntoView({ block: 'start' })
    amountRef.current?.focus({ preventScroll: true })
  }, [])

  const amount = parseAmountInput(value.amountInput)
  const budgetValid = Number.isFinite(amount) && amount >= 1_000
  const dailyBudgetVnd = budgetValid ? toDailyBudget({ unit: value.unit, amount }) : 0
  const split = splitMealBudget(dailyBudgetVnd)

  const toggleDiet = (tag: (typeof DIET_TAGS)[number]) => {
    const next = value.dietTags.includes(tag)
      ? value.dietTags.filter((item) => item !== tag)
      : [...value.dietTags, tag]
    onChange({ dietTags: next })
  }

  return (
    <form
      className="mt-10 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <section
        aria-labelledby={`${formId}-role`}
        className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={`${formId}-role`} className="text-base font-semibold">
            {t('recommend.step.role')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('recommend.step.roleHint')}</p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => {
            const active = role.slug === value.roleSlug

            return (
              <button
                key={role.slug}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ roleSlug: role.slug })}
                className={cn(
                  'rounded-xl border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active && !budgetFromPlan && 'border-primary bg-accent text-accent-foreground',
                  active && budgetFromPlan && 'border-primary bg-card',
                  !active &&
                    'border-border/80 bg-surface-sunken hover:border-border hover:bg-accent/50',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {locale === 'vi' ? role.nameVi : role.nameEn}
                  </span>
                  {active ? <Check className="size-4 text-primary" aria-hidden /> : null}
                </span>
                {budgetFromPlan ? null : (
                  <span className="mt-1 block text-xs text-muted-foreground tabular">
                    {t('recommend.roleBudgetHint', {
                      amount: formatMoney(role.defaultDailyBudgetVnd),
                    })}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <section
        ref={budgetSectionRef}
        aria-labelledby={`${formId}-budget`}
        className={cn(
          'scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm sm:p-6',
          budgetFromPlan ? 'border-primary ring-1 ring-primary/30' : 'border-border/70',
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={`${formId}-budget`} className="text-base font-semibold">
            {t('recommend.step.budget')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('recommend.step.budgetHint')}</p>
        </div>

        {budgetFromPlan ? (
          <p
            id={noticeId}
            className="mt-3 flex items-center gap-2 text-sm font-medium text-primary"
            data-testid="recommend-prefill-notice"
          >
            <ClipboardList className="size-4 shrink-0" aria-hidden />
            {t('recommend.prefillNotice')}
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
          <div className="space-y-2">
            <Label htmlFor={amountId}>{t('recommend.amountLabel')}</Label>
            <Input
              ref={amountRef}
              id={amountId}
              aria-describedby={budgetFromPlan ? noticeId : undefined}
              inputMode="numeric"
              autoComplete="off"
              placeholder={t('recommend.amountPlaceholder')}
              value={value.amountInput}
              onChange={(event) =>
                onChange({ amountInput: event.target.value.replace(/\D/g, '').slice(0, 9) })
              }
              className="tabular text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={unitId}>{t('recommend.unitLabel')}</Label>
            <Select
              value={value.unit}
              onValueChange={(next) => onChange({ unit: next as BudgetUnit })}
            >
              <SelectTrigger id={unitId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {t(BUDGET_UNIT_LABEL_KEY[unit])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-surface-sunken px-4 py-3">
          {budgetValid ? (
            <>
              <p className="text-sm font-medium tabular">
                {t('recommend.budgetPreview', { daily: formatMoney(dailyBudgetVnd) })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular">
                {t('recommend.budgetSplit', {
                  breakfast: formatMoney(split.breakfast),
                  lunch: formatMoney(split.lunch),
                  dinner: formatMoney(split.dinner),
                })}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('recommend.amountInvalid')}</p>
          )}
        </div>
      </section>

      <section
        aria-labelledby={`${formId}-diet`}
        className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={`${formId}-diet`} className="text-base font-semibold">
            {t('recommend.step.diet')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('recommend.step.dietHint')}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {DIET_TAGS.map((tag) => {
            const active = value.dietTags.includes(tag)

            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDiet(tag)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/80 bg-surface-sunken text-muted-foreground hover:text-foreground',
                )}
              >
                {t(DIET_TAG_LABEL_KEY[tag])}
              </button>
            )
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="rounded-xl" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {loading ? t('recommend.submitting') : t('recommend.submit')}
        </Button>
      </div>

      {errorKey ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t(errorKey)}
        </p>
      ) : null}
    </form>
  )
}
