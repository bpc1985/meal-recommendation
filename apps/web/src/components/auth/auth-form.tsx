import type { TranslationKey } from '@mam/i18n'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { usePreferences } from '@/components/preferences-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  loginInputSchema,
  registerInputSchema,
  toFieldErrors,
  type AuthFieldErrors,
} from '@/lib/auth-input'
import { login, register, type AuthFailure } from '@/server/auth.functions'

export type AuthMode = 'login' | 'register'

interface AuthFormProps {
  mode: AuthMode
  redirectTo: string
}

interface FormError {
  key: TranslationKey
  params?: Record<string, string | number>
}

export function AuthForm({ mode, redirectTo }: AuthFormProps) {
  const { t } = usePreferences()
  const router = useRouter()
  const navigate = useNavigate()
  const formId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({})
  const [formError, setFormError] = useState<FormError | null>(null)
  const [pending, setPending] = useState(false)

  const isLogin = mode === 'login'
  const emailId = `${formId}-email`
  const passwordId = `${formId}-password`
  const displayNameId = `${formId}-display-name`

  function toFormError(result: AuthFailure): FormError {
    switch (result.error) {
      case 'email_taken':
        return { key: 'auth.error.emailTaken' }
      case 'invalid_credentials':
        return { key: 'auth.error.invalidCredentials' }
      case 'weak_password':
        return { key: 'auth.error.password' }
      case 'rate_limited':
        return {
          key: 'auth.error.rateLimited',
          params: { minutes: Math.max(1, Math.ceil((result.retryAfterSeconds ?? 60) / 60)) },
        }
      default:
        return { key: 'auth.error.generic' }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    if (isLogin) {
      const parsed = loginInputSchema.safeParse({ email, password })

      if (!parsed.success) {
        setFieldErrors(toFieldErrors(parsed.error))
        return
      }

      setFieldErrors({})
      setPending(true)

      try {
        const result = await login({ data: parsed.data })

        if (!result.ok) {
          setFormError(toFormError(result))
          return
        }

        await router.invalidate()
        await navigate({ to: redirectTo, replace: true })
      } catch {
        setFormError({ key: 'auth.error.generic' })
      } finally {
        setPending(false)
      }

      return
    }

    const parsed = registerInputSchema.safeParse({
      email,
      password,
      displayName: displayName.trim().length > 0 ? displayName : undefined,
    })

    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error))
      return
    }

    setFieldErrors({})
    setPending(true)

    try {
      const result = await register({ data: parsed.data })

      if (!result.ok) {
        setFormError(toFormError(result))
        return
      }

      await router.invalidate()
      await navigate({ to: redirectTo, replace: true })
    } catch {
      setFormError({ key: 'auth.error.generic' })
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor={emailId}>{t('auth.email')}</Label>
        <Input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
          placeholder={t('auth.emailPlaceholder')}
          onChange={(event) => setEmail(event.target.value)}
        />
        {fieldErrors.email ? (
          <p id={`${emailId}-error`} className="text-sm text-destructive">
            {t(fieldErrors.email)}
          </p>
        ) : null}
      </div>

      {isLogin ? null : (
        <div className="space-y-2">
          <Label htmlFor={displayNameId}>{t('auth.displayNameOptional')}</Label>
          <Input
            id={displayNameId}
            autoComplete="nickname"
            value={displayName}
            maxLength={80}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={passwordId}>{t('auth.password')}</Label>
        <Input
          id={passwordId}
          type="password"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          required
          minLength={8}
          value={password}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={`${passwordId}-hint`}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p id={`${passwordId}-hint`} className="text-xs text-muted-foreground">
          {fieldErrors.password ? (
            <span className="text-destructive">{t(fieldErrors.password)}</span>
          ) : (
            t('auth.passwordHint')
          )}
        </p>
      </div>

      {formError ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t(formError.key, formError.params)}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('auth.submitting')}
          </>
        ) : isLogin ? (
          t('auth.submitLogin')
        ) : (
          t('auth.submitRegister')
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          to={isLogin ? '/register' : '/login'}
          search={{ redirect: redirectTo }}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {isLogin ? t('auth.switchToRegister') : t('auth.switchToLogin')}
        </Link>
      </p>
    </form>
  )
}
