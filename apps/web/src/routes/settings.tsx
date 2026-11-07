import { createFileRoute } from '@tanstack/react-router'
import { usePreferences } from '@/components/preferences-provider'
import { SettingsForm } from '@/components/settings/settings-form'
import { requireUser } from '@/lib/require-user'
import { listRoles } from '@/server/catalog.functions'

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ location }) => requireUser(location.href),
  loader: async () => ({ roles: await listRoles() }),
  component: SettingsPage,
})

function SettingsPage() {
  const { t } = usePreferences()
  const { user } = Route.useRouteContext()
  const { roles } = Route.useLoaderData()

  return (
    <div className="mx-auto max-w-[820px] px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('settings.subtitle')}</p>

      <SettingsForm user={user} roles={roles} />
    </div>
  )
}
