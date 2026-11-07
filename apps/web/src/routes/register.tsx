import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthForm } from '@/components/auth/auth-form'
import { usePreferences } from '@/components/preferences-provider'
import { safeRedirect } from '@/lib/auth-redirect'
import { fetchSessionUser } from '@/server/auth.functions'

export const Route = createFileRoute('/register')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const user = await fetchSessionUser()

    if (user) throw redirect({ to: '/' })

    return { redirectTo: safeRedirect(search.redirect) }
  },
  component: RegisterPage,
})

function RegisterPage() {
  const { t } = usePreferences()
  const { redirectTo } = Route.useRouteContext()

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight">{t('auth.registerTitle')}</h1>
      <p className="mt-2 text-muted-foreground">{t('auth.registerSubtitle')}</p>

      <div className="mt-8 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <AuthForm mode="register" redirectTo={redirectTo} />
      </div>

      <p className="mt-6 text-sm text-muted-foreground">{t('auth.guestNote')}</p>
    </div>
  )
}
