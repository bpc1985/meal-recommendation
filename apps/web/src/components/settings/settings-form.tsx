import { useRef, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { Role } from '@mam/domain'
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
import { DIET_TAGS, DIET_TAG_LABEL_KEY, parseAmountInput } from '@/lib/recommend-input'
import { cn } from '@/lib/utils'
import type { PublicUser } from '@/server/auth.service'
import { updateProfile } from '@/server/profile.functions'

interface SettingsFormProps {
  user: PublicUser
  roles: Role[]
}

export function SettingsForm({ user, roles }: SettingsFormProps) {
  const { t, locale, setLocale } = usePreferences()
  const router = useRouter()

  const [displayName, setDisplayName] = useState(user.displayName ?? '')
  const [roleSlug, setRoleSlug] = useState(user.roleSlug ?? roles[0]?.slug ?? 'student')
  const [budgetInput, setBudgetInput] = useState(
    String(user.dailyBudgetVnd ?? roles[0]?.defaultDailyBudgetVnd ?? 60_000),
  )
  const [dietTags, setDietTags] = useState<string[]>(user.dietTags)
  const [nextLocale, setNextLocale] = useState(user.locale === 'en' ? 'en' : 'vi')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const budgetTouched = useRef(false)

  const budget = parseAmountInput(budgetInput)
  const budgetValid = Number.isFinite(budget) && budget >= 1_000

  function handleRoleChange(next: string) {
    setRoleSlug(next)

    if (!budgetTouched.current) {
      const role = roles.find((item) => item.slug === next)
      if (role) setBudgetInput(String(role.defaultDailyBudgetVnd))
    }
  }

  function toggleDiet(tag: (typeof DIET_TAGS)[number]) {
    setDietTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!budgetValid) {
      setError(t('settings.budgetInvalid'))
      return
    }

    setPending(true)

    try {
      const result = await updateProfile({
        data: {
          displayName,
          roleSlug,
          dailyBudgetVnd: budget,
          dietTags: dietTags as (typeof DIET_TAGS)[number][],
          locale: nextLocale as 'vi' | 'en',
        },
      })

      if (!result.ok) {
        setError(t('settings.error'))
        return
      }

      if (nextLocale !== locale) setLocale(nextLocale as 'vi' | 'en')

      await router.invalidate()
      toast.success(t('settings.saved'))
    } catch {
      setError(t('settings.error'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <section
        aria-labelledby="settings-account"
        className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6"
      >
        <h2 id="settings-account" className="text-base font-semibold">
          {t('settings.account')}
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-email">{t('settings.email')}</Label>
            <Input id="settings-email" value={user.email} readOnly disabled />
            <p className="text-xs text-muted-foreground">{t('settings.emailHint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-display-name">{t('settings.displayName')}</Label>
            <Input
              id="settings-display-name"
              value={displayName}
              maxLength={80}
              autoComplete="nickname"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="settings-defaults"
        className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6"
      >
        <h2 id="settings-defaults" className="text-base font-semibold">
          {t('settings.preferences')}
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-role">{t('settings.role')}</Label>
            <Select value={roleSlug} onValueChange={handleRoleChange}>
              <SelectTrigger id="settings-role" className="w-full">
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
            <Label htmlFor="settings-budget">{t('settings.budget')}</Label>
            <Input
              id="settings-budget"
              inputMode="numeric"
              className="tabular"
              value={budgetInput}
              aria-invalid={budgetValid ? undefined : true}
              onChange={(event) => {
                budgetTouched.current = true
                setBudgetInput(event.target.value.replace(/\D/g, '').slice(0, 9))
              }}
            />
            {budgetValid ? null : (
              <p className="text-sm text-destructive">{t('settings.budgetInvalid')}</p>
            )}
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">{t('settings.diet')}</legend>
          <p className="mt-1 text-xs text-muted-foreground">{t('settings.dietHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DIET_TAGS.map((tag) => {
              const active = dietTags.includes(tag)

              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDiet(tag)}
                  className={cn(
                    'rounded-full border px-3.5 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    active
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border/80 bg-surface-sunken text-muted-foreground hover:bg-accent/50',
                  )}
                >
                  {t(DIET_TAG_LABEL_KEY[tag])}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="mt-5 max-w-xs space-y-2">
          <Label htmlFor="settings-locale">{t('settings.locale')}</Label>
          <Select value={nextLocale} onValueChange={setNextLocale}>
            <SelectTrigger id="settings-locale" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vi">{t('locale.vi')}</SelectItem>
              <SelectItem value="en">{t('locale.en')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('settings.localeHint')}</p>
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending || !budgetValid}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('settings.saving')}
          </>
        ) : (
          t('settings.save')
        )}
      </Button>
    </form>
  )
}
