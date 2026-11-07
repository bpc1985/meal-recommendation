import { toDailyBudget, type BudgetUnit, type Role } from '@mam/domain'
import { Loader2 } from 'lucide-react'
import { useId } from 'react'
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
import { BUDGET_UNIT_LABEL_KEY, DIET_TAGS, DIET_TAG_LABEL_KEY } from '@/lib/recommend-input'
import { cn } from '@/lib/utils'
import { PLAN_DAY_OPTIONS, type PlanDayOption } from '@/lib/plan-input'

export interface PlanFormState {
  days: PlanDayOption
  amountInput: string
  unit: BudgetUnit
  roleSlug: string
  dietTags: string[]
}

interface PlanCreateFormProps {
  roles: Role[]
  value: PlanFormState
  onChange: (patch: Partial<PlanFormState>) => void
  onSubmit: () => void
  loading: boolean
  errorMessage: string | null
}

const UNIT_OPTIONS = ['meal', 'day', 'month'] as const

export function PlanCreateForm({
  roles,
  value,
  onChange,
  onSubmit,
  loading,
  errorMessage,
}: PlanCreateFormProps) {
  const { t, locale, formatMoney } = usePreferences()
  const formId = useId()
  const amountId = `${formId}-amount`
  const unitId = `${formId}-unit`
  const roleId = `${formId}-role`

  const amount = Number(value.amountInput)
  const budgetValid = Number.isFinite(amount) && amount >= 1_000
  const dailyBudgetVnd = budgetValid ? toDailyBudget({ unit: value.unit, amount }) : 0

  const toggleDiet = (tag: (typeof DIET_TAGS)[number]) => {
    const next = value.dietTags.includes(tag)
      ? value.dietTags.filter((item) => item !== tag)
      : [...value.dietTags, tag]
    onChange({ dietTags: next })
  }

  return (
    <form
      className="mt-6 space-y-5 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{t('plans.create.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('plans.create.budgetHint')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <span className="text-sm font-medium" id={`${formId}-days`}>
            {t('plans.create.days')}
          </span>
          <div role="group" aria-labelledby={`${formId}-days`} className="flex flex-wrap gap-2">
            {PLAN_DAY_OPTIONS.map((days) => {
              const active = value.days === days

              return (
                <button
                  key={days}
                  type="button"
                  aria-pressed={active}
                  data-testid={`plan-days-${days}`}
                  onClick={() => onChange({ days })}
                  className={cn(
                    'rounded-xl border px-4 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    active
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border/80 bg-surface-sunken text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('plans.create.dayOption', { count: days })}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={roleId}>{t('plans.create.role')}</Label>
          <Select value={value.roleSlug} onValueChange={(next) => onChange({ roleSlug: next })}>
            <SelectTrigger id={roleId} className="w-full" data-testid="plan-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.slug} value={role.slug}>
                  {locale === 'vi' ? role.nameVi : role.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={amountId}>{t('plans.create.budget')}</Label>
          <Input
            id={amountId}
            inputMode="numeric"
            autoComplete="off"
            placeholder={t('recommend.amountPlaceholder')}
            data-testid="plan-budget"
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
            <SelectTrigger id={unitId} className="w-full" data-testid="plan-unit">
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

      <div className="rounded-xl bg-surface-sunken px-4 py-3">
        {budgetValid ? (
          <p className="text-sm font-medium tabular">
            {t('recommend.budgetPreview', { daily: formatMoney(dailyBudgetVnd) })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('recommend.amountInvalid')}</p>
        )}
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium" id={`${formId}-diet`}>
          {t('plans.create.diet')}
        </span>
        <div role="group" aria-labelledby={`${formId}-diet`} className="flex flex-wrap gap-2">
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
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="lg"
          className="rounded-xl"
          data-testid="plan-submit"
          disabled={loading || !budgetValid}
        >
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {loading ? t('plans.create.submitting') : t('plans.create.submit')}
        </Button>
      </div>

      {errorMessage ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </form>
  )
}
